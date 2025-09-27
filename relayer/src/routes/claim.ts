import { type Request, type Response, Router } from "express";
import { parseEther, parseUnits, stringToHex } from "viem";
import prisma from "../config/database";
import {
  account,
  getChain,
  getPublicClient,
  getRelayerContract,
  getWalletClient,
  isChainSupported,
} from "../config/web3";
import { claimSchema } from "../schemas/validation";
import { priceService } from "../services/priceService";
import type { SupportedChainId } from "../types/chains";

const router: Router = Router();

router.post("/claim", async (req: Request, res: Response) => {
  try {
    const validatedData = claimSchema.parse(req.body);
    const { transactionId, user, minimumOutput, deadline } = validatedData;

    // Find the payment record
    const payment = await prisma.payment.findUnique({
      where: { transactionId },
      include: { jobs: true },
    });

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
      return res.status(400).json({ error: "Locked quote ID not found for payment" });
    }

    // Validate chain is supported
    if (!isChainSupported(payment.chainId)) {
      return res.status(400).json({ error: `Chain ${payment.chainId} is not supported` });
    }

    // Get the locked quote to determine the claim type
    const lockedQuote = await priceService.getLockedQuote(
      payment.lockedQuoteId,
      payment.userId || undefined
    );
    if (!lockedQuote) {
      return res.status(400).json({ error: "Locked quote not found or expired" });
    }

    // Check if ticket was minted
    const mintJob = payment.jobs.find(
      (job: { method: string; status: string }) => job.method === "MINT" && job.status === "MINED"
    );
    if (!mintJob) {
      return res.status(400).json({ error: "Ticket not minted or mint failed" });
    }

    try {
      const relayerContract = getRelayerContract(payment.chainId as SupportedChainId);
      const walletClient = getWalletClient(payment.chainId as SupportedChainId);
      const txHash = stringToHex(transactionId, { size: 32 });
      const chain = getChain(payment.chainId as SupportedChainId);

      let hash: `0x${string}`;
      let method: string;
      let message: string;

      if (lockedQuote.type === "ETH/INR") {
        // Swap ETH to USDC
        hash = await relayerContract.write.swapETHToUSDC(
          [
            txHash,
            user as `0x${string}`,
            parseEther(lockedQuote.outputAmount.toString()),
            parseUnits(minimumOutput, 6), // USDC has 6 decimals
            BigInt(deadline),
          ],
          {
            account: account.address,
            chain,
          }
        );
        method = "CLAIM_USDC";
        message = "USDC claim successful";
      } else {
        // USD/INR - Swap USDC to ETH
        hash = await relayerContract.write.swapUSDCToETH(
          [
            txHash,
            user as `0x${string}`,
            parseUnits(lockedQuote.outputAmount.toString(), 6), // USDC has 6 decimals
            parseEther(minimumOutput), // ETH has 18 decimals
            BigInt(deadline),
          ],
          {
            account: account.address,
            chain,
          }
        );
        method = "CLAIM_ETH";
        message = "ETH claim successful";
      }

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
      const publicClient = getPublicClient(payment.chainId as SupportedChainId);
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
        chainId: payment.chainId,
        txHash: hash,
        blockNumber: Number(receipt.blockNumber),
      });
    } catch (contractError) {
      console.error("Contract interaction error:", contractError);

      const method = lockedQuote.type === "ETH/INR" ? "CLAIM_USDC" : "CLAIM_ETH";
      await prisma.job.create({
        data: {
          transactionId,
          method: method as "CLAIM_USDC" | "CLAIM_ETH",
          status: "FAILED",
          chainId: payment.chainId,
          error: contractError instanceof Error ? contractError.message : "Unknown contract error",
        },
      });

      res.status(500).json({
        error: "Claim failed",
        details: contractError instanceof Error ? contractError.message : "Unknown error",
      });
    }
  } catch (error) {
    if (error instanceof Error && "issues" in error) {
      return res.status(400).json({ error: "Validation failed", details: error.issues });
    }
    console.error("Claim error:", error);
    res.status(500).json({ error: "Failed to process claim" });
  }
});

export { router as claimRoutes };
