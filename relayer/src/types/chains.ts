import { defineChain } from "viem";
import { base, mainnet, sepolia } from "viem/chains";

export const unichain = defineChain({
  id: 1301,
  name: "Unichain",
  nativeCurrency: { name: "Ethereum", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://sepolia-rpc.unichain.org"] },
  },
  blockExplorers: {
    default: { name: "Unichain Explorer", url: "https://unichain-sepolia.blockscout.com" },
  },
});

export const sepoliaUnichain = defineChain({
  id: 1301, // Note: Using same ID for now, adjust if different
  name: "Sepolia Unichain",
  nativeCurrency: { name: "Ethereum", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://sepolia-rpc.unichain.org"] },
  },
  blockExplorers: {
    default: { name: "Sepolia Unichain Explorer", url: "https://unichain-sepolia.blockscout.com" },
  },
});

export const supportedChains = [mainnet, base, unichain, sepoliaUnichain] as const;

export type SupportedChain = (typeof supportedChains)[number];
export type SupportedChainId = SupportedChain["id"];

export interface ChainConfig {
  relayerContract: `0x${string}`;
  ticketNftContract: `0x${string}`;
}

export type ChainConfigs = Record<SupportedChainId, ChainConfig>;
