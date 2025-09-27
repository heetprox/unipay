'use client';

import { useState, useEffect } from 'react';
import { UniPayAPI } from '@/lib/api';
import { useAccount } from 'wagmi';
import type { ClaimSuccessResponse } from '@/types/api';
import { CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';

interface ClaimTokensProps {
  transactionId?: string;
}

export default function ClaimTokens({ transactionId: propTxId }: ClaimTokensProps) {
  const { address } = useAccount();
  const [transactionId, setTransactionId] = useState<string>(propTxId || '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ClaimSuccessResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If no transaction ID was provided as prop, try to get it from localStorage
    if (!propTxId) {
      const storedTxId = localStorage.getItem('upiTransactionId');
      if (storedTxId) {
        setTransactionId(storedTxId);
      }
    }
  }, [propTxId]);

  const handleClaim = async () => {
    if (!transactionId) {
      setError('Please enter a transaction ID');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await UniPayAPI.initiateClaim({
        transactionId
      });

      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Claim failed');
    } finally {
      setLoading(false);
    }
  };

  const getExplorerUrl = (chainId: number, txHash: string) => {
    const explorers: Record<number, string> = {
      1: 'https://etherscan.io',
      8453: 'https://basescan.org',
      1301: 'https://sepolia.uniscan.xyz' // Unichain Sepolia explorer
    };
    
    const baseUrl = explorers[chainId] || 'https://etherscan.io';
    return `${baseUrl}/tx/${txHash}`;
  };

  const getChainName = (chainId: number) => {
    const chains: Record<number, string> = {
      1: 'Ethereum Mainnet',
      8453: 'Base',
      1301: 'Unichain Sepolia'
    };
    
    return chains[chainId] || `Chain ${chainId}`;
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white/10 backdrop-blur-md rounded-lg shadow-md text-white">
      <h2 className="text-2xl font-bold mb-4">Claim Your Tokens</h2>
      
      <p className="text-gray-300 text-sm mb-4">
        After your UPI payment is successful, use this form to claim your tokens on the blockchain.
      </p>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Transaction ID
        </label>
        <input
          type="text"
          value={transactionId}
          onChange={(e) => setTransactionId(e.target.value)}
          className="w-full px-3 py-2 border border-gray-700 bg-black/30 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-[#9478FC]"
          placeholder="Enter your UPI transaction ID"
        />
        <p className="text-xs text-gray-400 mt-1">
          This is the transaction ID you received after initiating the UPI payment
        </p>
      </div>

      {!address && (
        <div className="mb-4 p-3 bg-yellow-100/20 border border-yellow-400 text-yellow-200 rounded flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">Please connect your wallet to claim tokens</span>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-100/20 border border-red-400 text-red-200 rounded flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {result && (
        <div className="mb-4 p-4 bg-green-100/20 border border-green-400 text-green-200 rounded">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle className="w-5 h-5" />
            <span className="font-medium">Claim Successful!</span>
          </div>
          
          <div className="space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <span className="text-gray-300">Type:</span>
              <span>{result.quoteType}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span className="text-gray-300">Amount:</span>
              <span>{result.outputAmount} {result.quoteType === "ETH/INR" ? "ETH" : "USDC"}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span className="text-gray-300">Network:</span>
              <span>{getChainName(result.chainId)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span className="text-gray-300">Block:</span>
              <span>{result.blockNumber}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span className="text-gray-300">Slippage:</span>
              <span>{result.slippagePercent}%</span>
            </div>
          </div>
          
          <div className="mt-3 pt-3 border-t border-green-700">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-300">Transaction Hash:</span>
              <a
                href={getExplorerUrl(result.chainId, result.txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-[#9478FC] hover:underline"
              >
                View on Explorer
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <p className="text-xs font-mono break-all mt-1 text-gray-300">
              {result.txHash}
            </p>
          </div>
        </div>
      )}

      <button
        onClick={handleClaim}
        disabled={loading || !transactionId || !address}
        className="w-full bg-[#9478FC] text-white py-3 px-4 rounded-md hover:bg-[#7d63d4] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 font-medium"
      >
        {loading ? 'Processing Claim...' : 'Claim Tokens'}
      </button>
      
      <div className="mt-4 text-xs text-gray-400 text-center">
        <p>Make sure your UPI payment was successful before claiming.</p>
        <p>The claim process will mint your tokens to your connected wallet.</p>
      </div>
    </div>
  );
}