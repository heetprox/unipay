'use client';

import { useState, useEffect } from 'react';
import { UniPayAPI } from '@/lib/api';
import type { HealthResponse, ChainInfo } from '@/types/api';

export default function HealthStatus() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = async () => {
    try {
      const response = await UniPayAPI.getHealthStatus();
      setHealth(response);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch health status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ok':
        return 'text-green-400 bg-green-900/20 border-green-700';
      case 'warning':
        return 'text-yellow-400 bg-yellow-900/20 border-yellow-700';
      case 'error':
        return 'text-red-400 bg-red-900/20 border-red-700';
      default:
        return 'text-gray-400 bg-gray-900/20 border-gray-700';
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6 bg-white/10 backdrop-blur-md rounded-lg shadow-md">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200/20 rounded w-1/4 mb-4"></div>
          <div className="h-4 bg-gray-200/20 rounded w-1/2 mb-2"></div>
          <div className="h-4 bg-gray-200/20 rounded w-3/4"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-6 bg-white/10 backdrop-blur-md rounded-lg shadow-md">
        <div className="p-3 bg-red-100/20 border border-red-400 text-red-200 rounded">
          {error}
        </div>
      </div>
    );
  }

  if (!health) {
    return (
      <div className="max-w-4xl mx-auto p-6 bg-white/10 backdrop-blur-md rounded-lg shadow-md">
        <p className="text-gray-300">No health data available</p>
      </div>
    );
  }

  return (
    <div className=""></div>
    // <div className="max-w-4xl mx-auto p-6 bg-white/10 backdrop-blur-md rounded-lg shadow-md text-white">
    //   <div className="flex justify-between items-center mb-6">
    //     <h2 className="text-2xl font-bold">System Health</h2>
    //     <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(health.status)}`}>
    //       {health.status.toUpperCase()}
    //     </span>
    //   </div>
      
    //   <div className="grid grid-cols-4 gap-4 mb-6 text-center">
    //     <div className="p-3 bg-white/5 rounded-lg">
    //       <p className="text-sm text-gray-300">Total Chains</p>
    //       <p className="text-2xl font-bold">{health.summary.totalChains}</p>
    //     </div>
    //     <div className="p-3 bg-green-900/10 rounded-lg">
    //       <p className="text-sm text-gray-300">Healthy</p>
    //       <p className="text-2xl font-bold text-green-400">{health.summary.healthyChains}</p>
    //     </div>
    //     <div className="p-3 bg-yellow-900/10 rounded-lg">
    //       <p className="text-sm text-gray-300">Warning</p>
    //       <p className="text-2xl font-bold text-yellow-400">{health.summary.warningChains}</p>
    //     </div>
    //     <div className="p-3 bg-red-900/10 rounded-lg">
    //       <p className="text-sm text-gray-300">Error</p>
    //       <p className="text-2xl font-bold text-red-400">{health.summary.errorChains}</p>
    //     </div>
    //   </div>
      
    //   <h3 className="text-xl font-semibold mb-3">Chain Status</h3>
    //   <div className="space-y-4">
    //     {health.chains.map((chain: ChainInfo) => (
    //       <div key={chain.chainId} className="border border-gray-700 rounded-lg p-4">
    //         <div className="flex justify-between items-start mb-3">
    //           <div>
    //             <h4 className="font-medium text-lg">{chain.chainName}</h4>
    //             <p className="text-sm text-gray-300">Chain ID: {chain.chainId}</p>
    //           </div>
    //           <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(chain.status)}`}>
    //             {chain.status.toUpperCase()}
    //           </span>
    //         </div>
            
    //         {chain.relayer && (
    //           <div className="mb-3 p-3 bg-gray-800/50 rounded">
    //             <h5 className="text-sm font-medium mb-2">Relayer</h5>
    //             <div className="grid grid-cols-2 gap-2 text-sm">
    //               <div>
    //                 <span className="text-gray-400">Address:</span>
    //                 <span className="font-mono text-xs ml-1 break-all">{chain.relayer.address}</span>
    //               </div>
    //               <div>
    //                 <span className="text-gray-400">Authorized:</span>
    //                 <span className={chain.relayer.authorized ? 'text-green-400 ml-1' : 'text-red-400 ml-1'}>
    //                   {chain.relayer.authorized ? 'Yes' : 'No'}
    //                 </span>
    //               </div>
    //               <div>
    //                 <span className="text-gray-400">Balance:</span>
    //                 <span className="ml-1">{chain.relayer.balance}</span>
    //               </div>
    //             </div>
    //           </div>
    //         )}
            
    //         {chain.contract && (
    //           <div className="p-3 bg-gray-800/50 rounded">
    //             <h5 className="text-sm font-medium mb-2">Contract</h5>
    //             <div className="grid grid-cols-2 gap-2 text-sm">
    //               <div>
    //                 <span className="text-gray-400">Relayer Address:</span>
    //                 <span className="font-mono text-xs ml-1 break-all">{chain.contract.relayerAddress}</span>
    //               </div>
    //               <div>
    //                 <span className="text-gray-400">NFT Address:</span>
    //                 <span className="font-mono text-xs ml-1 break-all">{chain.contract.ticketNftAddress}</span>
    //               </div>
    //               <div>
    //                 <span className="text-gray-400">Paused:</span>
    //                 <span className={chain.contract.paused ? 'text-red-400 ml-1' : 'text-green-400 ml-1'}>
    //                   {chain.contract.paused ? 'Yes' : 'No'}
    //                 </span>
    //               </div>
    //             </div>
    //           </div>
    //         )}
            
    //         {chain.error && (
    //           <div className="mt-3 p-2 bg-red-900/20 border border-red-700 rounded text-red-300 text-sm">
    //             {chain.error}
    //           </div>
    //         )}
    //       </div>
    //     ))}
    //   </div>
      
    //   <div className="mt-4 text-right text-sm text-gray-400">
    //     Last updated: {new Date(health.timestamp).toLocaleString()}
    //   </div>
    // </div>
  );
}