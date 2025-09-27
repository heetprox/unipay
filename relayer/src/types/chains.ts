import { base, mainnet, unichain, unichainSepolia } from "viem/chains";

export const supportedChains = [
  mainnet,
  base,
  unichain,
  unichainSepolia,
] as const;

export type SupportedChain = (typeof supportedChains)[number];
export type SupportedChainId = SupportedChain["id"];

export interface ChainConfig {
  relayerContract: `0x${string}`;
  ticketNftContract: `0x${string}`;
}

export type ChainConfigs = Record<SupportedChainId, ChainConfig>;
