"use client";

import { Loader } from "lucide-react";

export default function LoadingSpinner({ text = "Light speed!" }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center backdrop-blur-sm">
      <div className="flex flex-col items-center justify-center gap-3">
        <Loader className="w-8 h-8 text-white animate-spin" />
        <span className="text-xl font-medium text-white">{text}</span>
      </div>
    </div>
  );
}
