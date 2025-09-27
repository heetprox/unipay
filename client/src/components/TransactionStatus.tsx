'use client';

import { useState, useEffect } from 'react';
import { UniPayAPI } from '@/lib/api';
import type { Payment, Job } from '@/types/api';

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
  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      const response = await UniPayAPI.getTransactionStatus(transactionId);
      setPayment(response);
      setError(null);
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
    switch (status) {
      case 'SUCCESS':
      case 'MINED':
        return 'text-green-600 bg-green-100';
      case 'PENDING':
      case 'INITIATED':
        return 'text-yellow-600 bg-yellow-100';
      case 'FAILED':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-6 bg-white/10 backdrop-blur-md rounded-lg shadow-md">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200/20 rounded w-1/4 mb-4"></div>
          <div className="h-4 bg-gray-200/20 rounded w-1/2 mb-2"></div>
          <div className="h-4 bg-gray-200/20 rounded w-3/4"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto p-6 bg-white/10 backdrop-blur-md rounded-lg shadow-md">
        <div className="p-3 bg-red-100/20 border border-red-400 text-red-200 rounded">
          {error}
        </div>
      </div>
    );
  }

  if (!payment) {
    return (
      <div className="max-w-2xl mx-auto p-6 bg-white/10 backdrop-blur-md rounded-lg shadow-md">
        <p className="text-gray-300">No payment data found</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white/10 backdrop-blur-md rounded-lg shadow-md text-white">
      <h2 className="text-2xl font-bold mb-4">Transaction Status</h2>
      
      <div className="mb-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-300">Transaction ID</p>
            <p className="font-mono text-sm break-all">{payment.transactionId}</p>
          </div>
          <div>
            <p className="text-sm text-gray-300">Amount</p>
            <p className="font-semibold">{payment.amount} INR</p>
            {localStorage.getItem('selectedTokenSymbol') && (
              <p className="text-sm text-gray-300 mt-1">
                {localStorage.getItem('selectedTokenAmount')} {localStorage.getItem('selectedTokenSymbol')}
              </p>
            )}
          </div>
          <div>
            <p className="text-sm text-gray-300">Payment Status</p>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(payment.status)}`}>
              {payment.status}
            </span>
          </div>
          <div>
            <p className="text-sm text-gray-300">Created</p>
            <p className="text-sm">{new Date(payment.createdAt).toLocaleString()}</p>
          </div>
        </div>
      </div>

      {payment.jobs.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3">Jobs</h3>
          <div className="space-y-3">
            {payment.jobs.map((job: Job) => (
              <div key={job.id} className="border border-gray-700 rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-medium">{job.method}</span>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(job.status)}`}>
                    {job.status}
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-sm text-gray-300">
                  <div>
                    <span className="font-medium">Chain ID:</span> {job.chainId}
                  </div>
                  {job.txHash && (
                    <div>
                      <span className="font-medium">TX Hash:</span>
                      <span className="font-mono text-xs break-all ml-1">{job.txHash}</span>
                    </div>
                  )}
                  {job.blockNumber && (
                    <div>
                      <span className="font-medium">Block:</span> {job.blockNumber}
                    </div>
                  )}
                  {job.gasUsed && (
                    <div>
                      <span className="font-medium">Gas Used:</span> {job.gasUsed}
                    </div>
                  )}
                </div>
                
                {job.error && (
                  <div className="mt-2 p-2 bg-red-50/10 border border-red-200 rounded text-red-200 text-sm">
                    {job.error}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}