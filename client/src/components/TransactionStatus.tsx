'use client';

import { useState, useEffect } from 'react';
import { UniPayAPI } from '@/lib/api';
import type { TransactionStatusResponse } from '@/types/api';
import { RefreshCw, ExternalLink, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface TransactionStatusProps {
  transactionId: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export default function TransactionStatus({ 
  transactionId, 
  autoRefresh = true, 
  refreshInterval = 5000 
}: TransactionStatusProps) {
  const [transaction, setTransaction] = useState<TransactionStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchStatus = async () => {
    try {
      const response = await UniPayAPI.getTransactionStatus(transactionId);
      setTransaction(response);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();

    if (autoRefresh) {
      const interval = setInterval(fetchStatus, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [transactionId, autoRefresh, refreshInterval]);

  const getStatusColor = (status: string) => {
    switch (status.toUpperCase()) {
      case 'SUCCESS':
      case 'MINED':
        return 'text-green-400 bg-green-900/20 border-green-700';
      case 'PENDING':
      case 'INITIATED':
        return 'text-yellow-400 bg-yellow-900/20 border-yellow-700';
      case 'FAILED':
        return 'text-red-400 bg-red-900/20 border-red-700';
      default:
        return 'text-gray-400 bg-gray-900/20 border-gray-700';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toUpperCase()) {
      case 'SUCCESS':
      case 'MINED':
        return <CheckCircle className="w-4 h-4" />;
      case 'PENDING':
      case 'INITIATED':
        return <Clock className="w-4 h-4" />;
      case 'FAILED':
        return <XCircle className="w-4 h-4" />;
      default:
        return <AlertCircle className="w-4 h-4" />;
    }
  };

  const getExplorerUrl = (chainId: number | null, txHash: string | null) => {
    if (!chainId || !txHash) return null;
    
    const explorers: Record<number, string> = {
      1: 'https://etherscan.io',
      8453: 'https://basescan.org',
      1301: 'https://sepolia.uniscan.xyz'
    };
    
    const baseUrl = explorers[chainId] || 'https://etherscan.io';
    return `${baseUrl}/tx/${txHash}`;
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-6 bg-white/10 backdrop-blur-md rounded-lg shadow-md">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200/20 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-gray-200/20 rounded w-1/2 mb-2"></div>
          <div className="h-4 bg-gray-200/20 rounded w-3/4 mb-2"></div>
          <div className="h-4 bg-gray-200/20 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto p-6 bg-white/10 backdrop-blur-md rounded-lg shadow-md">
        <div className="p-3 bg-red-100/20 border border-red-400 text-red-200 rounded flex items-center gap-2">
          <XCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (!transaction) {
    return (
      <div className="max-w-2xl mx-auto p-6 bg-white/10 backdrop-blur-md rounded-lg shadow-md">
        <p className="text-gray-300">No transaction data found</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto  bg-white/10 backdrop-blur-md rounded-lg shadow-md text-white">
      
      {transaction.payment.status === 'SUCCESS' && (
        <div className="my-6 p-4 bg-green-900/20 border border-green-700 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-5 h-5 text-green-400" />
            <span className="font-medium text-green-300">Payment Successful!</span>
          </div>
          <p className="text-sm text-gray-300 mb-3">
            Your UPI payment has been processed. You can now claim your tokens.
          </p>
          <button
            onClick={() => window.location.href = `/claim?txId=${transaction.transactionId}`}
            className="bg-[#9478FC] text-white py-2 px-4 rounded-md hover:bg-[#7d63d4] transition-colors"
          >
            Claim Tokens
          </button>
        </div>
      )}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Transaction Status</h2>
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin' : ''}`} />
          <span>Last updated: {lastUpdated.toLocaleTimeString()}</span>
        </div>
      </div>
      
      {/* Payment Information */}
      <div className="mb-6 p-4 bg-white/5 rounded-lg">
        <h3 className="text-lg font-semibold mb-3">Payment Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-300">Transaction ID</p>
            <p className="font-mono text-sm break-all">{transaction.transactionId}</p>
          </div>
          <div>
            <p className="text-sm text-gray-300">Amount</p>
            <p className="font-semibold">₹{transaction.payment.amount}</p>
            {localStorage.getItem('quoteType') && (
              <p className="text-sm text-gray-300 mt-1">
                Type: {localStorage.getItem('quoteType')}
              </p>
            )}
          </div>
          <div>
            <p className="text-sm text-gray-300">Payment Status</p>
            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(transaction.payment.status)}`}>
              {getStatusIcon(transaction.payment.status)}
              {transaction.payment.status}
            </div>
          </div>
          <div>
            <p className="text-sm text-gray-300">Created</p>
            <p className="text-sm">{new Date(transaction.payment.createdAt).toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Jobs Information */}
      {transaction.jobs.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3">Blockchain Jobs</h3>
          <div className="space-y-3">
            {transaction.jobs.map((job) => (
              <div key={job.id} className="border border-gray-700 rounded-lg p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <span className="font-medium text-lg">{job.method}</span>
                    {job.chainName && (
                      <p className="text-sm text-gray-300">{job.chainName}</p>
                    )}
                  </div>
                  <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(job.status)}`}>
                    {getStatusIcon(job.status)}
                    {job.status}
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  {job.chainId && (
                    <div>
                      <span className="text-gray-300">Chain ID:</span>
                      <span className="ml-2">{job.chainId}</span>
                    </div>
                  )}
                  {job.blockNumber && (
                    <div>
                      <span className="text-gray-300">Block:</span>
                      <span className="ml-2">{job.blockNumber}</span>
                    </div>
                  )}
                  {job.gasUsed && (
                    <div>
                      <span className="text-gray-300">Gas Used:</span>
                      <span className="ml-2">{job.gasUsed}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-gray-300">Created:</span>
                    <span className="ml-2">{new Date(job.createdAt).toLocaleString()}</span>
                  </div>
                </div>

                {job.txHash && (
                  <div className="mt-3 pt-3 border-t border-gray-700">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-300">Transaction Hash:</span>
                      {getExplorerUrl(job.chainId, job.txHash) && (
                        <a
                          href={getExplorerUrl(job.chainId, job.txHash)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-sm text-[#9478FC] hover:underline"
                        >
                          View on Explorer
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                    <p className="text-xs font-mono break-all mt-1 text-gray-300">
                      {job.txHash}
                    </p>
                  </div>
                )}
                
                {job.error && (
                  <div className="mt-3 p-3 bg-red-900/20 border border-red-700 rounded text-red-300 text-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <XCircle className="w-4 h-4" />
                      <span className="font-medium">Error</span>
                    </div>
                    <p>{job.error}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      
    </div>
  );
}