"use client";

import { useState, useEffect } from "react";
import { UniPayAPI } from "@/lib/api";
import { useAccount } from "wagmi";
import type {
  UpiInitiateResponse,
  CurrentPricesResponse,
  LockedQuoteResponse,
  ETHQuoteResponse,
  USDQuoteResponse,
} from "@/types/api";
import Link from "next/link";
import { RefreshCw, ChevronDown, X, Lock, CheckCircle } from "lucide-react";
import type { TransactionStatusResponse } from "@/types/api";

interface UpiPaymentProps {
  disabled?: boolean;
}

// Token and Chain configurations
const SUPPORTED_TOKENS = [
  {
    symbol: "ETH",
    name: "Ethereum",
    quoteType: "ETH/INR",
    logoURI:
      "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png",
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    quoteType: "USD/INR",
    logoURI:
      "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png",
  },
];

const SUPPORTED_CHAINS = [
  {
    id: 1,
    name: "Ethereum",
    logoURI:
      "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png",
  },
  {
    id: 8453,
    name: "Base",
    logoURI:
      "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png",
  },
  {
    id: 1301,
    name: "Unichain Sepolia",
    logoURI: "https://img.cryptorank.io/coins/unichain1728632895218.png",
  },
];

export default function UpiPayment({ disabled = false }: UpiPaymentProps) {
  const { address } = useAccount();
  const [inrAmount, setInrAmount] = useState("");
  const [receiveAmount, setReceiveAmount] = useState("");
  const [selectedToken, setSelectedToken] = useState(SUPPORTED_TOKENS[0]);
  const [selectedChain, setSelectedChain] = useState(SUPPORTED_CHAINS[0]);
  const [quoteType, setQuoteType] = useState<"ETH/INR" | "USD/INR">("ETH/INR");
  const [chainId, setChainId] = useState(1);
  const [lastEditedField, setLastEditedField] = useState<"pay" | "receive">(
    "pay"
  );

  const [loading, setLoading] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [paymentData, setPaymentData] = useState<UpiInitiateResponse | null>(
    null
  );
  const [currentPrices, setCurrentPrices] =
    useState<CurrentPricesResponse | null>(null);
  const [currentQuote, setCurrentQuote] = useState<
    ETHQuoteResponse | USDQuoteResponse | null
  >(null);
  const [lockedQuote, setLockedQuote] = useState<LockedQuoteResponse | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [priceStream, setPriceStream] = useState<EventSource | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<
    "loading" | "pending" | "completed" | "failed"
  >("loading");
  const [transactionData, setTransactionData] =
    useState<TransactionStatusResponse | null>(null);
  const [showClaimSection, setShowClaimSection] = useState(false);

  // Modal states
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [isChainModalOpen, setIsChainModalOpen] = useState(false);

  // Update quoteType and chainId when selections change
  useEffect(() => {
    setQuoteType(selectedToken.quoteType as "ETH/INR" | "USD/INR");
  }, [selectedToken]);

  useEffect(() => {
    setChainId(selectedChain.id);
  }, [selectedChain]);

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

  // Get live quote when amounts change
  useEffect(() => {
    if (address) {
      if (lastEditedField === "pay" && inrAmount && parseFloat(inrAmount) > 0) {
        const debounceTimer = setTimeout(() => {
          fetchQuoteFromINR();
        }, 500);
        return () => clearTimeout(debounceTimer);
      } else if (
        lastEditedField === "receive" &&
        receiveAmount &&
        parseFloat(receiveAmount) > 0
      ) {
        const debounceTimer = setTimeout(() => {
          fetchQuoteFromCrypto();
        }, 500);
        return () => clearTimeout(debounceTimer);
      }
    }
  }, [inrAmount, receiveAmount, quoteType, address, lastEditedField]);

  const fetchCurrentPrices = async () => {
    try {
      const prices = await UniPayAPI.getCurrentPrices();
      setCurrentPrices(prices);
    } catch (err) {
      console.error("Failed to fetch current prices:", err);
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
            timestamp: data.timestamp,
          });
        } else if (data.type === "update") {
          setCurrentPrices((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              prices: {
                ...prev.prices,
                [data.symbol]: data.price,
              },
              timestamp: data.timestamp,
            };
          });
        }
      };

      eventSource.onerror = (error) => {
        console.error("Price stream error:", error);
        eventSource.close();
        // Retry connection after 5 seconds
        setTimeout(setupPriceStream, 5000);
      };

      setPriceStream(eventSource);
    } catch (err) {
      console.error("Failed to setup price stream:", err);
    }
  };

  const fetchQuoteFromINR = async () => {
    if (!address || !inrAmount || parseFloat(inrAmount) <= 0) return;

    setQuoteLoading(true);
    try {
      const quote = await UniPayAPI.getQuote({
        userId: address,
        inrAmount: parseFloat(inrAmount),
        type: quoteType,
      });
      setCurrentQuote(quote);
      setReceiveAmount(formatPrice(quote.quote.outputAmount));
    } catch (err) {
      console.error("Failed to fetch quote:", err);
    } finally {
      setQuoteLoading(false);
    }
  };

  const fetchQuoteFromCrypto = async () => {
    if (!address || !receiveAmount || parseFloat(receiveAmount) <= 0) return;

    setQuoteLoading(true);
    try {
      // Calculate approximate INR amount based on current rates
      const exchangeRate =
        currentPrices && selectedToken.symbol === "ETH"
          ? currentPrices.prices["ETH/USD"].price *
            currentPrices.prices["USD/INR"].price
          : currentPrices?.prices["USD/INR"].price || 0;

      const estimatedINR = parseFloat(receiveAmount) * exchangeRate;

      const quote = await UniPayAPI.getQuote({
        userId: address,
        inrAmount: estimatedINR,
        type: quoteType,
      });
      setCurrentQuote(quote);
      setInrAmount(quote.quote.inrAmount.toString());
    } catch (err) {
      console.error("Failed to fetch quote:", err);
    } finally {
      setQuoteLoading(false);
    }
  };

  const handlePayAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    if (inputValue === "" || /^\d*\.?\d*$/.test(inputValue)) {
      setInrAmount(inputValue);
      setLastEditedField("pay");
      if (!inputValue) {
        setReceiveAmount("");
        setCurrentQuote(null);
      }
    }
  };

  const handleReceiveAmountChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const inputValue = e.target.value;
    if (inputValue === "" || /^\d*\.?\d*$/.test(inputValue)) {
      setReceiveAmount(inputValue);
      setLastEditedField("receive");
      if (!inputValue) {
        setInrAmount("");
        setCurrentQuote(null);
      }
    }
  };

  const lockQuoteAndInitiatePayment = async () => {
    if (!address || !inrAmount || parseFloat(inrAmount) <= 0) {
      setError("Please connect wallet and enter a valid INR amount");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // First, lock the quote
      const lockedQuoteResponse = await UniPayAPI.lockQuote({
        userId: address,
        inrAmount: parseFloat(inrAmount),
        type: quoteType,
      });

      setLockedQuote(lockedQuoteResponse);

      // Then initiate UPI payment with locked quote
      const paymentResponse = await UniPayAPI.initiateUpiPayment({
        amount: inrAmount,
        chainId: chainId,
        userId: address,
        lockedQuoteId: lockedQuoteResponse.quote.id,
      });

      setPaymentData(paymentResponse);

      localStorage.setItem("upiTransactionId", paymentResponse.transactionId);
      localStorage.setItem("lockedQuoteId", lockedQuoteResponse.quote.id);
      localStorage.setItem("quoteType", quoteType);
      localStorage.setItem("inrAmount", inrAmount);
      localStorage.setItem("qrCode", paymentResponse.qrCode);
      localStorage.setItem("intentUrl", paymentResponse.intentUrl);

      // Redirect to QR payment page
      const qrPageUrl = `/payment/qr?txId=${
        paymentResponse.transactionId
      }&qr=${encodeURIComponent(
        paymentResponse.qrCode
      )}&intent=${encodeURIComponent(paymentResponse.intentUrl)}`;
      window.location.href = qrPageUrl;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Payment initiation failed"
      );
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    }).format(price);
  };

  const exchangeRate =
    currentPrices && selectedToken.symbol === "ETH"
      ? currentPrices.prices["ETH/USD"].price *
        currentPrices.prices["USD/INR"].price
      : currentPrices?.prices["USD/INR"].price || 0;

  const parsedPayAmount = parseFloat(inrAmount) || 0;
  const isButtonDisabled =
    loading || !address || parsedPayAmount <= 0 || !!error || quoteLoading;

  const checkPaymentStatus = async (txId: string) => {
    try {
      const status = await UniPayAPI.getTransactionStatus(txId);
      setTransactionData(status);

      // Check for SUCCESS status (from backend) or completed (alternative)
      if (
        status.payment.status === "SUCCESS" ||
        status.payment.status === "completed"
      ) {
        setPaymentStatus("completed");

        // Check if tokens were already minted automatically
        const hasMintJob = status.jobs.some(
          (job) =>
            job.method === "MINT" &&
            (job.status === "MINED" || job.status === "PENDING")
        );

        if (hasMintJob) {
          // Tokens already minted automatically, no need to show claim section
          setShowClaimSection(false);
        } else {
          // Show claim section for manual claiming
          setShowClaimSection(true);
        }
      } else if (
        status.payment.status === "FAILED" ||
        status.payment.status === "failed"
      ) {
        setPaymentStatus("failed");
      } else {
        setPaymentStatus("pending");
        // Continue polling if payment is still pending
        setTimeout(() => checkPaymentStatus(txId), 5000);
      }
    } catch (err) {
      console.error("Failed to check payment status:", err);
      setPaymentStatus("failed");
    }
  };

  return (
    <div className="w-full space-y-3 bg-transparent text-white ">
      {/* You Pay Section */}
      <div className="bg-neutral-800/80 rounded-2xl p-5 border border-neutral-700/50">
        <p className="text-gray-400 text-sm mb-3">You Pay</p>
        <div className="flex items-center justify-between gap-3">
          <input
            type="text"
            value={inrAmount}
            onChange={handlePayAmountChange}
            placeholder="0.0"
            disabled={disabled}
            className="flex-1 bg-transparent text-white text-4xl font-light placeholder-gray-600 outline-none min-w-0"
          />
          <div className="flex items-center gap-2 px-3 py-2 bg-neutral-700 rounded-full shrink-0">
            <img
              src="https://cdn.jsdelivr.net/gh/lipis/flag-icons/flags/1x1/in.svg"
              alt="INR"
              width={16}
              height={16}
              className="rounded-full"
            />
            <span className="text-white text-sm font-medium">INR</span>
          </div>
        </div>
      </div>

      {/* You Receive Section */}
      <div className="bg-neutral-800/80 rounded-2xl p-5 border border-neutral-700/50">
        <div className="flex items-center justify-between mb-3">
          <p className="text-gray-400 text-sm">You Receive (est.)</p>
          {quoteLoading && (
            <RefreshCw className="w-4 h-4 text-white animate-spin" />
          )}
        </div>
        <div className="flex items-center justify-between gap-3">
          <input
            type="text"
            value={receiveAmount}
            onChange={handleReceiveAmountChange}
            placeholder="0.0"
            disabled={disabled}
            className="flex-1 bg-transparent text-white text-4xl font-light placeholder-gray-600 outline-none min-w-0"
          />
          <button
            onClick={() => setIsTokenModalOpen(true)}
            className="flex items-center gap-2 px-3 py-2 bg-neutral-700 rounded-full hover:bg-neutral-600 transition-colors shrink-0"
          >
            <img
              src={selectedToken.logoURI}
              alt={selectedToken.symbol}
              width={16}
              height={16}
              className="rounded-full bg-white"
            />
            <span className="text-white text-sm font-medium">
              {selectedToken.symbol}
            </span>
            <ChevronDown className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

      {/* Network Section */}
      <div className="bg-neutral-800/80 rounded-2xl p-5 border border-neutral-700/50">
        <p className="text-gray-400 text-sm mb-3">Network</p>
        <button
          onClick={() => setIsChainModalOpen(true)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <img
              src={selectedChain.logoURI}
              alt={selectedChain.name}
              width={24}
              height={24}
              className="rounded-full"
            />
            <span className="text-white text-lg font-medium">
              {selectedChain.name}
            </span>
          </div>
          <ChevronDown className="w-5 h-5 text-gray-400" />
        </button>
      </div>

      {/* Exchange Rate */}
      <div className="text-center py-4">
        <p className="text-gray-400 text-sm">
          1 {selectedToken.symbol} ≈ ₹
          {exchangeRate.toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </p>
      </div>

      {/* Error Display */}
      {error && (
        <div className="text-red-400 text-sm text-center p-2">{error}</div>
      )}

      {/* Wallet Connection Warning */}
      {!address && (
        <div className="text-white bg-red-500 rounded-4xl text-lg text-center p-2">
          Please connect your wallet to continue
        </div>
      )}

      {/* Locked Quote Display */}
      {lockedQuote && (
        <div className="bg-neutral-900 rounded-xl p-3 border border-neutral-700 text-center">
          <div className="flex items-center justify-center gap-2 text-blue-400">
            <Lock className="w-4 h-4" />
            <span className="text-sm font-medium">
              Quote Locked for {Math.floor(lockedQuote.quote.validFor / 1000)}s
            </span>
          </div>
        </div>
      )}

      {/* Buy Button */}
      <button
        onClick={lockQuoteAndInitiatePayment}
        disabled={isButtonDisabled}
        className="w-full bg-gray-600/90 text-white py-4 rounded-2xl font-medium text-lg hover:bg-gray-500/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading
          ? "Processing..."
          : `Buy for ₹${parsedPayAmount.toLocaleString("en-IN") || "0"}`}
      </button>

      {/* Payment Success Link */}
      {paymentData && (
        <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-700 text-center space-y-2">
          {/* Success Message */}
          <div className="flex items-center justify-center gap-2 text-green-400">
            <CheckCircle className="w-5 h-5" />
            <p className="font-medium">Payment Initiated</p>
          </div>

          {/* Transaction Details */}
          <p className="text-gray-400 text-lg truncate">
            Transaction ID: {paymentData.transactionId}
          </p>

          {/* Action Link */}
          <Link
            href={`/payment/success?txId=${paymentData.transactionId}`}
            className="text-blue-400 hover:underline text-sm font-medium"
          >
            View Payment Status
          </Link>
        </div>
      )}

      {/* Token Selection Modal */}
      {isTokenModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-900 rounded-2xl w-full max-w-md border border-gray-800">
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <h2 className="text-lg font-semibold text-white">Select Token</h2>
              <button
                onClick={() => setIsTokenModalOpen(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-2 space-y-1">
              {SUPPORTED_TOKENS.map((token) => (
                <button
                  key={token.symbol}
                  onClick={() => {
                    setSelectedToken(token);
                    setIsTokenModalOpen(false);
                  }}
                  className="w-full flex items-center gap-4 p-4 hover:bg-neutral-800 transition-colors rounded-lg"
                >
                  <img
                    src={token.logoURI}
                    alt={token.symbol}
                    width={40}
                    height={40}
                    className="rounded-full"
                  />
                  <div className="flex flex-col items-start">
                    <span className="text-white font-medium">
                      {token.symbol}
                    </span>
                    <span className="text-gray-400 text-sm">{token.name}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Chain Selection Modal */}
      {isChainModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-900 rounded-2xl w-full max-w-md border border-gray-800">
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <h2 className="text-lg font-semibold text-white">
                Select Network
              </h2>
              <button
                onClick={() => setIsChainModalOpen(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-2 space-y-1">
              {SUPPORTED_CHAINS.map((chain) => (
                <button
                  key={chain.id}
                  onClick={() => {
                    setSelectedChain(chain);
                    setIsChainModalOpen(false);
                  }}
                  className="w-full flex items-center gap-4 p-4 hover:bg-neutral-800 transition-colors rounded-lg"
                >
                  <img
                    src={chain.logoURI}
                    alt={chain.name}
                    width={40}
                    height={40}
                    className="rounded-full"
                  />
                  <div className="flex flex-col items-start">
                    <span className="text-white font-medium">{chain.name}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
