'use client';

import { useState, useEffect } from 'react';
import { UniPayAPI } from '@/lib/api';
import { useAccount } from 'wagmi';
import type { 
  UpiInitiateResponse, 
  CurrentPricesResponse, 
  LockedQuoteResponse,
  ETHQuoteResponse,
  USDQuoteResponse 
} from '@/types/api';
import Link from 'next/link';
import { RefreshCw, Clock, TrendingUp } from 'lucide-react';

interface UpiPaymentProps {
  disabled?: boolean;
}

export default function UpiPayment({ disabled = false }: UpiPaymentProps) {
  const { address } = useAccount();
  const [inrAmount, setInrAmount] = useState('');
  const [quoteType, setQuoteType] = useState<"ETH/INR" | "USD/INR">("ETH/INR");
  const [chainId, setChainId] = useState(1301); // Unichain Sepolia
  const [loading, setLoading] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [paymentData, setPaymentData] = useState<UpiInitiateResponse | null>(null);
  const [currentPrices, setCurrentPrices] = useState<CurrentPricesResponse | null>(null);
  const [currentQuote, setCurrentQuote] = useState<ETHQuoteResponse | USDQuoteResponse | null>(null);
  const [lockedQuote, setLockedQuote] = useState<LockedQuoteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [priceStream, setPriceStream] = useState<EventSource | null>(null);

  // Supported chains
  const chains = [
    { id: 1, name: 'Ethereum Mainnet' },
    { id: 8453, name: 'Base' },
    { id: 1301, name: 'Unichain Sepolia' }
  ];

  // Fetch current prices on component mount
  useEffect(() => {
    fetchCurrentPrices();
    setupPriceStream();

    return () => {
      if (priceStream) {
        priceStream.close();
      }
    };
  }, []);

  // Get live quote when INR amount changes
  useEffect(() => {
    if (inrAmount && parseFloat(inrAmount) > 0 && address) {
      const debounceTimer = setTimeout(() => {
        fetchQuote();
      }, 500);

      return () => clearTimeout(debounceTimer);
    } else {
      setCurrentQuote(null);
    }
  }, [inrAmount, quoteType, address]);

  const fetchCurrentPrices = async () => {
    try {
      const prices = await UniPayAPI.getCurrentPrices();
      setCurrentPrices(prices);
    } catch (err) {
      console.error('Failed to fetch current prices:', err);
    }
  };

  const setupPriceStream = () => {
    try {
      const eventSource = UniPayAPI.createPriceStream();
      
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === "initial") {
          setCurrentPrices({
            success: true,
            prices: data.prices,
            timestamp: data.timestamp
          });
        } else if (data.type === "update") {
          setCurrentPrices(prev => {
            if (!prev) return null;
            return {
              ...prev,
              prices: {
                ...prev.prices,
                [data.symbol]: data.price
              },
              timestamp: data.timestamp
            };
          });
        }
      };

      eventSource.onerror = (error) => {
        console.error('Price stream error:', error);
        eventSource.close();
        // Retry connection after 5 seconds
        setTimeout(setupPriceStream, 5000);
      };

      setPriceStream(eventSource);
    } catch (err) {
      console.error('Failed to setup price stream:', err);
    }
  };

  const fetchQuote = async () => {
    if (!address || !inrAmount || parseFloat(inrAmount) <= 0) return;

    setQuoteLoading(true);
    try {
      const quote = await UniPayAPI.getQuote({
        userId: address,
        inrAmount: parseFloat(inrAmount),
        type: quoteType
      });
      setCurrentQuote(quote);
    } catch (err) {
      console.error('Failed to fetch quote:', err);
    } finally {
      setQuoteLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    // Only allow numbers and decimals
    if (inputValue === '' || /^\d*\.?\d*$/.test(inputValue)) {
      setInrAmount(inputValue);
    }
  };

  const lockQuoteAndInitiatePayment = async () => {
    if (!address || !inrAmount || parseFloat(inrAmount) <= 0) {
      setError('Please connect wallet and enter a valid INR amount');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // First, lock the quote
      const lockedQuoteResponse = await UniPayAPI.lockQuote({
        userId: address,
        inrAmount: parseFloat(inrAmount),
        type: quoteType
      });

      setLockedQuote(lockedQuoteResponse);

      // Then initiate UPI payment with locked quote
      const paymentResponse = await UniPayAPI.initiateUpiPayment({
        amount: inrAmount,
        chainId: chainId,
        userId: address,
        lockedQuoteId: lockedQuoteResponse.quote.id
      });

      setPaymentData(paymentResponse);
      
      // Store transaction details in localStorage
      localStorage.setItem('upiTransactionId', paymentResponse.transactionId);
      localStorage.setItem('lockedQuoteId', lockedQuoteResponse.quote.id);
      localStorage.setItem('quoteType', quoteType);
      localStorage.setItem('inrAmount', inrAmount);
      localStorage.setItem('qrCode', paymentResponse.qrCode);
      localStorage.setItem('intentUrl', paymentResponse.intentUrl);
      
      // Redirect to QR payment page
      const qrPageUrl = `/payment/qr?txId=${paymentResponse.transactionId}&qr=${encodeURIComponent(paymentResponse.qrCode)}&intent=${encodeURIComponent(paymentResponse.intentUrl)}`;
      window.location.href = qrPageUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment initiation failed');
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6
    }).format(price);
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleTimeString();
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white/10 backdrop-blur-md rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-4 text-white">Buy Crypto with UPI</h2>
      
      {/* Current Prices Display */}
      {currentPrices && (
        <div className="mb-4 p-3 bg-white/5 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white text-sm font-medium">Live Prices</span>
            <TrendingUp className="w-4 h-4 text-green-400" />
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-gray-300">ETH/USD:</span>
              <span className="text-white ml-1">${formatPrice(currentPrices.prices["ETH/USD"].price)}</span>
            </div>
            <div>
              <span className="text-gray-300">USD/INR:</span>
              <span className="text-white ml-1">₹{formatPrice(currentPrices.prices["USD/INR"].price)}</span>
            </div>
          </div>
          <div className="text-xs text-gray-400 mt-1">
            Updated: {formatTimestamp(currentPrices.timestamp)}
          </div>
        </div>
      )}

      {/* Quote Type Selection */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          What do you want to buy?
        </label>
        <div className="flex gap-2">
          <button
            onClick={() => setQuoteType("ETH/INR")}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              quoteType === "ETH/INR" 
                ? 'bg-[#9478FC] text-white' 
                : 'bg-white/10 text-gray-300 hover:bg-white/15'
            }`}
          >
            ETH
          </button>
          <button
            onClick={() => setQuoteType("USD/INR")}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              quoteType === "USD/INR" 
                ? 'bg-[#9478FC] text-white' 
                : 'bg-white/10 text-gray-300 hover:bg-white/15'
            }`}
          >
            USDC
          </button>
        </div>
      </div>

      {/* Chain Selection */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Network
        </label>
        <select
          value={chainId}
          onChange={(e) => setChainId(Number(e.target.value))}
          className="w-full px-3 py-2 border border-gray-700 bg-black/30 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-[#9478FC]"
        >
          {chains.map((chain) => (
            <option key={chain.id} value={chain.id}>
              {chain.name}
            </option>
          ))}
        </select>
      </div>

      {/* INR Amount Input */}
      <div className="w-full bg-[#1a1a1a] rounded-xl p-4 border border-gray-800 hover:border-white/30 transition-colors mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-white text-md">You Pay (INR)</span>
          {quoteLoading && <RefreshCw className="w-4 h-4 text-white animate-spin" />}
        </div>
        
        <div className="flex items-center gap-3">
          <span className="text-white text-2xl">₹</span>
          <input
            type="text"
            value={inrAmount}
            onChange={handleInputChange}
            placeholder="10000"
            disabled={disabled}
            className="flex-1 bg-transparent text-white text-3xl font-medium placeholder-white/50 outline-none"
          />
        </div>
      </div>

      {/* Quote Display */}
      {currentQuote && (
        <div className="mb-4 p-3 bg-green-900/20 border border-green-700 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-green-300 text-sm font-medium">You Get</span>
            <Clock className="w-4 h-4 text-green-400" />
          </div>
          <div className="text-white text-xl font-bold">
            {formatPrice(currentQuote.quote.outputAmount)} {quoteType === "ETH/INR" ? "ETH" : "USDC"}
          </div>
          <div className="text-xs text-green-300 mt-1">
            Rate: ₹{formatPrice(currentQuote.quote.usdInrRate)} per USD
            {currentQuote.quote.type === "ETH/INR" && (
              <span> • ETH: ${formatPrice((currentQuote.quote as any).ethPriceUsd)}</span>
            )}
          </div>
        </div>
      )}

      {/* Locked Quote Display */}
      {lockedQuote && (
        <div className="mb-4 p-3 bg-blue-900/20 border border-blue-700 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-blue-300 text-sm font-medium">Quote Locked</span>
            <span className="text-xs text-blue-300">
              Expires in {Math.max(0, Math.floor(lockedQuote.quote.validFor / 1000))}s
            </span>
          </div>
          <div className="text-white text-sm">
            {formatPrice(lockedQuote.quote.outputAmount)} {quoteType === "ETH/INR" ? "ETH" : "USDC"} 
            for ₹{formatPrice(lockedQuote.quote.inrAmount)}
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-100/20 border border-red-400 text-red-200 rounded">
          {error}
        </div>
      )}

      {!address && (
        <div className="mb-4 p-3 bg-yellow-100/20 border border-yellow-400 text-yellow-200 rounded">
          Please connect your wallet to continue
        </div>
      )}

      <button
        onClick={lockQuoteAndInitiatePayment}
        disabled={loading || !address || !inrAmount || parseFloat(inrAmount) <= 0}
        className="w-full bg-[#9478FC] text-white py-3 px-4 rounded-md hover:bg-[#7d63d4] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 font-medium"
      >
        {loading ? 'Processing...' : `Pay ₹${inrAmount || '0'} with UPI`}
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
    </div>
  );
}