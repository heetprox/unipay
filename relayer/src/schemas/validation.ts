import { z } from "zod";

export const upiInitiateSchema = z.object({
  amount: z.string().min(1, "Amount is required"),
  chainId: z.number().int().min(1, "Valid chain ID required"),
  userId: z.string().min(1, "User ID is required"),
  lockedQuoteId: z.string().min(1, "Locked quote ID is required"),
});

export const upiCallbackSchema = z.object({
  transactionId: z.string().min(1, "Transaction ID is required"),
  status: z.enum(["success", "failed"]),
});

export const claimSchema = z.object({
  transactionId: z.string().min(1, "Transaction ID is required"),
  user: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Valid Ethereum address required"),
  minimumOutput: z.string().min(1, "Minimum output is required"),
  deadline: z
    .number()
    .int()
    .min(Math.floor(Date.now() / 1000), "Deadline must be in the future"),
});

export type UpiInitiateRequest = z.infer<typeof upiInitiateSchema>;
export type UpiCallbackRequest = z.infer<typeof upiCallbackSchema>;
export type ClaimRequest = z.infer<typeof claimSchema>;
