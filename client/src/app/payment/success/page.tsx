'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { UniPayAPI } from '@/lib/api';
import { useAccount } from 'wagmi';
import TransactionStatus from '@/components/TransactionStatus';
import ClaimTokens from '@/components/ClaimTokens';
import Link from 'next/link';
import { CheckCircle, Clock, AlertTriangle, RefreshCw } from 'lucide-react';
import type { TransactionStatusResponse } from '@/types/api';

export default function PaymentSuccessPage() {
  const searchParams = useSearchParams();
  const { address } = useAccount();
  const [transactionId, setTransactionId] = useState<string>('');
  const [paymentStatus, setPaymentStatus] = useState<'loading' | 'pending' | 'completed' | 'failed'>('loading');
  const [transactionData, setTransactionData] = useState<TransactionStatusResponse | null>(null);
  const [showClaimSection, setShowClaimSection] = useState(false);

  useEffect(() => {
    // Try to get transaction ID from URL params first
    const txId = searchParams.get('txId');
    
    if (txId) {
      setTransactionId(txId);
      checkPaymentStatus(txId);
    } else {
      // Fallback to localStorage if not in URL
      const storedTxId = localStorage.getItem('upiTransactionId');
      if (storedTxId) {
        setTransactionId(storedTxId);
        checkPaymentStatus(storedTxId);
      }
    }
  }, [searchParams]);

  const checkPaymentStatus = async (txId: string) => {
    try {
      const status = await UniPayAPI.getTransactionStatus(txId);
      setTransactionData(status);
      
      // Check for SUCCESS status (from backend) or completed (alternative)
      if (status.payment.status === 'SUCCESS' || status.payment.status === 'completed') {
        setPaymentStatus('completed');
        
        // Check if tokens were already minted automatically
        const hasMintJob = status.jobs.some(job => 
          job.method === 'MINT' && (job.status === 'MINED' || job.status === 'PENDING')
        );
        
        if (hasMintJob) {
          // Tokens already minted automatically, no need to show claim section
          setShowClaimSection(false);
        } else {
          // Show claim section for manual claiming
          setShowClaimSection(true);
        }
      } else if (status.payment.status === 'FAILED' || status.payment.status === 'failed') {
        setPaymentStatus('failed');
      } else {
        setPaymentStatus('pending');
        // Continue polling if payment is still pending
        setTimeout(() => checkPaymentStatus(txId), 5000);
      }
    } catch (err) {
      console.error('Failed to check payment status:', err);
      setPaymentStatus('failed');
    }
  };

  if (!transactionId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-black text-white">
        <div className="max-w-md w-full bg-white/10 backdrop-blur-md p-6 rounded-lg shadow-lg">
          <h1 className="text-2xl font-bold mb-4">Transaction Not Found</h1>
          <p className="mb-6">No transaction ID was found. Please initiate a payment first.</p>
          <Link 
            href="/"
            className="block w-full text-center bg-[#9478FC] text-white py-2 px-4 rounded-md hover:bg-[#7d63d4] transition-all duration-300"
          >
            Go to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Payment Status</h1>
          <p className="text-gray-300">Track your payment and claim your tokens</p>
        </div>

        {/* Payment Status Card */}
        <div className="mb-6 p-6 bg-white/10 backdrop-blur-md rounded-lg border border-gray-800">
          <div className="flex items-center gap-3 mb-4">
            {paymentStatus === 'loading' && <Clock className="w-6 h-6 text-blue-400 animate-pulse" />}
            {paymentStatus === 'pending' && <Clock className="w-6 h-6 text-yellow-400" />}
            {paymentStatus === 'completed' && <CheckCircle className="w-6 h-6 text-green-400" />}
            {paymentStatus === 'failed' && <AlertTriangle className="w-6 h-6 text-red-400" />}
            
            <div>
              <h2 className="text-xl font-semibold">
                {paymentStatus === 'loading' && 'Checking Payment...'}
                {paymentStatus === 'pending' && 'Payment Pending'}
                {paymentStatus === 'completed' && 'Payment Successful!'}
                {paymentStatus === 'failed' && 'Payment Failed'}
              </h2>
              <p className="text-sm text-gray-400">Transaction ID: {transactionId}</p>
            </div>
          </div>

          {transactionData && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Amount:</span>
                <span>₹{transactionData.payment.amount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Status:</span>
                <span className={`capitalize ${
                  transactionData.payment.status === 'completed' ? 'text-green-400' :
                  transactionData.payment.status === 'failed' ? 'text-red-400' :
                  'text-yellow-400'
                }`}>
                  {transactionData.payment.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Created:</span>
                <span>{new Date(transactionData.payment.createdAt).toLocaleString()}</span>
              </div>
            </div>
          )}

          {paymentStatus === 'pending' && (
            <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-700 rounded">
              <p className="text-yellow-200 text-sm">
                Your payment is being processed. This page will update automatically once the payment is confirmed.
              </p>
            </div>
          )}

          {paymentStatus === 'failed' && (
            <div className="mt-4 p-3 bg-red-900/20 border border-red-700 rounded">
              <p className="text-red-200 text-sm">
                Your payment failed or was cancelled. Please try again or contact support if you believe this is an error.
              </p>
            </div>
          )}
        </div>

        {/* Transaction Status Details */}
        <div className="mb-6">
          <TransactionStatus transactionId={transactionId} autoRefresh={paymentStatus === 'pending'} />
        </div>

        {/* Success Message - Show when payment is completed */}
        {paymentStatus === 'completed' && (
          <div className="mb-6">
            {transactionData && transactionData.jobs.some(job => job.method === 'MINT' && job.status === 'MINED') ? (
              <div className="p-4 bg-green-900/20 border border-green-700 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-5 h-5 text-green-400" />
                  <h3 className="font-semibold text-green-300">Tokens Minted Successfully! 🎉</h3>
                </div>
                <p className="text-green-200 text-sm mb-3">
                  Your payment was successful and your tokens have been automatically minted to your wallet!
                </p>
                
                {/* Show minting details */}
                {transactionData.jobs
                  .filter(job => job.method === 'MINT' && job.status === 'MINED')
                  .map(job => (
                    <div key={job.id} className="mt-3 p-3 bg-green-800/30 rounded text-xs">
                      <div className="grid grid-cols-2 gap-2">
                        <span className="text-green-300">Network:</span>
                        <span className="text-green-200">{job.chainName || `Chain ${job.chainId}`}</span>
                        <span className="text-green-300">Block:</span>
                        <span className="text-green-200">{job.blockNumber}</span>
                        <span className="text-green-300">Gas Used:</span>
                        <span className="text-green-200">{job.gasUsed}</span>
                      </div>
                      {job.txHash && (
                        <div className="mt-2">
                          <span className="text-green-300">Transaction: </span>
                          <span className="font-mono text-green-200 break-all">{job.txHash}</span>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            ) : transactionData && transactionData.jobs.some(job => job.method === 'MINT' && job.status === 'PENDING') ? (
              <div className="p-4 bg-blue-900/20 border border-blue-700 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />
                  <h3 className="font-semibold text-blue-300">Minting Tokens...</h3>
                </div>
                <p className="text-blue-200 text-sm">
                  Your payment was successful! We're currently minting your tokens on the blockchain. This usually takes a few seconds.
                </p>
              </div>
            ) : showClaimSection ? (
              <div className="mb-4">
                <div className="mb-4 p-4 bg-green-900/20 border border-green-700 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-5 h-5 text-green-400" />
                    <h3 className="font-semibold text-green-300">Ready to Claim!</h3>
                  </div>
                  <p className="text-green-200 text-sm">
                    Your payment has been confirmed. You can now claim your tokens to your wallet.
                  </p>
                </div>
                
                <ClaimTokens transactionId={transactionId} />
              </div>
            ) : null}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-4">
          <Link 
            href="/"
            className="flex-1 text-center bg-gray-700 text-white py-3 px-4 rounded-md hover:bg-gray-600 transition-all duration-300"
          >
            New Payment
          </Link>
          
          {!showClaimSection && (
            <Link 
              href={`/claim?txId=${transactionId}`}
              className="flex-1 text-center bg-[#9478FC] text-white py-3 px-4 rounded-md hover:bg-[#7d63d4] transition-all duration-300"
            >
              Manual Claim
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}