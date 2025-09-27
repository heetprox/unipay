'use client';

import HealthStatus from '@/components/HealthStatus';
import Link from 'next/link';

export default function HealthPage() {
  return (
    <div className="min-h-screen p-4 bg-black text-white">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">System Health</h1>
          <p className="text-gray-300">Monitor the status of the UniPay relayer system</p>
        </div>
        
        <HealthStatus />
        
        <div className="mt-6">
          <Link 
            href="/"
            className="inline-block bg-gray-700 text-white py-2 px-4 rounded-md hover:bg-gray-600 transition-all duration-300"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}