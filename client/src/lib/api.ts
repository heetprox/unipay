import { apiClient } from './services';
import type {
  UpiInitiateRequest,
  UpiInitiateResponse,
  UpiCallbackRequest,
  UpiCallbackResponse,
  ClaimUsdcRequest,
  ClaimEthRequest,
  ClaimResponse,
  HealthResponse,
  Payment,
  ApiError,
} from '../types/api';

export class UniPayAPI {
  // UPI Payment Methods
  static async initiateUpiPayment(data: UpiInitiateRequest): Promise<UpiInitiateResponse> {
    try {
      const response = await apiClient.post<UpiInitiateResponse>('/upi/initiate', data);
      return response.data;
    } catch (error: any) {
      throw this.handleError(error);
    }
  }

  static async handleUpiCallback(data: UpiCallbackRequest): Promise<UpiCallbackResponse> {
    try {
      const response = await apiClient.post<UpiCallbackResponse>('/upi/callback', data);
      return response.data;
    } catch (error: any) {
      throw this.handleError(error);
    }
  }

  // Claim Methods
  static async claimUsdc(data: ClaimUsdcRequest): Promise<ClaimResponse> {
    try {
      const response = await apiClient.post<ClaimResponse>('/claim/usdc', data);
      return response.data;
    } catch (error: any) {
      throw this.handleError(error);
    }
  }

  static async claimEth(data: ClaimEthRequest): Promise<ClaimResponse> {
    try {
      const response = await apiClient.post<ClaimResponse>('/claim/eth', data);
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

  // Transaction Status
  static async getTransactionStatus(transactionId: string): Promise<Payment> {
    try {
      const response = await apiClient.get<Payment>(`/tx/${transactionId}`);
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