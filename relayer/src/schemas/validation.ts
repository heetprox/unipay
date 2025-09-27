import { z } from "zod";

export const upiInitiateSchema = z.object({
  amount: z.string().min(1, "Amount is required"),
  chainId: z.number().int().min(1, "Valid chain ID required"),
});

export const upiCallbackSchema = z.object({
  transactionId: z.string().min(1, "Transaction ID is required"),
  status: z.enum(["success", "failed"]),
});

export const claimUsdcSchema = z.object({
  chainId: z.number().int().min(1, "Valid chain ID required"),
  transactionId: z.string().min(1, "Transaction ID is required"),
  user: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Valid Ethereum address required"),
  ethAmount: z.string().min(1, "ETH amount is required"),
  minimumUSDCOutput: z.string().min(1, "Minimum USDC output is required"),
  deadline: z
    .number()
    .int()
    .min(Math.floor(Date.now() / 1000), "Deadline must be in the future"),
});

export const claimEthSchema = z.object({
  chainId: z.number().int().min(1, "Valid chain ID required"),
  transactionId: z.string().min(1, "Transaction ID is required"),
  user: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Valid Ethereum address required"),
  usdcAmount: z.string().min(1, "USDC amount is required"),
  minimumETHOutput: z.string().min(1, "Minimum ETH output is required"),
  deadline: z
    .number()
    .int()
    .min(Math.floor(Date.now() / 1000), "Deadline must be in the future"),
});

export type UpiInitiateRequest = z.infer<typeof upiInitiateSchema>;
export type UpiCallbackRequest = z.infer<typeof upiCallbackSchema>;
export type ClaimUsdcRequest = z.infer<typeof claimUsdcSchema>;
export type ClaimEthRequest = z.infer<typeof claimEthSchema>;
