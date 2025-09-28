"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { UniPayAPI } from "@/lib/api";
import { useAccount } from "wagmi";
import TransactionStatus from "@/components/TransactionStatus";
import ClaimTokens from "@/components/ClaimTokens";
import Link from "next/link";
import { CheckCircle, Clock, AlertTriangle, RefreshCw } from "lucide-react";
import type { TransactionStatusResponse } from "@/types/api";

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-black text-white">
      <div className="flex items-center gap-3">
        <RefreshCw className="w-6 h-6 animate-spin" />
        <span>Loading payment details...</span>
      </div>
    </div>}>
      <PaymentSuccessContent />
    </Suspense>
  );
}

function PaymentSuccessContent() {
  const searchParams = useSearchParams();
  const { address } = useAccount();
  const [transactionId, setTransactionId] = useState<string>("");
  const [paymentStatus, setPaymentStatus] = useState<
    "loading" | "pending" | "completed" | "failed"
  >("loading");
  const [transactionData, setTransactionData] =
    useState<TransactionStatusResponse | null>(null);
  const [showClaimSection, setShowClaimSection] = useState(false);

  useEffect(() => {
    // Try to get transaction ID from URL params first
    const txId = searchParams.get("txId");

    if (txId) {
      setTransactionId(txId);
      checkPaymentStatus(txId);
    } else {
      // Fallback to localStorage if not in URL
      const storedTxId = localStorage.getItem("upiTransactionId");
      if (storedTxId) {
        setTransactionId(storedTxId);
        checkPaymentStatus(storedTxId);
      }
    }
  }, [searchParams]);

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

  if (!transactionId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-black text-white">
        <div className="max-w-md w-full bg-white/10 backdrop-blur-md p-6 rounded-lg shadow-lg">
          <h1 className="text-2xl font-bold mb-4">Transaction Not Found</h1>
          <p className="mb-6">
            No transaction ID was found. Please initiate a payment first.
          </p>
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
    <div className="min-h-screen bg-black text-white p-4">
      <div className="max-w-2xl mx-auto">
        <div className="mt-14">
          <h1 className="text-3xl font-bold">Payment Status</h1>
          <p className="text-gray-300">
            Track your payment and claim your tokens
          </p>
        </div>

     
        {/* Transaction Status Details */}
        <div className="mb-6">
          <TransactionStatus
            transactionId={transactionId}
            autoRefresh={paymentStatus === "pending"}
          />
        </div>

        {/* Success Message - Show when payment is completed */}
        {paymentStatus === "completed" && (
          <div className="mb-6">
            {transactionData &&
            transactionData.jobs.some(
              (job) => job.method === "MINT" && job.status === "MINED"
            ) ? (
              <div className="p-4 bg-green-900/20 border border-green-700 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-5 h-5 text-green-400" />
                  <h3 className="font-semibold text-green-300">
                    Tokens Minted Successfully! 🎉
                  </h3>
                </div>
                <p className="text-green-200 text-sm mb-3">
                  Your payment was successful and your tokens have been
                  automatically minted to your wallet!
                </p>

                {/* Show minting details */}
                {transactionData.jobs
                  .filter(
                    (job) => job.method === "MINT" && job.status === "MINED"
                  )
                  .map((job) => (
                    <div
                      key={job.id}
                      className="mt-3 p-3 bg-green-800/30 rounded text-xs"
                    >
                      <div className="grid grid-cols-2 gap-2">
                        <span className="text-green-300">Network:</span>
                        <span className="text-green-200">
                          {job.chainName || `Chain ${job.chainId}`}
                        </span>
                        <span className="text-green-300">Block:</span>
                        <span className="text-green-200">
                          {job.blockNumber}
                        </span>
                        <span className="text-green-300">Gas Used:</span>
                        <span className="text-green-200">{job.gasUsed}</span>
                      </div>
                      {job.txHash && (
                        <div className="mt-2">
                          <span className="text-green-300">Transaction: </span>
                          <span className="font-mono text-green-200 break-all">
                            {job.txHash}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            ) : transactionData &&
              transactionData.jobs.some(
                (job) => job.method === "MINT" && job.status === "PENDING"
              ) ? (
              <div className="p-4 bg-blue-900/20 border border-blue-700 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />
                  <h3 className="font-semibold text-blue-300">
                    Minting Tokens...
                  </h3>
                </div>
                <p className="text-blue-200 text-sm">
                  Your payment was successful! We&apos;re currently minting your
                  tokens on the blockchain. This usually takes a few seconds.
                </p>
              </div>
            ) : showClaimSection ? (
              <div className="mb-4">
                <div className="mb-4 p-4 bg-green-900/20 border border-green-700 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-5 h-5 text-green-400" />
                    <h3 className="font-semibold text-green-300">
                      Ready to Claim!
                    </h3>
                  </div>
                  <p className="text-green-200 text-sm">
                    Your payment has been confirmed. You can now claim your
                    tokens to your wallet.
                  </p>
                </div>

                <ClaimTokens transactionId={transactionId} />
              </div>
            ) : null}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-4">
          <Link
            href="/"
            className="flex-1 text-center bg-gray-700 text-white py-3 px-4 rounded-md hover:bg-gray-600 transition-all duration-300"
          >
            New Payment
          </Link>

          {!showClaimSection && (
            <Link
              href={`/claim?txId=${transactionId}`}
              className="flex-1 text-center bg-[#9478FC] text-white py-3 px-4 rounded-md hover:bg-[#7d63d4] transition-all duration-300"
            >
              Manual Claim
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
