'use client'

import { WagmiProvider, createConfig, http } from "wagmi";
import { mainnet } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectKitProvider, getDefaultConfig } from "connectkit";
import { ReactNode } from "react";

// Type for the provider props
interface Web3ProviderProps {
  children: ReactNode;
}

// Validate environment variables
const alchemyId = process.env.NEXT_PUBLIC_ALCHEMY_ID;
const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

if (!alchemyId) {
  throw new Error("NEXT_PUBLIC_ALCHEMY_ID is required");
}

if (!walletConnectProjectId) {
  throw new Error("NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is required");
}

// from family.co wallet connect kit
const config = createConfig(
  getDefaultConfig({
    // Your dApps chains
    chains: [mainnet],
    transports: {
      // RPC URL for each chain
      [mainnet.id]: http(`https://eth-mainnet.g.alchemy.com/v2/${alchemyId}`),
    },

    // Required API Keys
    walletConnectProjectId: walletConnectProjectId,

    // Required App Info
    appName: "Your App Name",

    // Optional App Info
    appDescription: "Your App Description",
    appUrl: "https://family.co", // your app's url
    appIcon: "https://family.co/logo.png", // your app's icon, no bigger than 1024x1024px (max. 1MB)
  }),
);

const queryClient = new QueryClient();

export const Web3Provider = ({ children }: Web3ProviderProps) => {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider>{children}</ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};