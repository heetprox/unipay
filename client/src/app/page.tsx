"use client";

import UpiPayment from "@/components/UpiPayment";
import PriceDisplay from "@/components/PriceDisplay";
import SimpleButton from "@/components/SimpleButton";
import Background from "@/components/animations/BackGround";

export default function Home() {
  return (
    <div className="w-full min-h-screen h-[100vh]">
      <div className="flex flex-col items-center justify-start  bg-gradient-to-t from-purple-950 to-black h-full">
        <div className="w-full max-w-6xl mx-auto">
          {/* <Background /> */}
          <div className="text-center mb-12">
            <h1 className="text-5xl md:text-6xl font-bold text-white mb-4 m-font">
              Buy crypto @ lightning speed⚡
            </h1>
            <p className="text-xl text-gray-300 mb-2">
              Select the amount to buy &rarr; Scan the QR &rarr; Crypto in your
              pocket
            </p>
          </div>

          {/* Main Content Grid */}
          {/* <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start"> */}
          <div className="gap-8 flex justify-center w-full">
            {/* Price Display */}
            <div className="order-2 lg:order-1 w-1/2">
              <PriceDisplay />
            </div>

            {/* Payment Form */}
            <div className="order-1 lg:order-2 w-1/2">
              <UpiPayment />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap justify-center gap-4">
            <SimpleButton title="Transaction Status" href="/payment/success" />
            <SimpleButton title="Claim Tokens" href="/claim" />
            <SimpleButton title="System Health" href="/health" />
          </div>
        </div>
      </div>
    </div>
  );
}
