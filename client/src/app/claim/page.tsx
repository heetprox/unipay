'use client';

import { useSearchParams } from 'next/navigation';
import ClaimTokens from '@/components/ClaimTokens';
import Link from 'next/link';

export default function ClaimPage() {
  const searchParams = useSearchParams();
  const transactionId = searchParams.get('txId') || undefined;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-black text-white">
      <div className="max-w-md w-full">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Claim Tokens</h1>
          <p className="text-gray-300">Convert between ETH and USDC</p>
        </div>
        
        <ClaimTokens transactionId={transactionId} />
        
        <div className="mt-6">
          <Link 
            href="/"
            className="block text-center bg-gray-700 text-white py-2 px-4 rounded-md hover:bg-gray-600 transition-all duration-300"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}