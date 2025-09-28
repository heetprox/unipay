"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { UniPayAPI } from "@/lib/api";
import Link from "next/link";
import {
  QrCode,
  Smartphone,
  ArrowLeft,
  RefreshCw,
  CheckCircle,
  XCircle,
  Copy,
  Download,
} from "lucide-react";
import QRCodeLib from "qrcode";

export default function QRPaymentPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [transactionId, setTransactionId] = useState<string>("");
  const [qrCodeData, setQrCodeData] = useState<string>("");
  const [qrCodeImage, setQrCodeImage] = useState<string>("");
  const [intentUrl, setIntentUrl] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [quoteType, setQuoteType] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<
    "pending" | "checking" | "success" | "failed"
  >("pending");
  const [statusCheckInterval, setStatusCheckInterval] =
    useState<NodeJS.Timeout | null>(null);
  const [monitoringTime, setMonitoringTime] = useState(0);
  const [showManualOptions, setShowManualOptions] = useState(false);

  useEffect(() => {
    // Get transaction details from URL params or localStorage
    const txId =
      searchParams.get("txId") || localStorage.getItem("upiTransactionId");
    const qr = searchParams.get("qr") || localStorage.getItem("qrCode");
    const intent =
      searchParams.get("intent") || localStorage.getItem("intentUrl");
    const amt = localStorage.getItem("inrAmount") || "";
    const type = localStorage.getItem("quoteType") || "";

    if (txId && qr && intent) {
      setTransactionId(txId);

      // Decode QR code if it's base64 encoded
      const decodedQr = qr.startsWith("data:text/plain;base64,")
        ? atob(qr.replace("data:text/plain;base64,", ""))
        : qr;

      setQrCodeData(decodedQr);
      setIntentUrl(decodeURIComponent(intent));
      setAmount(amt);
      setQuoteType(type);

      // Generate QR code image
      generateQRCode(decodedQr);

      // Start checking payment status
      startStatusCheck(txId);
    } else {
      setError("Payment details not found. Please initiate payment again.");
      setLoading(false);
    }

    return () => {
      if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
      }
    };
  }, [searchParams]);

  const generateQRCode = async (data: string) => {
    try {
      const qrCodeDataURL = await QRCodeLib.toDataURL(data, {
        width: 280,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
      });
      setQrCodeImage(qrCodeDataURL);
      setLoading(false);
    } catch (err) {
      console.error("Failed to generate QR code:", err);
      setError("Failed to generate QR code");
      setLoading(false);
    }
  };

  const startStatusCheck = (txId: string) => {
    // Initial check immediately
    checkPaymentStatus(txId);

    // Start monitoring time counter
    const timeInterval = setInterval(() => {
      setMonitoringTime((prev) => {
        const newTime = prev + 1;
        // Show manual options after 2 minutes of monitoring
        if (newTime === 120) {
          setShowManualOptions(true);
          showToast(
            "Taking longer than expected? You can check manually or contact support.",
            "info"
          );
        }
        return newTime;
      });
    }, 1000);

    // Then check every 2 seconds for faster response
    const statusInterval = setInterval(() => {
      checkPaymentStatus(txId);
    }, 2000);

    setStatusCheckInterval(statusInterval);

    // Clean up time counter when status checking stops
    return () => {
      clearInterval(timeInterval);
      clearInterval(statusInterval);
    };
  };

  const checkPaymentStatus = async (txId: string) => {
    try {
      setPaymentStatus("checking");
      const status = await UniPayAPI.getTransactionStatus(txId);

      console.log("Payment status check:", status.payment.status);

      // Check for SUCCESS status (from backend) or completed (alternative)
      if (
        status.payment.status === "SUCCESS" ||
        status.payment.status === "completed"
      ) {
        setPaymentStatus("success");
        if (statusCheckInterval) {
          clearInterval(statusCheckInterval);
        }

        showToast(
          "Payment successful! Tokens minted automatically! Redirecting...",
          "success"
        );

        // Redirect to success page after showing success message
        setTimeout(() => {
          router.push(`/payment/success?txId=${txId}`);
        }, 1500);
      } else if (
        status.payment.status === "FAILED" ||
        status.payment.status === "failed"
      ) {
        setPaymentStatus("failed");
        if (statusCheckInterval) {
          clearInterval(statusCheckInterval);
        }
        showToast("Payment failed. Please try again.", "error");
      } else {
        setPaymentStatus("pending");
      }
    } catch (err) {
      console.error("Status check failed:", err);
      // Don't change status on API errors, keep checking
      setTimeout(() => setPaymentStatus("pending"), 1000);
    }
  };

  const openUpiApp = () => {
    if (intentUrl) {
      window.location.href = intentUrl;
    }
  };

  const copyUpiLink = async () => {
    if (qrCodeData) {
      try {
        await navigator.clipboard.writeText(qrCodeData);
        showToast("UPI link copied to clipboard!", "success");
      } catch (err) {
        console.error("Failed to copy UPI link:", err);
        // Fallback for older browsers
        const textArea = document.createElement("textarea");
        textArea.value = qrCodeData;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
        showToast("UPI link copied to clipboard!", "success");
      }
    }
  };

  const downloadQRCode = () => {
    if (qrCodeImage) {
      const link = document.createElement("a");
      link.download = `upi-qr-${transactionId}.png`;
      link.href = qrCodeImage;
      link.click();
      showToast("QR code downloaded!", "success");
    }
  };

  const showToast = (
    message: string,
    type: "success" | "error" | "info" | "warning"
  ) => {
    const toastDiv = document.createElement("div");
    const bgColor =
      type === "success"
        ? "bg-green-900/90 border-green-700"
        : type === "error"
        ? "bg-red-900/90 border-red-700"
        : "bg-blue-900/90 border-blue-700";
    toastDiv.className = `fixed top-4 right-4 ${bgColor} border text-white p-3 rounded-lg z-50 backdrop-blur-md`;
    toastDiv.textContent = message;
    document.body.appendChild(toastDiv);
    setTimeout(() => {
      if (document.body.contains(toastDiv)) {
        document.body.removeChild(toastDiv);
      }
    }, 3000);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <div className="flex items-center gap-3">
          <RefreshCw className="w-6 h-6 animate-spin" />
          <span>Loading payment details...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-black text-white">
        <div className="max-w-md w-full bg-white/10 backdrop-blur-md p-6 rounded-lg shadow-lg text-center">
          <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-4">Payment Error</h1>
          <p className="mb-6 text-gray-300">{error}</p>
          <Link
            href="/"
            className="block w-full bg-[#9478FC] text-white py-2 px-4 rounded-md hover:bg-[#7d63d4] transition-all duration-300"
          >
            Start New Payment
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-md mx-auto p-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8 pt-4">
          <Link
            href="/"
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">Complete Payment</h1>
            <p className="text-sm text-gray-400">Scan QR or use a UPI app</p>
          </div>
        </div>

        {/* Payment Amount */}
        <div className="text-center mb-8">
          <p className="text-gray-400 text-sm mb-2">You are paying</p>
          <p className="text-4xl font-bold">₹{amount}</p>
        </div>

        {/* Payment Status */}
        <div className="mb-6 p-4 bg-gray-800/50 rounded-xl border border-gray-700">
          <div className="flex items-center justify-center gap-2 mb-2">
            {(paymentStatus === "checking" || paymentStatus === "pending") && (
              <>
                <div className="w-4 h-4 bg-yellow-400 rounded-full animate-pulse" />
                <span className="text-yellow-400 text-sm font-medium">
                  Monitoring payment...
                </span>
              </>
            )}
            {paymentStatus === "success" && (
              <>
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-green-400 text-sm font-medium">
                  Payment successful!
                </span>
              </>
            )}
            {paymentStatus === "failed" && (
              <>
                <XCircle className="w-4 h-4 text-red-400" />
                <span className="text-red-400 text-sm font-medium">
                  Payment failed
                </span>
              </>
            )}
          </div>

          {(paymentStatus === "pending" || paymentStatus === "checking") && (
            <p className="text-xs text-center text-gray-400">
              Auto-checking every 2 seconds
            </p>
          )}
        </div>

        {/* QR Code Section */}
        <div className="mb-8 bg-gray-800/30 rounded-2xl p-6 text-center border border-gray-700">
          {qrCodeImage ? (
            <div className="space-y-4">
              <img
                src={qrCodeImage}
                alt="UPI QR Code"
                className="w-72 h-72 mx-auto rounded-xl border-2 border-white"
              />
              <p className="text-gray-300 text-sm">Scan using any UPI app</p>
            </div>
          ) : (
            <div className="w-72 h-72 border-2 border-gray-600 rounded-xl flex items-center justify-center bg-gray-700/30 mx-auto">
              <div className="text-center text-gray-400">
                <QrCode className="w-12 h-12 mx-auto mb-2 animate-pulse" />
                <p className="text-sm">Generating QR Code...</p>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="space-y-4 mb-8">
          <button
            onClick={openUpiApp}
            className="w-full bg-[#6C5CE7] text-white py-4 px-6 rounded-xl hover:bg-[#5A4FCF] transition-all duration-300 flex items-center justify-center gap-3 font-medium text-lg"
          >
            <Smartphone className="w-5 h-5" />
            Open UPI App to Pay
          </button>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={copyUpiLink}
              className="bg-gray-700 text-white py-3 px-4 rounded-xl hover:bg-gray-600 transition-all duration-300 flex items-center justify-center gap-2 text-sm font-medium"
            >
              <Copy className="w-4 h-4" />
              Copy UPI Link
            </button>

            <button
              onClick={downloadQRCode}
              disabled={!qrCodeImage}
              className="bg-gray-700 text-white py-3 px-4 rounded-xl hover:bg-gray-600 transition-all duration-300 flex items-center justify-center gap-2 text-sm font-medium disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              Download QR
            </button>
          </div>
        </div>

        {/* Details Section */}
        <div className="bg-gray-800/30 rounded-xl p-4 border border-gray-700 mb-6">
          <h3 className="text-white font-semibold mb-4">Details</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Buying</span>
              <span className="text-white font-medium">
                {quoteType === "ETH/INR" ? "Ethereum (ETH)" : "USD Coin (USDC)"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Transaction ID</span>
              <span className="text-[#6C5CE7] font-mono text-lg">
                {transactionId.slice(0, 16)}...
              </span>
            </div>
            {monitoringTime > 120 && (
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Time remaining</span>
                <span className="text-white font-medium">
                  {formatTime(300 - monitoringTime)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Manual Check Button */}
        <div className="text-center mb-6">
          <button
            onClick={() => checkPaymentStatus(transactionId)}
            disabled={paymentStatus === "checking"}
            className="text-[#6C5CE7] hover:underline text-sm font-medium flex items-center justify-center gap-1 mx-auto disabled:opacity-50"
          >
            <RefreshCw
              className={`w-4 h-4 ${
                paymentStatus === "checking" ? "animate-spin" : ""
              }`}
            />
            Check Payment Status Manually
          </button>
        </div>

        {/* Manual Options - Show after 2 minutes */}
        {showManualOptions && (
          <div className="mb-6 p-4 bg-yellow-900/20 border border-yellow-700 rounded-xl">
            <h4 className="font-medium text-yellow-300 mb-2">
              Payment taking longer than expected?
            </h4>
            <p className="text-sm text-yellow-200 mb-3">
              If you've completed the payment but it's not being detected
              automatically:
            </p>
            <div className="space-y-2">
              <Link
                href={`/payment/success?txId=${transactionId}`}
                className="block w-full text-center bg-yellow-700 text-white py-2 px-4 rounded-lg hover:bg-yellow-600 transition-all duration-300 text-sm"
              >
                Check Payment Status Manually
              </Link>
            </div>
          </div>
        )}

        {/* Help Text */}
        <div className="text-center text-gray-400 text-md space-y-1">
          <p>💡 Complete payment in your UPI app</p>
          <p>We'll automatically detect and process your payment</p>
        </div>
      </div>
    </div>
  );
}
