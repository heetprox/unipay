import { randomBytes } from "node:crypto";
import { type Request, type Response, Router } from "express";
import { stringToHex } from "viem";
import prisma from "../config/database";
import {
  RELAYER_ABI,
  account,
  getChain,
  getChainConfig,
  getPublicClient,
  getRelayerContract,
  getWalletClient,
} from "../config/web3";
import { upiCallbackSchema, upiInitiateSchema } from "../schemas/validation";
import type { SupportedChainId } from "../types/chains";
import QRCode from "qrcode";

const router: Router = Router();

router.post("/initiate", async (req: Request, res: Response) => {
  try {
    const validatedData = upiInitiateSchema.parse(req.body);
    const { amount, chainId, userId, lockedQuoteId } = validatedData;

    const transactionId = randomBytes(8).toString("hex");

    const payment = await prisma.payment.create({
      data: {
        transactionId,
        status: "INITIATED",
        amount: amount.toString(),
        chainId,
        userId,
        lockedQuoteId,
      },
    });

    const redirectUrl = `https://payments.weib0.xyz?transactionId=${transactionId}`;

    const qrCode = await QRCode.toDataURL(redirectUrl);

    res.json({
      transactionId,
      intentUrl: redirectUrl,
      qrCode,
    });
  } catch (error: any) {
    if (error?.issues) {
      return res
        .status(400)
        .json({ error: "Validation failed", details: error.issues });
    }
    console.error("UPI initiate error:", error);
    res.status(500).json({ error: "Failed to initiate payment" });
  }
});

router.post("/callback", async (req: Request, res: Response) => {
  try {
    const validatedData = upiCallbackSchema.parse(req.body);
    const { transactionId, status } = validatedData;

    const existingPayment = await prisma.payment.findUnique({
      where: { transactionId },
    });

    if (!existingPayment) {
      return res.status(404).json({ error: "Payment not found" });
    }

    if (status === "success") {
      await prisma.payment.update({
        where: { transactionId },
        data: { status: "SUCCESS" },
      });

      try {
        // Use the chainId from the payment record
        if (!existingPayment.chainId) {
          return res
            .status(400)
            .json({ error: "Chain ID not found for payment" });
        }
        const relayerContract = getRelayerContract(
          existingPayment.chainId as SupportedChainId
        );
        const walletClient = getWalletClient(
          existingPayment.chainId as SupportedChainId
        );
        const txHash = stringToHex(transactionId, { size: 32 });

        console.log(walletClient.account?.address);

        // Use writeContract with full ABI instead of contract.write to avoid RPC issues
        const hash = await walletClient.writeContract({
          address: getChainConfig(existingPayment.chainId as SupportedChainId)
            .relayerContract,
          abi: RELAYER_ABI,
          functionName: "mintTicket",
          args: [txHash],
        } as any);

        await prisma.job.create({
          data: {
            transactionId,
            method: "MINT",
            status: "PENDING",
            chainId: existingPayment.chainId,
            txHash: hash,
          },
        });

        const publicClient = getPublicClient(
          existingPayment.chainId as SupportedChainId
        );
        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        await prisma.job.updateMany({
          where: {
            transactionId,
            method: "MINT",
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
          message: "Payment processed and ticket minted",
          chainId: existingPayment.chainId,
          txHash: hash,
        });
      } catch (contractError) {
        console.error("Contract interaction error:", contractError);

        await prisma.job.create({
          data: {
            transactionId,
            method: "MINT",
            status: "FAILED",
            error:
              contractError instanceof Error
                ? contractError.message
                : "Unknown contract error",
          },
        });

        res
          .status(500)
          .json({ error: "Payment updated but ticket minting failed" });
      }
    } else {
      await prisma.payment.update({
        where: { transactionId },
        data: { status: "FAILED" },
      });

      res.json({ success: true, message: "Payment marked as failed" });
    }
  } catch (error) {
    if (error instanceof Error && "issues" in error) {
      return res
        .status(400)
        .json({ error: "Validation failed", details: error.issues });
    }
    console.error("UPI callback error:", error);
    res.status(500).json({ error: "Failed to process callback" });
  }
});

export { router as upiRoutes };
