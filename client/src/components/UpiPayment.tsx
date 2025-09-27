'use client';

import { useState, useEffect, useRef } from 'react';
import { UniPayAPI } from '@/lib/api';
import type { UpiInitiateResponse } from '@/types/api';
import Link from 'next/link';
import { ChevronDown, Search, X } from 'lucide-react';

// Common Uniswap V4 tokens
const UNISWAP_TOKENS = [
  {
    address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH (Wrapped Ethereum)
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
    logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png'
  },
  {
    address: '0xA0b86a33E6441E6EC0C48E56B9E86b8FA8C15707', // USDC
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86a33E6441E6EC0C48E56B9E86b8FA8C15707/logo.png'
  },
  {
    address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png'
  },
  {
    address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', // DAI
    symbol: 'DAI',
    name: 'Dai Stablecoin',
    decimals: 18,
    logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6B175474E89094C44Da98b954EedeAC495271d0F/logo.png'
  }
];

// Native ETH token
const ETH_TOKEN = {
  address: '0x0000000000000000000000000000000000000000', // Common convention for native ETH
  symbol: 'ETH',
  name: 'Ethereum',
  decimals: 18,
  logoURI: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png'
};

export interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI: string;
}

interface UpiPaymentProps {
  disabled?: boolean;
}

export default function UpiPayment({ disabled = false }: UpiPaymentProps) {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [paymentData, setPaymentData] = useState<UpiInitiateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedToken, setSelectedToken] = useState<Token>(ETH_TOKEN);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredTokens, setFilteredTokens] = useState<Token[]>([ETH_TOKEN, ...UNISWAP_TOKENS]);
  const modalRef = useRef<HTMLDivElement>(null);

  // Filter tokens based on search query
  useEffect(() => {
    const ALL_TOKENS = [ETH_TOKEN, ...UNISWAP_TOKENS];
    const filtered = ALL_TOKENS.filter(token =>
      token.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      token.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      token.address.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setFilteredTokens(filtered);
  }, [searchQuery]);

  // Close modal when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        setIsModalOpen(false);
      }
    };

    if (isModalOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isModalOpen]);

  const handleTokenSelect = (token: Token) => {
    setSelectedToken(token);
    setIsModalOpen(false);
    setSearchQuery('');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    // Only allow numbers and decimals
    if (inputValue === '' || /^\d*\.?\d*$/.test(inputValue)) {
      setAmount(inputValue);
    }
  };

  // Calculate INR amount based on token price (simplified example)
  const getInrAmount = () => {
    if (!amount || parseFloat(amount) <= 0) return '0';
    
    // Simplified conversion rates (in real app, these would come from an API)
    const conversionRates: Record<string, number> = {
      'ETH': 250000, // 1 ETH = 250,000 INR
      'USDC': 85,    // 1 USDC = 85 INR
      'USDT': 85,    // 1 USDT = 85 INR
      'DAI': 85,     // 1 DAI = 85 INR
      'WETH': 250000 // 1 WETH = 250,000 INR
    };
    
    const rate = conversionRates[selectedToken.symbol] || 0;
    const inrValue = parseFloat(amount) * rate;
    return inrValue.toFixed(2);
  };

  const handleInitiatePayment = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Include token information in the payment request
      const response = await UniPayAPI.initiateUpiPayment({ 
        amount,
        tokenSymbol: selectedToken.symbol,
        tokenAddress: selectedToken.address
      });
      setPaymentData(response);
      
      // Store transaction ID and token info in localStorage for the success page
      localStorage.setItem('upiTransactionId', response.transactionId);
      localStorage.setItem('selectedTokenSymbol', selectedToken.symbol);
      localStorage.setItem('selectedTokenAmount', amount);
      
      // Simulate UPI app redirect
      window.location.href = response.intentUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment initiation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white/10 backdrop-blur-md rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-4 text-white">UPI Payment</h2>
      
      <div className="w-full bg-[#1a1a1a] rounded-xl p-4 border border-gray-800 hover:border-white/30 transition-colors mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-white text-md">Amount</span>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Token Amount Input */}
          <input
            type="text"
            value={amount}
            onChange={handleInputChange}
            placeholder="0.0"
            disabled={disabled}
            className="flex-1 w-[20%] bg-transparent text-white text-5xl font-medium placeholder-white/50 outline-none"
          />
          
          {/* Token Select Button */}
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/15 px-3 py-2 rounded-full transition-colors border border-gray-700 hover:border-gray-600"
            disabled={disabled}
          >
            {selectedToken ? (
              <>
                <img
                  src={selectedToken.logoURI}
                  alt={selectedToken.symbol}
                  className="w-6 h-6 rounded-full"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://via.placeholder.com/24x24/3b82f6/ffffff?text=${selectedToken.symbol.charAt(0)}`;
                  }}
                />
                <span className="text-white text-xl cursor-pointer font-medium">{selectedToken.symbol}</span>
              </>
            ) : (
              <span className="text-white">Select Token</span>
            )}
            <ChevronDown className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>
      
      {/* INR Conversion Display */}
      <div className="text-white text-center mb-4 p-2 bg-white/10 rounded-lg">
        <span className="text-sm">Estimated Cost: </span>
        <span className="font-bold">₹{getInrAmount()}</span>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100/20 border border-red-400 text-red-200 rounded">
          {error}
        </div>
      )}

      <button
        onClick={handleInitiatePayment}
        disabled={loading || !amount || parseFloat(amount) <= 0}
        className="w-full bg-[#9478FC] text-white py-2 px-4 rounded-md hover:bg-[#7d63d4] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
      >
        {loading ? 'Processing...' : `Pay ${amount} ${selectedToken.symbol} with UPI`}
      </button>

      {paymentData && (
        <div className="mt-4 p-3 bg-green-100/20 border border-green-400 text-green-200 rounded">
          <p className="font-medium">Payment Initiated</p>
          <p className="text-sm">Transaction ID: {paymentData.transactionId}</p>
          <div className="mt-2">
            <Link href={`/payment/success?txId=${paymentData.transactionId}`} className="text-[#9478FC] hover:underline">
              View Payment Status
            </Link>
          </div>
        </div>
      )}
      
      {/* Token Selection Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div
            ref={modalRef}
            className="bg-[#1a1a1a] rounded-2xl w-full max-w-md max-h-[80vh] border border-gray-800"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <h2 className="text-xl font-semibold text-white">Select Token</h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-white hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Search Input */}
            <div className="p-6 border-b border-gray-800">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-white" />
                <input
                  type="text"
                  placeholder="Search tokens..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 outline-none transition-colors"
                />
              </div>
            </div>

            {/* Token List */}
            <div className="overflow-y-auto max-h-80">
              {filteredTokens.length > 0 ? (
                filteredTokens.map((token) => (
                  <button
                    key={token.address}
                    onClick={() => handleTokenSelect(token)}
                    className="w-full flex items-center gap-4 p-4 hover:bg-gray-800 transition-colors text-left"
                  >
                    <img
                      src={token.logoURI}
                      alt={token.symbol}
                      className="w-10 h-10 rounded-full"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://via.placeholder.com/40x40/3b82f6/ffffff?text=${token.symbol.charAt(0)}`;
                      }}
                    />
                    <div className="flex-1">
                      <div className="text-white font-medium">{token.symbol}</div>
                      <div className="text-white text-sm">{token.name}</div>
                    </div>
                  </button>
                ))
              ) : (
                <div className="p-8 text-center text-white">
                  <Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No tokens found</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}