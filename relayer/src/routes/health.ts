import { type Request, type Response, Router } from "express";
import {
  account,
  getChain,
  getChainConfig,
  getPublicClient,
  getRelayerContract,
  getSupportedChainIds,
} from "../config/web3";
import type { SupportedChainId } from "../types/chains";

const router: Router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const supportedChainIds = getSupportedChainIds();
    const chainHealths = await Promise.allSettled(
      supportedChainIds.map(async (chainId: SupportedChainId) => {
        try {
          const relayerContract = getRelayerContract(chainId);
          const publicClient = getPublicClient(chainId);
          const chain = getChain(chainId);
          const config = getChainConfig(chainId);

          const [isAuthorized, isPaused, walletBalance] = await Promise.all([
            relayerContract.read.authorizedRelayers([account.address]),
            relayerContract.read.contractPaused(),
            publicClient.getBalance({ address: account.address }),
          ]);

          return {
            chainId,
            chainName: chain.name,
            status: isPaused ? "error" : isAuthorized ? "ok" : "warning",
            relayer: {
              address: account.address,
              authorized: isAuthorized,
              balance: walletBalance.toString(),
            },
            contract: {
              relayerAddress: config.relayerContract,
              ticketNftAddress: config.ticketNftContract,
              paused: isPaused,
            },
          };
        } catch (error) {
          const chain = getChain(chainId);
          return {
            chainId,
            chainName: chain.name,
            status: "error",
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      })
    );

    const chains = chainHealths.map((result, index) => {
      const baseChain = { chainId: supportedChainIds[index] };
      if (result.status === "fulfilled") {
        return { ...baseChain, ...result.value };
      }
      return {
        ...baseChain,
        status: "error",
        error: result.reason?.message || "Failed to check chain health",
      };
    });

    const overallStatus = chains.some((chain) => chain.status === "error")
      ? "error"
      : chains.some((chain) => chain.status === "warning")
        ? "warning"
        : "ok";

    const health = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      chains,
      summary: {
        totalChains: supportedChainIds.length,
        healthyChains: chains.filter((c) => c.status === "ok").length,
        warningChains: chains.filter((c) => c.status === "warning").length,
        errorChains: chains.filter((c) => c.status === "error").length,
      },
    };

    const statusCode = overallStatus === "ok" ? 200 : overallStatus === "warning" ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    console.error("Health check error:", error);
    res.status(503).json({
      status: "error",
      timestamp: new Date().toISOString(),
      error: "Failed to check multi-chain contract status",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export { router as healthRoutes };
