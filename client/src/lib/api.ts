import { apiClient } from './services';
import type {
  CurrentPricesResponse,
  QuoteRequest,
  ETHQuoteResponse,
  USDQuoteResponse,
  LockQuoteRequest,
  LockedQuoteResponse,
  GetLockedQuoteResponse,
  UpiInitiateRequest,
  UpiInitiateResponse,
  UpiCallbackRequest,
  UpiCallbackSuccessResponse,
  UpiCallbackFailureResponse,
  ClaimRequest,
  ClaimSuccessResponse,
  ClaimErrorResponse,
  TransactionStatusResponse,
  HealthResponse,
  RootResponse,
  ApiError,
} from '../types/api';

export class UniPayAPI {
  // Root endpoint
  static async getRoot(): Promise<RootResponse> {
    try {
      const response = await apiClient.get<RootResponse>('/');
      return response.data;
    } catch (error: any) {
      throw this.handleError(error);
    }
  }

  // Price API Methods
  static async getCurrentPrices(): Promise<CurrentPricesResponse> {
    try {
      const response = await apiClient.get<CurrentPricesResponse>('/price/current');
      return response.data;
    } catch (error: any) {
      throw this.handleError(error);
    }
  }

  static async getQuote(data: QuoteRequest): Promise<ETHQuoteResponse | USDQuoteResponse> {
    try {
      const response = await apiClient.post<ETHQuoteResponse | USDQuoteResponse>('/price/quote', data);
      return response.data;
    } catch (error: any) {
      throw this.handleError(error);
    }
  }

  static async lockQuote(data: LockQuoteRequest): Promise<LockedQuoteResponse> {
    try {
      const response = await apiClient.post<LockedQuoteResponse>('/price/quote/lock', data);
      return response.data;
    } catch (error: any) {
      throw this.handleError(error);
    }
  }

  static async getLockedQuote(quoteId: string, userId: string): Promise<GetLockedQuoteResponse> {
    try {
      const response = await apiClient.get<GetLockedQuoteResponse>(`/price/quote/${quoteId}?userId=${userId}`);
      return response.data;
    } catch (error: any) {
      throw this.handleError(error);
    }
  }

  // Price Stream (Server-Sent Events)
  static createPriceStream(): EventSource {
    const baseURL = apiClient.defaults.baseURL || 'http://localhost:3000';
    // Remove trailing slash to avoid double slashes
    const cleanBaseURL = baseURL.replace(/\/$/, '');
    const streamURL = `${cleanBaseURL}/price/stream`;
    
    console.log('Creating EventSource with URL:', streamURL);
    
    return new EventSource(streamURL, {
      withCredentials: false
    });
  }

  // UPI Payment Methods
  static async initiateUpiPayment(data: UpiInitiateRequest): Promise<UpiInitiateResponse> {
    try {
      const response = await apiClient.post<UpiInitiateResponse>('/upi/initiate', data);
      return response.data;
    } catch (error: any) {
      throw this.handleError(error);
    }
  }

  static async handleUpiCallback(data: UpiCallbackRequest): Promise<UpiCallbackSuccessResponse | UpiCallbackFailureResponse> {
    try {
      const response = await apiClient.post<UpiCallbackSuccessResponse | UpiCallbackFailureResponse>('/upi/callback', data);
      return response.data;
    } catch (error: any) {
      throw this.handleError(error);
    }
  }

  static async initiateClaim(data: ClaimRequest): Promise<ClaimSuccessResponse> {
    try {
      const response = await apiClient.post<ClaimSuccessResponse>('/claim/init', data);
      return response.data;
    } catch (error: any) {
      throw this.handleError(error);
    }
  }

  // Transaction Status
  static async getTransactionStatus(transactionId: string): Promise<TransactionStatusResponse> {
    try {
      const response = await apiClient.get<TransactionStatusResponse>(`/tx/${transactionId}`);
      return response.data;
    } catch (error: any) {
      throw this.handleError(error);
    }
  }

  // Health Check
  static async getHealthStatus(): Promise<HealthResponse> {
    try {
      const response = await apiClient.get<HealthResponse>('/health');
      return response.data;
    } catch (error: any) {
      throw this.handleError(error);
    }
  }

  // Error Handler
  private static handleError(error: any): Error {
    if (error.response?.data) {
      const apiError: ApiError = error.response.data;
      return new Error(apiError.error || 'API request failed');
    }
    return new Error(error.message || 'Network error');
  }
}