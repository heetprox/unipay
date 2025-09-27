'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import TransactionStatus from '@/components/TransactionStatus';
import Link from 'next/link';

export default function PaymentSuccessPage() {
  const searchParams = useSearchParams();
  const [transactionId, setTransactionId] = useState<string>('');

  useEffect(() => {
    // Try to get transaction ID from URL params first
    const txId = searchParams.get('txId');
    
    if (txId) {
      setTransactionId(txId);
    } else {
      // Fallback to localStorage if not in URL
      const storedTxId = localStorage.getItem('upiTransactionId');
      if (storedTxId) {
        setTransactionId(storedTxId);
      }
    }
  }, [searchParams]);

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
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-black text-white">
      <div className="max-w-2xl w-full">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Payment Status</h1>
          <p className="text-gray-300">Check the status of your transaction</p>
        </div>
        
        <TransactionStatus transactionId={transactionId} autoRefresh={true} />
        
        <div className="mt-6 flex justify-between">
          <Link 
            href="/"
            className="bg-gray-700 text-white py-2 px-4 rounded-md hover:bg-gray-600 transition-all duration-300"
          >
            Back to Home
          </Link>
          
          <Link 
            href="/claim"
            className="bg-[#9478FC] text-white py-2 px-4 rounded-md hover:bg-[#7d63d4] transition-all duration-300"
          >
            Claim Tokens
          </Link>
        </div>
      </div>
    </div>
  );
}