import { type Request, type Response, Router } from "express";
import prisma from "../config/database";
import { getChain, isChainSupported } from "../config/web3";

interface JobData {
  id: string;
  method: string;
  status: string;
  chainId: number | null;
  txHash: string | null;
  blockNumber: number | null;
  gasUsed: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const router: Router = Router();

router.get("/:transactionId", async (req: Request, res: Response) => {
  try {
    const { transactionId } = req.params;

    if (!transactionId) {
      return res.status(400).json({ error: "Transaction ID is required" });
    }

    const payment = await prisma.payment.findUnique({
      where: { transactionId },
      include: {
        jobs: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!payment) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    const response = {
      transactionId,
      payment: {
        status: payment.status,
        amount: payment.amount,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      },
      jobs: payment.jobs.map((job: JobData) => {
        const chainInfo =
          job.chainId && isChainSupported(job.chainId)
            ? { chainName: getChain(job.chainId).name }
            : {};

        return {
          id: job.id,
          method: job.method,
          status: job.status,
          chainId: job.chainId,
          ...chainInfo,
          txHash: job.txHash,
          blockNumber: job.blockNumber,
          gasUsed: job.gasUsed,
          error: job.error,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
        };
      }),
    };

    res.json(response);
  } catch (error) {
    console.error("Status check error:", error);
    res.status(500).json({ error: "Failed to fetch transaction status" });
  }
});

export { router as statusRoutes };
