import { type Request, type Response, Router } from "express";
import { parseEther, parseUnits, stringToHex, keccak256 } from "viem";
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

      let hash: `0x${string}` | undefined;
      let method: string | undefined;
      let message: string | undefined;
      let useQuoteBased = false;

      // Try Pyth oracle quote-based swap first if available
      if (priceService.isPythEnabled() && lockedQuote.isOnChain) {
        try {
          console.log("Attempting quote-based swap with Pyth oracle...");

          // Convert string quote ID to bytes32 for contract call
          const quoteIdBytes32 = keccak256(
            `0x${Buffer.from(payment.lockedQuoteId).toString("hex")}`
          );

          // Use the new swapWithQuote function
          hash = await walletClient.writeContract({
            address: getChainConfig(payment.chainId as SupportedChainId)
              .relayerContract,
            abi: RELAYER_ABI,
            functionName: "swapWithQuote",
            args: [quoteIdBytes32, txHash],
          } as any);

          method =
            lockedQuote.type === "ETH/INR"
              ? "CLAIM_ETH_QUOTE"
              : "CLAIM_USDC_QUOTE";
          message = `${
            lockedQuote.type === "ETH/INR" ? "ETH" : "USDC"
          } claim successful (Pyth oracle)`;
          useQuoteBased = true;

          console.log("Quote-based swap successful:", {
            quoteId: payment.lockedQuoteId,
            txHash: hash,
          });
        } catch (quoteError) {
          console.error(
            "Quote-based swap failed, falling back to traditional method:",
            quoteError
          );
          // Will fallback to traditional swap below
        }
      }

      // Fallback to traditional swap method if quote-based failed or not available
      if (!useQuoteBased) {
        console.log("Using traditional swap method...");

        // Predefined deadline (e.g., 30 minutes from now)
        const deadline = Math.floor(Date.now() / 1000) + 30 * 60; // 30 minutes

        if (lockedQuote.type === "ETH/INR") {
          // Swap USDC to ETH - use inputAmount (USDC) as input, outputAmount (ETH) as minimum output
          const minimumETHOutput =
            lockedQuote.outputAmount * (1 - slippagePercent);

          // Use raw values for on-chain quotes, parsed values for database quotes
          const usdcInputAmount =
            lockedQuote.isOnChain && lockedQuote.rawInputAmount
              ? lockedQuote.rawInputAmount
              : parseUnits(lockedQuote.inputAmount.toString(), 6);

          const ethOutputAmount =
            lockedQuote.isOnChain && lockedQuote.rawOutputAmount
              ? BigInt(
                  Math.floor(
                    Number(lockedQuote.rawOutputAmount) * (1 - slippagePercent)
                  )
                )
              : parseEther(minimumETHOutput.toString());

          hash = await walletClient.writeContract({
            address: getChainConfig(payment.chainId as SupportedChainId)
              .relayerContract,
            abi: RELAYER_ABI,
            functionName: "swapUSDCToETH",
            args: [
              txHash,
              user as `0x${string}`,
              usdcInputAmount,
              ethOutputAmount,
            ],
          } as any);
          method = "CLAIM_ETH";
          message = "ETH claim successful (traditional)";
        } else {
          // USD/INR - Swap ETH to USDC - use inputAmount (ETH) as input, outputAmount (USDC) as minimum output
          const minimumUSDCOutput =
            lockedQuote.outputAmount * (1 - slippagePercent);

          // Use raw values for on-chain quotes, parsed values for database quotes
          const ethInputAmount =
            lockedQuote.isOnChain && lockedQuote.rawInputAmount
              ? lockedQuote.rawInputAmount
              : parseEther(lockedQuote.inputAmount.toString());

          const usdcOutputAmount =
            lockedQuote.isOnChain && lockedQuote.rawOutputAmount
              ? BigInt(
                  Math.floor(
                    Number(lockedQuote.rawOutputAmount) * (1 - slippagePercent)
                  )
                )
              : parseUnits(minimumUSDCOutput.toString(), 6);

          hash = await walletClient.writeContract({
            address: getChainConfig(payment.chainId as SupportedChainId)
              .relayerContract,
            abi: RELAYER_ABI,
            functionName: "swapETHToUSDC",
            args: [
              txHash,
              user as `0x${string}`,
              ethInputAmount,
              usdcOutputAmount,
            ],
          } as any);
          method = "CLAIM_USDC";
          message = "USDC claim successful (traditional)";
        }
      }

      // Ensure all required variables are set
      if (!hash || !method || !message) {
        throw new Error(
          "Failed to execute swap - no valid swap method succeeded"
        );
      }

      const publicClient = getPublicClient(payment.chainId as SupportedChainId);

      // Record the pending job
      await prisma.job.create({
        data: {
          transactionId,
          method: method as
            | "CLAIM_USDC"
            | "CLAIM_ETH"
            | "CLAIM_ETH_QUOTE"
            | "CLAIM_USDC_QUOTE",
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
          method: method as
            | "CLAIM_USDC"
            | "CLAIM_ETH"
            | "CLAIM_ETH_QUOTE"
            | "CLAIM_USDC_QUOTE",
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
        swapMethod: useQuoteBased ? "pyth-oracle" : "traditional",
        isOnChainQuote: lockedQuote.isOnChain || false,
        pythEnabled: priceService.isPythEnabled(),
      });
    } catch (contractError) {
      console.error("Contract interaction error:", contractError);

      const method =
        lockedQuote.type === "ETH/INR" ? "CLAIM_ETH" : "CLAIM_USDC";
      await prisma.job.create({
        data: {
          transactionId,
          method: method as
            | "CLAIM_USDC"
            | "CLAIM_ETH"
            | "CLAIM_ETH_QUOTE"
            | "CLAIM_USDC_QUOTE",
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
