// Chain Types
export type SupportedChainId = 1 | 8453 | 1301; // Mainnet, Base, Unichain

export interface ChainInfo {
  chainId: SupportedChainId;
  chainName: string;
  status: 'ok' | 'warning' | 'error';
  relayer?: {
    address: string;
    authorized: boolean;
    balance: string;
  };
  contract?: {
    relayerAddress: string;
    ticketNftAddress: string;
    paused: boolean;
  };
  error?: string;
}

export interface UpiInitiateRequest {
  amount: string;
  tokenSymbol?: string;
  tokenAddress?: string;
}

export interface UpiInitiateResponse {
  transactionId: string;
  intentUrl: string;
  qrCode: string;
}

export interface UpiCallbackRequest {
  transactionId: string;
  status: 'success' | 'failed';
}

export interface UpiCallbackResponse {
  success: boolean;
  message: string;
  chainId?: number;
  txHash?: string;
}

export interface ClaimUsdcRequest {
  chainId: number;
  transactionId: string;
  user: string; 
  ethAmount: string;
  minimumUSDCOutput: string;
  deadline: number; 
}

export interface ClaimEthRequest {
  chainId: number;
  transactionId: string;
  user: string; // address
  usdcAmount: string;
  minimumETHOutput: string;
  deadline: number; 
}

export interface ClaimResponse {
  success: boolean;
  message: string;
  chainId: number;
  txHash: string;
  blockNumber: number;
}

export interface HealthResponse {
  status: 'ok' | 'warning' | 'error';
  timestamp: string;
  chains: ChainInfo[];
  summary: {
    totalChains: number;
    healthyChains: number;
    warningChains: number;
    errorChains: number;
  };
}

export interface Job {
  id: number;
  transactionId: string;
  method: 'MINT' | 'CLAIM_USDC' | 'CLAIM_ETH';
  status: 'PENDING' | 'MINED' | 'FAILED';
  chainId: number;
  txHash?: string;
  blockNumber?: number;
  gasUsed?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  transactionId: string;
  status: 'INITIATED' | 'SUCCESS' | 'FAILED';
  amount: string;
  createdAt: string;
  updatedAt: string;
  jobs: Job[];
}

export interface ApiError {
  error: string;
  details?: any;
}