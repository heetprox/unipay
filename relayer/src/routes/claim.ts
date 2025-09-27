import { type Request, type Response, Router } from "express";
import { parseEther, parseUnits, stringToHex } from "viem";
import prisma from "../config/database";
import {
  account,
  getChain,
  getChainConfig,
  getPublicClient,
  getRelayerContract,
  getTicketContract,
  getWalletClient,
  isChainSupported,
} from "../config/web3";
import { claimEthSchema, claimUsdcSchema } from "../schemas/validation";
import type { SupportedChainId } from "../types/chains";

const router: Router = Router();

router.post("/usdc", async (req: Request, res: Response) => {
  try {
    const validatedData = claimUsdcSchema.parse(req.body);
    const { chainId, transactionId, user, ethAmount, minimumUSDCOutput, deadline } = validatedData;

    // Validate chain is supported
    if (!isChainSupported(chainId)) {
      return res.status(400).json({ error: `Chain ${chainId} is not supported` });
    }

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

    const mintJob = payment.jobs.find(
      (job: { method: string; status: string }) => job.method === "MINT" && job.status === "MINED"
    );
    if (!mintJob) {
      return res.status(400).json({ error: "Ticket not minted or mint failed" });
    }

    try {
      const ticketContract = getTicketContract(chainId as SupportedChainId);
      const relayerContract = getRelayerContract(chainId as SupportedChainId);
      const walletClient = getWalletClient(chainId as SupportedChainId);
      const config = getChainConfig(chainId as SupportedChainId);

      const txHash = stringToHex(transactionId, { size: 32 });
      const ticketOwner = await ticketContract.read.ownerOfTxn([txHash]);

      if (ticketOwner.toLowerCase() !== config.relayerContract.toLowerCase()) {
        return res.status(400).json({ error: "Ticket not owned by relayer contract" });
      }

      const chain = getChain(chainId as SupportedChainId);
      const hash = await relayerContract.write.swapETHToUSDC(
        [
          txHash,
          user as `0x${string}`,
          parseEther(ethAmount),
          parseUnits(minimumUSDCOutput, 6),
          BigInt(deadline),
        ],
        {
          account: account.address,
          chain,
        }
      );

      await prisma.job.create({
        data: {
          transactionId,
          method: "CLAIM_USDC",
          status: "PENDING",
          chainId,
          txHash: hash,
        },
      });

      const publicClient = getPublicClient(chainId as SupportedChainId);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      await prisma.job.updateMany({
        where: {
          transactionId,
          method: "CLAIM_USDC",
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
        message: "USDC claim successful",
        chainId,
        txHash: hash,
        blockNumber: Number(receipt.blockNumber),
      });
    } catch (contractError) {
      console.error("Contract interaction error:", contractError);

      await prisma.job.create({
        data: {
          transactionId,
          method: "CLAIM_USDC",
          status: "FAILED",
          chainId,
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
    console.error("Claim USDC error:", error);
    res.status(500).json({ error: "Failed to process claim" });
  }
});

router.post("/eth", async (req: Request, res: Response) => {
  try {
    const validatedData = claimEthSchema.parse(req.body);
    const { chainId, transactionId, user, usdcAmount, minimumETHOutput, deadline } = validatedData;

    // Validate chain is supported
    if (!isChainSupported(chainId)) {
      return res.status(400).json({ error: `Chain ${chainId} is not supported` });
    }

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

    const mintJob = payment.jobs.find(
      (job: { method: string; status: string }) => job.method === "MINT" && job.status === "MINED"
    );
    if (!mintJob) {
      return res.status(400).json({ error: "Ticket not minted or mint failed" });
    }

    try {
      const ticketContract = getTicketContract(chainId as SupportedChainId);
      const relayerContract = getRelayerContract(chainId as SupportedChainId);
      const walletClient = getWalletClient(chainId as SupportedChainId);
      const config = getChainConfig(chainId as SupportedChainId);

      const txHash = stringToHex(transactionId, { size: 32 });
      const ticketOwner = await ticketContract.read.ownerOfTxn([txHash]);

      if (ticketOwner.toLowerCase() !== config.relayerContract.toLowerCase()) {
        return res.status(400).json({ error: "Ticket not owned by relayer contract" });
      }

      const chain2 = getChain(chainId as SupportedChainId);
      const hash = await relayerContract.write.swapUSDCToETH(
        [
          txHash,
          user as `0x${string}`,
          parseUnits(usdcAmount, 6),
          parseEther(minimumETHOutput),
          BigInt(deadline),
        ],
        {
          account: account.address,
          chain: chain2,
        }
      );

      await prisma.job.create({
        data: {
          transactionId,
          method: "CLAIM_ETH",
          status: "PENDING",
          chainId,
          txHash: hash,
        },
      });

      const publicClient2 = getPublicClient(chainId as SupportedChainId);
      const receipt = await publicClient2.waitForTransactionReceipt({ hash });

      await prisma.job.updateMany({
        where: {
          transactionId,
          method: "CLAIM_ETH",
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
        message: "ETH claim successful",
        chainId,
        txHash: hash,
        blockNumber: Number(receipt.blockNumber),
      });
    } catch (contractError) {
      console.error("Contract interaction error:", contractError);

      await prisma.job.create({
        data: {
          transactionId,
          method: "CLAIM_ETH",
          status: "FAILED",
          chainId,
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
    console.error("Claim ETH error:", error);
    res.status(500).json({ error: "Failed to process claim" });
  }
});

export { router as claimRoutes };
