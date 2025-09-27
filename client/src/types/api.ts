// Price API Types
export interface CurrentPricesResponse {
  success: boolean;
  prices: {
    "ETH/USD": {
      symbol: string;
      price: number;
      publishTime: number;
      confidence: number;
    };
    "USD/INR": {
      symbol: string;
      price: number;
      publishTime: number;
      confidence: number;
    };
  };
  timestamp: number;
}

export interface QuoteRequest {
  userId: string;
  inrAmount: number;
  type?: "ETH/INR" | "USD/INR";
}

export interface ETHQuoteResponse {
  success: boolean;
  quote: {
    type: "ETH/INR";
    inrAmount: number;
    outputAmount: number;
    ethPriceUsd: number;
    usdInrRate: number;
    timestamp: number;
  };
}

export interface USDQuoteResponse {
  success: boolean;
  quote: {
    type: "USD/INR";
    inrAmount: number;
    outputAmount: number;
    usdInrRate: number;
    timestamp: number;
  };
}

export interface LockQuoteRequest {
  userId: string;
  inrAmount: number;
  type?: "ETH/INR" | "USD/INR";
}

export interface LockedQuoteResponse {
  success: boolean;
  quote: {
    id: string;
    userId: string;
    type: "ETH/INR" | "USD/INR";
    inrAmount: number;
    outputAmount: number;
    usdInrRate: number;
    ethPriceUsd?: number;
    lockedAt: number;
    expiresAt: number;
    validFor: number;
  };
}

export interface GetLockedQuoteResponse {
  success: boolean;
  quote: {
    id: string;
    userId: string;
    type: "ETH/INR" | "USD/INR";
    inrAmount: number;
    outputAmount: number;
    usdInrRate: number;
    ethPriceUsd?: number;
    lockedAt: number;
    expiresAt: number;
    validFor: number;
  };
}

// UPI API Types
export interface UpiInitiateRequest {
  amount: string;
  chainId: number;
  userId: string;
  lockedQuoteId: string;
}

export interface UpiInitiateResponse {
  transactionId: string;
  intentUrl: string;
  qrCode: string;
}

export interface UpiCallbackRequest {
  transactionId: string;
  status: "success" | "failed";
}

export interface UpiCallbackSuccessResponse {
  success: true;
  message: string;
  chainId: number;
  txHash: string;
}

export interface UpiCallbackFailureResponse {
  success: true;
  message: string;
}

// Claim API Types
export interface ClaimRequest {
  transactionId: string;
}

export interface ClaimSuccessResponse {
  success: true;
  message: string;
  quoteType: "ETH/INR" | "USD/INR";
  user: string;
  outputAmount: number;
  inputAmount: number;
  minimumOutput: number;
  slippagePercent: number;
  chainId: number;
  txHash: string;
  blockNumber: number;
}

export interface ClaimErrorResponse {
  error: string;
  details?: string;
}

// Transaction Status API Types
export interface TransactionStatusResponse {
  transactionId: string;
  payment: {
    status: string;
    amount: string;
    createdAt: string;
    updatedAt: string;
  };
  jobs: Array<{
    id: string;
    method: string;
    status: string;
    chainId: number | null;
    chainName?: string;
    txHash: string | null;
    blockNumber: number | null;
    gasUsed: string | null;
    error: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
}

// Health API Types
export interface HealthResponse {
  status: "ok" | "warning" | "error";
  timestamp: string;
  chains: Array<{
    chainId: number;
    chainName: string;
    status: "ok" | "warning" | "error";
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
  }>;
  summary: {
    totalChains: number;
    healthyChains: number;
    warningChains: number;
    errorChains: number;
  };
}

// Root API Types
export interface RootResponse {
  message: string;
  version: string;
}

// Error Types
export interface ApiError {
  error: string;
  details?: any;
}

// Price Stream Types
export interface PriceStreamInitialEvent {
  type: "initial";
  prices: {
    "ETH/USD": {
      symbol: string;
      price: number;
      publishTime: number;
      confidence: number;
    };
    "USD/INR": {
      symbol: string;
      price: number;
      publishTime: number;
      confidence: number;
    };
  };
  timestamp: number;
}

export interface PriceStreamUpdateEvent {
  type: "update";
  symbol: string;
  price: {
    symbol: string;
    price: number;
    publishTime: number;
    confidence: number;
  };
  timestamp: number;
}

export interface PriceStreamPingEvent {
  type: "ping";
  timestamp: number;
}

export type PriceStreamEvent = PriceStreamInitialEvent | PriceStreamUpdateEvent | PriceStreamPingEvent;