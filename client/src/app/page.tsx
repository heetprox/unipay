'use client'

import UpiPayment from "@/components/UpiPayment";
import PriceDisplay from "@/components/PriceDisplay";
import SimpleButton from "@/components/SimpleButton";

export default function Home() {
  return (
   <div className="w-full min-h-screen bg-black">
    {/* Hero Section */}
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="w-full max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-4 b-font">
            UniPay
          </h1>
          <p className="text-xl text-gray-300 mb-2">
            Buy Crypto with UPI
          </p>
          <p className="text-gray-400">
            Seamlessly convert INR to ETH or USDC using India's UPI payment system
          </p>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* Price Display */}
          <div className="order-2 lg:order-1">
            <PriceDisplay />
          </div>

          {/* Payment Form */}
          <div className="order-1 lg:order-2">
            <UpiPayment />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap justify-center gap-4 mt-12">
          <SimpleButton title="Open Dashboard" href="/dashboard" />
          <SimpleButton title="Check Transaction Status" href="/payment/success" />
          <SimpleButton title="Claim Tokens" href="/claim" />
          <SimpleButton title="System Health" href="/health" />
        </div>

        {/* Features Section */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center p-6 bg-white/5 rounded-lg">
            <div className="text-3xl mb-3">⚡</div>
            <h3 className="text-lg font-semibold text-white mb-2">Instant Payments</h3>
            <p className="text-gray-400 text-sm">
              Pay with UPI and get your crypto tokens instantly on supported blockchains
            </p>
          </div>
          
          <div className="text-center p-6 bg-white/5 rounded-lg">
            <div className="text-3xl mb-3">🔒</div>
            <h3 className="text-lg font-semibold text-white mb-2">Secure & Reliable</h3>
            <p className="text-gray-400 text-sm">
              Built on battle-tested infrastructure with multi-chain support
            </p>
          </div>
          
          <div className="text-center p-6 bg-white/5 rounded-lg">
            <div className="text-3xl mb-3">📱</div>
            <h3 className="text-lg font-semibold text-white mb-2">Easy to Use</h3>
            <p className="text-gray-400 text-sm">
              Simple interface that works with any UPI app on your phone
            </p>
          </div>
        </div>
      </div>
    </div>
   </div>
  );
}
