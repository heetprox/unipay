'use client';

import { useState, useEffect } from 'react';
import { UniPayAPI } from '@/lib/api';
import type { ClaimResponse, SupportedChainId } from '@/types/api';

interface ClaimTokensProps {
  transactionId?: string;
}

export default function ClaimTokens({ transactionId: propTxId }: ClaimTokensProps) {
  const [transactionId, setTransactionId] = useState<string>(propTxId || '');
  const [userAddress, setUserAddress] = useState<string>('');
  const [claimType, setClaimType] = useState<'usdc' | 'eth'>('usdc');
  const [chainId, setChainId] = useState<SupportedChainId>(1301); // Default to Unichain
  const [amount, setAmount] = useState('');
  const [minimumOutput, setMinimumOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ClaimResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If no transaction ID was provided as prop, try to get it from localStorage
    if (!propTxId) {
      const storedTxId = localStorage.getItem('upiTransactionId');
      if (storedTxId) {
        setTransactionId(storedTxId);
      }
    }

    // Try to get user address from connected wallet
    // This is a placeholder - in a real app, you would get this from your wallet connection
    const getConnectedAddress = async () => {
      try {
        // This would be replaced with actual wallet connection code
        // For example: const address = await web3Provider.getSigner().getAddress();
        const address = localStorage.getItem('connectedAddress') || '';
        setUserAddress(address);
      } catch (err) {
        console.error('Failed to get connected address:', err);
      }
    };

    getConnectedAddress();
  }, [propTxId]);

  const handleClaim = async () => {
    if (!transactionId || !userAddress || !amount || !minimumOutput) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

      let response: ClaimResponse;

      if (claimType === 'usdc') {
        response = await UniPayAPI.claimUsdc({
          chainId,
          transactionId,
          user: userAddress,
          ethAmount: amount,
          minimumUSDCOutput: minimumOutput,
          deadline,
        });
      } else {
        response = await UniPayAPI.claimEth({
          chainId,
          transactionId,
          user: userAddress,
          usdcAmount: amount,
          minimumETHOutput: minimumOutput,
          deadline,
        });
      }

      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Claim failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white/10 backdrop-blur-md rounded-lg shadow-md text-white">
      <h2 className="text-2xl font-bold mb-4">Claim Tokens</h2>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Transaction ID
        </label>
        <input
          type="text"
          value={transactionId}
          onChange={(e) => setTransactionId(e.target.value)}
          className="w-full px-3 py-2 border border-gray-700 bg-black/30 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-[#9478FC]"
          placeholder="Enter transaction ID"
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Your Ethereum Address
        </label>
        <input
          type="text"
          value={userAddress}
          onChange={(e) => setUserAddress(e.target.value)}
          className="w-full px-3 py-2 border border-gray-700 bg-black/30 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-[#9478FC]"
          placeholder="Enter your Ethereum address"
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Claim Type
        </label>
        <select
          value={claimType}
          onChange={(e) => setClaimType(e.target.value as 'usdc' | 'eth')}
          className="w-full px-3 py-2 border border-gray-700 bg-black/30 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-[#9478FC]"
        >
          <option value="usdc">ETH → USDC</option>
          <option value="eth">USDC → ETH</option>
        </select>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Chain
        </label>
        <select
          value={chainId}
          onChange={(e) => setChainId(Number(e.target.value) as SupportedChainId)}
          className="w-full px-3 py-2 border border-gray-700 bg-black/30 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-[#9478FC]"
        >
          <option value={1}>Ethereum Mainnet</option>
          <option value={8453}>Base</option>
          <option value={1301}>Unichain</option>
        </select>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          {claimType === 'usdc' ? 'ETH Amount' : 'USDC Amount'}
        </label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full px-3 py-2 border border-gray-700 bg-black/30 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-[#9478FC]"
          placeholder={`Enter ${claimType === 'usdc' ? 'ETH' : 'USDC'} amount`}
          step="0.000001"
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Minimum {claimType === 'usdc' ? 'USDC' : 'ETH'} Output
        </label>
        <input
          type="number"
          value={minimumOutput}
          onChange={(e) => setMinimumOutput(e.target.value)}
          className="w-full px-3 py-2 border border-gray-700 bg-black/30 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-[#9478FC]"
          placeholder={`Minimum ${claimType === 'usdc' ? 'USDC' : 'ETH'} to receive`}
          step="0.000001"
        />
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100/20 border border-red-400 text-red-200 rounded">
          {error}
        </div>
      )}

      {result && (
        <div className="mb-4 p-3 bg-green-100/20 border border-green-400 text-green-200 rounded">
          <p className="font-medium">Claim Successful!</p>
          <p className="text-sm">TX Hash: {result.txHash}</p>
          <p className="text-sm">Block: {result.blockNumber}</p>
        </div>
      )}

      <button
        onClick={handleClaim}
        disabled={loading}
        className="w-full bg-[#9478FC] text-white py-2 px-4 rounded-md hover:bg-[#7d63d4] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
      >
        {loading ? 'Processing...' : `Claim ${claimType.toUpperCase()}`}
      </button>
    </div>
  );
}