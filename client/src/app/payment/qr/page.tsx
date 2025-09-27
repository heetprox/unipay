"use client";

import React, { useState, useEffect, useCallback } from "react";

// --- Mock Icons (from lucide-react) ---
const Icon = ({ name, className }) => {
  const icons = {
    ArrowLeft: (p) => (
      <svg
        {...p}
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m12 19-7-7 7-7" />
        <path d="M19 12H5" />
      </svg>
    ),
    RefreshCw: (p) => (
      <svg
        {...p}
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
        <path d="M21 3v5h-5" />
        <path d="M3 21a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 16" />
        <path d="M3 16v5h5" />
      </svg>
    ),
    CheckCircle: (p) => (
      <svg
        {...p}
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
    XCircle: (p) => (
      <svg
        {...p}
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    ),
    Smartphone: (p) => (
      <svg
        {...p}
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
        <line x1="12" y1="18" x2="12.01" y2="18" />
      </svg>
    ),
    QrCode: (p) => (
      <svg
        {...p}
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
      </svg>
    ),
    Download: (p) => (
      <svg
        {...p}
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    ),
    Copy: (p) => (
      <svg
        {...p}
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
    ),
    Info: (p) => (
      <svg
        {...p}
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    ),
  };
  const IconComponent = icons[name];
  return IconComponent ? <IconComponent className={className} /> : null;
};

let mockStatusIndex = 0;
const UniPayAPI = {
  getTransactionStatus: async (txId) => {
    const mockStatusCycle = [
      "pending",
      "pending",
      "checking",
      "checking",
      "SUCCESS",
    ];
    await new Promise((resolve) => setTimeout(resolve, 2000)); // Simulate network delay
    const status = mockStatusCycle[mockStatusIndex];
    if (paymentStatus !== "success") {
      mockStatusIndex = (mockStatusIndex + 1) % mockStatusCycle.length;
    }
    console.log(`Mock API: Checked ${txId}, status is ${status}`);
    return { payment: { status } };
  },
};
// In a real app, you would use a library like 'qrcode'
const QRCodeLib = {
  toDataURL: (text) =>
    Promise.resolve(
      `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(
        text
      )}`
    ),
};

// --- UI Components ---
const StatusPill = ({ status }) => {
  const statusConfig = {
    pending: {
      text: "Monitoring Payment",
      icon: (
        <div className="w-2.5 h-2.5 bg-yellow-400 rounded-full animate-pulse"></div>
      ),
      color: "bg-yellow-400/10 text-yellow-400",
    },
    checking: {
      text: "Checking...",
      icon: <Icon name="RefreshCw" className="w-3.5 h-3.5 animate-spin" />,
      color: "bg-blue-400/10 text-blue-400",
    },
    success: {
      text: "Payment Successful",
      icon: <Icon name="CheckCircle" className="w-3.5 h-3.5" />,
      color: "bg-green-400/10 text-green-400",
    },
    failed: {
      text: "Payment Failed",
      icon: <Icon name="XCircle" className="w-3.5 h-3.5" />,
      color: "bg-red-400/10 text-red-400",
    },
  };
  const config = statusConfig[status] || statusConfig.pending;
  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-lg font-medium ${config.color} transition-all`}
    >
      {config.icon}
      <span>{config.text}</span>
    </div>
  );
};

const Toast = ({ message, type, onDismiss }) => {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const colors = {
    success: "bg-green-900/90 border-green-700",
    error: "bg-red-900/90 border-red-700",
    info: "bg-blue-900/90 border-blue-700",
  };

  return (
    <div
      className={`w-full max-w-sm p-3 border rounded-lg shadow-lg backdrop-blur-md ${colors[type]}`}
    >
      {message}
    </div>
  );
};

// --- Main App Component ---
export default function App() {
  const [transactionId, setTransactionId] = useState("");
  const [qrCodeData, setQrCodeData] = useState("");
  const [qrCodeImage, setQrCodeImage] = useState("");
  const [intentUrl, setIntentUrl] = useState("");
  const [amount, setAmount] = useState("");
  const [quoteType, setQuoteType] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [paymentStatus, setPaymentStatus] = useState("pending");
  const [monitoringTime, setMonitoringTime] = useState(300); // 5 minutes countdown
  const [showManualOptions, setShowManualOptions] = useState(false);
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const checkPaymentStatus = useCallback(
    async (txId) => {
      try {
        setPaymentStatus("checking");
        const status = await UniPayAPI.getTransactionStatus(txId);
        const backendStatus = status.payment.status.toUpperCase();

        if (backendStatus === "SUCCESS" || backendStatus === "COMPLETED") {
          setPaymentStatus("success");
          showToast("Payment successful! Redirecting...", "success");
          setTimeout(() => {
            // In Next.js, you'd use router.push(...)
            window.location.href = `/payment/success?txId=${txId}`;
          }, 1500);
        } else if (backendStatus === "FAILED") {
          setPaymentStatus("failed");
          showToast("Payment failed. Please try again.", "error");
        } else {
          setPaymentStatus("pending");
        }
      } catch (err) {
        console.error("Status check failed:", err);
        // Don't show error toast for intermittent network issues, just revert to pending
        setTimeout(() => setPaymentStatus("pending"), 1000);
      }
    },
    [showToast]
  );

  useEffect(() => {
    // --- Simulate fetching data from URL/localStorage ---
    const mockData = {
      txId: "T2409241138ABCDEF123",
      qr: "upi://pay?pa=merchant@upi&pn=CryptoMerchant&am=10000.00&cu=INR",
      intent: "upi://pay?pa=merchant@upi&pn=CryptoMerchant&am=10000.00&cu=INR",
      amt: "10,000.00",
      type: "ETH/INR",
    };

    if (mockData.txId && mockData.qr && mockData.intent) {
      setTransactionId(mockData.txId);
      setQrCodeData(mockData.qr);
      setIntentUrl(decodeURIComponent(mockData.intent));
      setAmount(mockData.amt);
      setQuoteType(mockData.type);

      QRCodeLib.toDataURL(mockData.qr)
        .then(setQrCodeImage)
        .catch((err) => {
          console.error("Failed to generate QR code:", err);
          setError("Could not generate QR code.");
        })
        .finally(() => setLoading(false));
    } else {
      setError("Payment details not found. Please try again.");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let statusInterval;
    if (
      transactionId &&
      paymentStatus !== "success" &&
      paymentStatus !== "failed"
    ) {
      // Initial check, then poll every 2 seconds
      checkPaymentStatus(transactionId);
      statusInterval = setInterval(
        () => checkPaymentStatus(transactionId),
        2500
      );
    }
    return () => clearInterval(statusInterval);
  }, [transactionId, paymentStatus, checkPaymentStatus]);

  useEffect(() => {
    let timeInterval;
    if (paymentStatus === "pending" || paymentStatus === "checking") {
      timeInterval = setInterval(() => {
        setMonitoringTime((prev) => {
          if (prev <= 180) {
            // Show manual options with 3 minutes remaining
            setShowManualOptions(true);
          }
          return prev > 0 ? prev - 1 : 0;
        });
      }, 1000);
    }
    return () => clearInterval(timeInterval);
  }, [paymentStatus]);

  const openUpiApp = () => {
    if (intentUrl) window.location.href = intentUrl;
  };

  const copyUpiLink = () => {
    if (qrCodeData) {
      navigator.clipboard
        .writeText(qrCodeData)
        .then(() => showToast("UPI link copied!", "success"))
        .catch(() => showToast("Failed to copy link.", "error"));
    }
  };

  const downloadQRCode = () => {
    if (qrCodeImage) {
      const link = document.createElement("a");
      link.download = `upi-qr-${transactionId}.png`;
      link.href = qrCodeImage;
      link.click();
    }
  };

  // --- Render Logic ---
  if (loading) {
    return (
      <div className="min-h-screen text-white flex items-center justify-center">
        <div className="flex items-center gap-3 text-lg">
          <Icon name="RefreshCw" className="w-6 h-6 animate-spin" />
          <span>Loading Payment Details...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen text-white flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center bg-black/30 backdrop-blur-sm rounded-2xl p-8">
          <Icon
            name="XCircle"
            className="w-16 h-16 text-red-400 mx-auto mb-4"
          />
          <h1 className="text-2xl font-bold mb-2">Payment Error</h1>
          <p className="mb-6 text-gray-300">{error}</p>
          <a
            href="/"
            className="block w-full bg-indigo-600 font-semibold text-white py-2 px-4 rounded-xl hover:bg-indigo-500 transition-all"
          >
            Start New Payment
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-gray-200 font-sans flex items-center justify-center p-4">
      {/* Toast Container */}
      <div className="fixed top-5 right-5 z-50 space-y-2">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            {...toast}
            onDismiss={() =>
              setToasts((p) => p.filter((t) => t.id !== toast.id))
            }
          />
        ))}
      </div>

      <div className="w-full max-w-md mx-auto">
        <header className="flex items-center gap-3 mb-6">
          <a
            href="#"
            className="p-2 text-gray-400 hover:bg-white/10 rounded-full transition-colors"
          >
            <Icon name="ArrowLeft" className="w-6 h-6" />
          </a>
          <div>
            <h1 className="text-2xl font-bold text-white">Complete Payment</h1>
            <p className="text-lg text-gray-400">Scan QR or use a UPI app</p>
          </div>
        </header>

        <main className="space-y-6">
          <div className="bg-black/30 backdrop-blur-sm border border-white/10 rounded-2xl shadow-2xl shadow-indigo-500/10 overflow-hidden">
            <div className="p-6">
              <div className="text-center">
                <span className="text-gray-400 text-md">You are paying</span>
                <p className="text-4xl sm:text-5xl font-bold text-white mt-1">
                  ₹{amount}
                </p>
                <div className="mt-4">
                  <StatusPill status={paymentStatus} />
                </div>
              </div>
            </div>

            <div className="px-6 pb-6">
              {qrCodeImage ? (
                <img
                  src={qrCodeImage}
                  alt="UPI QR Code"
                  className="w-full max-w-[250px] mx-auto rounded-lg border-4 border-white/10"
                />
              ) : (
                <div className="w-full max-w-[250px] h-[250px] mx-auto bg-gray-800/50 rounded-lg flex items-center justify-center">
                  <div className="text-center text-gray-400">
                    <Icon
                      name="QrCode"
                      className="w-12 h-12 mx-auto animate-pulse"
                    />
                    <p className="text-sm mt-2">Generating QR Code...</p>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-black/20 px-6 py-4 border-t border-white/10 text-center">
              <p className="text-lg text-gray-300">Scan using any UPI app</p>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={openUpiApp}
              className="w-full bg-indigo-600 text-white font-semibold py-3 px-4 rounded-xl hover:bg-indigo-500 transition-all duration-300 flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 focus:ring-4 focus:ring-indigo-500/50"
            >
              <Icon name="Smartphone" className="w-5 h-5" />
              Open UPI App to Pay
            </button>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={copyUpiLink}
                className="bg-white/10 text-white py-2.5 px-3 rounded-xl hover:bg-white/20 transition-all duration-300 text-sm flex items-center justify-center gap-2 font-medium"
              >
                <Icon name="Copy" className="w-4 h-4" />
                Copy UPI Link
              </button>
              <button
                onClick={downloadQRCode}
                disabled={!qrCodeImage}
                className="bg-white/10 text-white py-2.5 px-3 rounded-xl hover:bg-white/20 transition-all duration-300 text-sm disabled:opacity-50 flex items-center justify-center gap-2 font-medium"
              >
                <Icon name="Download" className="w-4 h-4" />
                Download QR
              </button>
            </div>
          </div>

          <div className="bg-black/30 border border-white/10 rounded-2xl p-5">
            <h3 className="font-semibold text-white mb-3">Details</h3>
            <div className="space-y-2 text-lg">
              <div className="flex justify-between">
                <span className="text-gray-400">Buying</span>
                <span className="font-medium text-white">
                  {quoteType === "ETH/INR" ? "Ethereum (ETH)" : "USDC"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Transaction ID</span>
                <span className="font-mono text-xs text-indigo-300">
                  {transactionId}
                </span>
              </div>
              {(paymentStatus === "pending" ||
                paymentStatus === "checking") && (
                <div className="flex justify-between items-center pt-2 border-t border-white/10">
                  <span className="text-gray-400">Time remaining</span>
                  <span className="font-medium text-white">
                    {Math.floor(monitoringTime / 60)}:
                    {(monitoringTime % 60).toString().padStart(2, "0")}
                  </span>
                </div>
              )}
            </div>
          </div>

          {showManualOptions && (
            <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-2xl p-5 text-center">
              <h4 className="font-semibold text-yellow-200 mb-2">
                Payment taking too long?
              </h4>
              <p className="text-sm text-yellow-200/80 mb-4">
                If you've paid but it's not detected, you can force a check.
              </p>
              <button
                onClick={() => checkPaymentStatus(transactionId)}
                disabled={paymentStatus === "checking"}
                className="w-full bg-yellow-600 text-white font-semibold py-2.5 px-4 rounded-xl hover:bg-yellow-500 transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:bg-yellow-800"
              >
                <Icon
                  name="RefreshCw"
                  className={`w-4 h-4 ${
                    paymentStatus === "checking" ? "animate-spin" : ""
                  }`}
                />
                Check Status Now
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
