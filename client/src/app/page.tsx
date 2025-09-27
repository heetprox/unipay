'use client'

import UpiPayment from "@/components/UpiPayment";
import SimpleButton from "@/components/SimpleButton";

export default function Home() {
  return (
   <div className="w-full h-full min-h-screen flex flex-col items-center justify-center bg-black">
    <div className="flex gap-8 flex-col w-full max-w-md">
      <div className="text-4xl text-white b-font text-center">Get Your Crypto</div>
      
      <UpiPayment />
      
      <div className="flex justify-center space-x-4 mt-4">
        <SimpleButton title="Check Transaction Status" href="/payment/success" />
        <SimpleButton title="Claim Tokens" href="/claim" />
        <SimpleButton title="System Health" href="/health" />
      </div>
    </div>
   </div>
  );
}
