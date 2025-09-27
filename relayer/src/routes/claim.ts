import { type Request, type Response, Router } from "express";
import { parseEther, parseUnits, stringToHex } from "viem";
import prisma from "../config/database";
import {
  RELAYER_ABI,
  account,
  getChain,
  getChainConfig,
  getPublicClient,
  getRelayerContract,
  getWalletClient,
  isChainSupported,
} from "../config/web3";
import { claimSchema } from "../schemas/validation";
import { priceService } from "../services/priceService";
import type { SupportedChainId } from "../types/chains";

const router: Router = Router();

router.post("/init", async (req: Request, res: Response) => {
  try {
    const validatedData = claimSchema.parse(req.body);
    const { transactionId } = validatedData;

    // Find the payment record
    const payment = await prisma.payment.findUnique({
      where: { transactionId },
      include: { jobs: true },
    });

    console.log(payment?.userId);

    if (!payment) {
      return res.status(404).json({ error: "Payment not found" });
    }

    if (payment.status !== "SUCCESS") {
      return res.status(400).json({ error: "Payment not successful" });
    }

    if (!payment.chainId) {
      return res.status(400).json({ error: "Chain ID not found for payment" });
    }

    if (!payment.lockedQuoteId) {
      return res
        .status(400)
        .json({ error: "Locked quote ID not found for payment" });
    }

    // Validate chain is supported
    if (!isChainSupported(payment.chainId)) {
      return res
        .status(400)
        .json({ error: `Chain ${payment.chainId} is not supported` });
    }

    // Get the locked quote to determine the claim type
    const lockedQuote = await priceService.getLockedQuote(
      payment.lockedQuoteId,
      payment.userId || undefined
    );
    if (!lockedQuote) {
      return res
        .status(400)
        .json({ error: "Locked quote not found or expired" });
    }

    // Check if ticket was minted
    const mintJob = payment.jobs.find(
      (job: { method: string; status: string }) =>
        job.method === "MINT" && job.status === "MINED"
    );
    if (!mintJob) {
      return res
        .status(400)
        .json({ error: "Ticket not minted or mint failed" });
    }

    try {
      const relayerContract = getRelayerContract(
        payment.chainId as SupportedChainId
      );
      const walletClient = getWalletClient(payment.chainId as SupportedChainId);
      const txHash = stringToHex(transactionId, { size: 32 });
      const chain = getChain(payment.chainId as SupportedChainId);

      // Use the userId from the locked quote as the user address
      const user = lockedQuote.userId; // Assuming userId is the Ethereum address

      // Calculate minimum output with some slippage protection (e.g., 5% slippage)
      const slippagePercent = 0.5; // 5% slippage

      // Predefined deadline (e.g., 30 minutes from now)
      const deadline = Math.floor(Date.now() / 1000) + 30 * 60; // 30 minutes

      let hash: `0x${string}`;
      let method: string;
      let message: string;

      if (lockedQuote.type === "ETH/INR") {
        // Swap USDC to ETH - use inputAmount (USDC) as input, outputAmount (ETH) as minimum output
        const minimumETHOutput =
          lockedQuote.outputAmount * (1 - slippagePercent);

        hash = await walletClient.writeContract({
          address: getChainConfig(payment.chainId as SupportedChainId)
            .relayerContract,
          abi: RELAYER_ABI,
          functionName: "swapUSDCToETH",
          args: [
            txHash,
            user as `0x${string}`,
            parseUnits(lockedQuote.inputAmount.toString(), 6), // USDC input amount (6 decimals)
            parseEther(minimumETHOutput.toString()), // Minimum ETH output (18 decimals)
          ],
        } as any);
        method = "CLAIM_ETH";
        message = "ETH claim successful";
      } else {
        // USD/INR - Swap ETH to USDC - use inputAmount (ETH) as input, outputAmount (USDC) as minimum output
        const minimumUSDCOutput =
          lockedQuote.outputAmount * (1 - slippagePercent);

        hash = await walletClient.writeContract({
          address: getChainConfig(payment.chainId as SupportedChainId)
            .relayerContract,
          abi: RELAYER_ABI,
          functionName: "swapETHToUSDC",
          args: [
            txHash,
            user as `0x${string}`,
            parseEther(lockedQuote.inputAmount.toString()), // ETH input amount (18 decimals)
            parseUnits(minimumUSDCOutput.toString(), 6), // Minimum USDC output (6 decimals)
          ],
        } as any);
        method = "CLAIM_USDC";
        message = "USDC claim successful";
      }

      const publicClient = getPublicClient(payment.chainId as SupportedChainId);

      // Record the pending job
      await prisma.job.create({
        data: {
          transactionId,
          method: method as "CLAIM_USDC" | "CLAIM_ETH",
          status: "PENDING",
          chainId: payment.chainId,
          txHash: hash,
        },
      });

      // Wait for transaction receipt
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      // Update job status
      await prisma.job.updateMany({
        where: {
          transactionId,
          method: method as "CLAIM_USDC" | "CLAIM_ETH",
          txHash: hash,
        },
        data: {
          status: "MINED",
          blockNumber: Number(receipt.blockNumber),
          gasUsed: receipt.gasUsed.toString(),
        },
      });

      res.json({
        success: true,
        message,
        quoteType: lockedQuote.type,
        user,
        outputAmount: lockedQuote.outputAmount,
        inputAmount: lockedQuote.inputAmount,
        minimumOutput:
          lockedQuote.type === "ETH/INR"
            ? lockedQuote.outputAmount * (1 - slippagePercent)
            : lockedQuote.outputAmount * (1 - slippagePercent),
        slippagePercent,
        chainId: payment.chainId,
        txHash: hash,
        blockNumber: Number(receipt.blockNumber),
      });
    } catch (contractError) {
      console.error("Contract interaction error:", contractError);

      const method =
        lockedQuote.type === "ETH/INR" ? "CLAIM_USDC" : "CLAIM_ETH";
      await prisma.job.create({
        data: {
          transactionId,
          method: method as "CLAIM_USDC" | "CLAIM_ETH",
          status: "FAILED",
          chainId: payment.chainId,
          error:
            contractError instanceof Error
              ? contractError.message
              : "Unknown contract error",
        },
      });

      res.status(500).json({
        error: "Claim failed",
        details:
          contractError instanceof Error
            ? contractError.message
            : "Unknown error",
      });
    }
  } catch (error) {
    if (error instanceof Error && "issues" in error) {
      return res
        .status(400)
        .json({ error: "Validation failed", details: error.issues });
    }
    console.error("Claim error:", error);
    res.status(500).json({ error: "Failed to process claim" });
  }
});

export { router as claimRoutes };
