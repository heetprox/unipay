"use client";

import { useState, useEffect } from "react";
import { ScanLine, Timer, Info, Copy } from "lucide-react";

interface UpiPaymentPageProps {
  qrCodeUrl: string;
  upiId: string;
  amount: string | number;
  expiresInSeconds: number;
  onPaymentSuccess?: () => void; // Optional callback
  onPaymentExpired: () => void;
}

interface CountdownTimerProps {
  seconds: number;
  onExpired: () => void;
}

export default function UpiPaymentPage({
  qrCodeUrl,
  upiId,
  amount,
  expiresInSeconds,
  onPaymentSuccess,
  onPaymentExpired,
}: UpiPaymentPageProps) {
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    // In a real app, you'd show a toast notification here
    alert("Copied to clipboard!");
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 bg-transparent text-white">
      <div className="max-w-sm w-full bg-neutral-900/80 backdrop-blur-lg border border-neutral-700 rounded-2xl p-6 text-center space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Scan to Pay</h1>
          <p className="text-neutral-400">
            Complete your payment to receive your crypto
          </p>
        </div>

        {/* QR Code Section */}
        <div className="relative w-48 h-48 mx-auto bg-white p-2 rounded-lg flex items-center justify-center">
          {/* Replace this with your actual QR code image */}
          <img
            src={
              qrCodeUrl ||
              "https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=upi://pay?pa=example@upi&pn=Example&am=100.00&cu=INR"
            }
            alt="UPI QR Code"
            className="w-full h-full"
          />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <ScanLine className="w-24 h-24 text-black/10 animate-pulse" />
          </div>
        </div>

        {/* Payment Details */}
        <div className="space-y-2">
          <p className="text-neutral-400">Amount to be paid</p>
          <p className="text-3xl font-bold">
            ₹{parseFloat(amount || 0).toLocaleString("en-IN")}
          </p>
        </div>

        {/* UPI ID Copy */}
        <div className="bg-neutral-800 p-3 rounded-lg text-center space-y-1">
          <p className="text-xs text-neutral-400">Or pay using UPI ID</p>
          <div className="flex items-center justify-center gap-2">
            <span className="font-mono text-sm">
              {upiId || "payment@exampleupi"}
            </span>
            <button
              onClick={() => copyToClipboard(upiId)}
              className="text-neutral-400 hover:text-white transition-colors"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Countdown Timer */}
        <CountdownTimer
          seconds={expiresInSeconds}
          onExpired={onPaymentExpired}
        />

        {/* Instructions */}
        <div className="flex items-start gap-3 text-left text-xs text-neutral-400 p-3 bg-neutral-800/50 rounded-lg">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Please complete the payment within the given time. The page will
            automatically update once payment is detected.
          </span>
        </div>

        {/* Cancel Button */}
        <a
          href="/"
          className="w-full block text-center bg-neutral-700 text-white py-3 px-4 rounded-xl hover:bg-neutral-600 transition-colors font-semibold"
        >
          Cancel Payment
        </a>
      </div>
    </div>
  );
}

// Sub-component for the countdown logic
function CountdownTimer({ seconds = 300, onExpired }) {
  const [timeLeft, setTimeLeft] = useState(seconds);

  useEffect(() => {
    if (timeLeft <= 0) {
      if (onExpired) onExpired();
      return;
    }

    const interval = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [timeLeft, onExpired]);

  const minutes = Math.floor(timeLeft / 60);
  const remainingSeconds = timeLeft % 60;

  const isLowTime = timeLeft <= 60;

  return (
    <div
      className={`p-2 rounded-lg border ${
        isLowTime ? "border-red-500/50 bg-red-900/30" : "border-neutral-700"
      }`}
    >
      <div className="flex items-center justify-center gap-2">
        <Timer
          className={`w-5 h-5 ${
            isLowTime ? "text-red-400" : "text-neutral-400"
          }`}
        />
        <span
          className={`font-mono text-lg font-medium ${
            isLowTime ? "text-red-400 animate-pulse" : "text-neutral-200"
          }`}
        >
          {String(minutes).padStart(2, "0")}:
          {String(remainingSeconds).padStart(2, "0")}
        </span>
      </div>
      <p className="text-xs text-neutral-500 mt-1">Quote expires in</p>
    </div>
  );
}
