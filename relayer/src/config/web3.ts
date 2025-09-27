import dotenv from "dotenv";
import {
  http,
  type Address,
  type Chain,
  type PublicClient,
  type WalletClient,
  createPublicClient,
  createWalletClient,
  getContract,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, mainnet, unichain, unichainSepolia } from "viem/chains";
import {
  type ChainConfigs,
  type SupportedChain,
  type SupportedChainId,
  supportedChains,
} from "../types/chains";

dotenv.config();

const account = privateKeyToAccount(process.env.PRIVATE_KEY! as `0x${string}`);

const chainConfigs: ChainConfigs = {
  [mainnet.id]: {
    relayerContract: process.env.ETHEREUM_RELAYER_CONTRACT! as `0x${string}`,
    ticketNftContract: process.env
      .ETHEREUM_TICKET_NFT_CONTRACT! as `0x${string}`,
  },
  [base.id]: {
    relayerContract: process.env.BASE_RELAYER_CONTRACT! as `0x${string}`,
    ticketNftContract: process.env.BASE_TICKET_NFT_CONTRACT! as `0x${string}`,
  },
  [unichain.id]: {
    relayerContract: process.env.UNICHAIN_RELAYER_CONTRACT! as `0x${string}`,
    ticketNftContract: process.env
      .UNICHAIN_TICKET_NFT_CONTRACT! as `0x${string}`,
  },
  [unichainSepolia.id]: {
    relayerContract: process.env
      .SEPOLIA_UNICHAIN_RELAYER_CONTRACT! as `0x${string}`,
    ticketNftContract: process.env
      .SEPOLIA_UNICHAIN_TICKET_NFT_CONTRACT! as `0x${string}`,
  },
};

const publicClients = new Map<SupportedChainId, PublicClient>();
const walletClients = new Map<SupportedChainId, WalletClient>();

// Initialize clients for all supported chains
for (const chain of supportedChains) {
  const rpcUrl = getRpcUrl(chain.id);

  const publicClient = createPublicClient({
    chain: chain as Chain,
    transport: http(rpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    chain: chain as Chain,
    transport: http(rpcUrl),
  });

  publicClients.set(chain.id, publicClient);
  walletClients.set(chain.id, walletClient as WalletClient);
}

function getRpcUrl(chainId: SupportedChainId): string {
  switch (chainId) {
    case mainnet.id:
      return process.env.ETHEREUM_RPC_URL!;
    case base.id:
      return process.env.BASE_RPC_URL!;
    case unichain.id:
      return process.env.UNICHAIN_RPC_URL!;
    case unichainSepolia.id:
      return process.env.SEPOLIA_UNICHAIN_RPC_URL!;
    default:
      throw new Error(`RPC URL not configured for chain ${chainId}`);
  }
}

export const getPublicClient = (chainId: SupportedChainId): PublicClient => {
  const client = publicClients.get(chainId);
  if (!client) {
    throw new Error(`Public client not found for chain ${chainId}`);
  }
  return client;
};

export const getWalletClient = (chainId: SupportedChainId): WalletClient => {
  const client = walletClients.get(chainId);
  if (!client) {
    throw new Error(`Wallet client not found for chain ${chainId}`);
  }
  return client;
};

export const getChainConfig = (chainId: SupportedChainId) => {
  const config = chainConfigs[chainId];
  if (!config) {
    throw new Error(`Chain config not found for chain ${chainId}`);
  }
  return config;
};

export const getChain = (chainId: SupportedChainId): SupportedChain => {
  const chain = supportedChains.find((c) => c.id === chainId);
  if (!chain) {
    throw new Error(`Chain not found for chain ID ${chainId}`);
  }
  return chain;
};

export const RELAYER_ABI = [
  {
    type: "function",
    name: "mintTicket",
    inputs: [{ name: "transactionId", type: "bytes32" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "swapETHToUSDC",
    inputs: [
      { name: "transactionId", type: "bytes32" },
      { name: "user", type: "address" },
      { name: "ethAmount", type: "uint256" },
      { name: "minimumUSDCOutput", type: "uint256" },
      { name: "deadline", type: "uint64" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "swapUSDCToETH",
    inputs: [
      { name: "transactionId", type: "bytes32" },
      { name: "user", type: "address" },
      { name: "usdcAmount", type: "uint256" },
      { name: "minimumETHOutput", type: "uint256" },
      { name: "deadline", type: "uint64" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "authorizedRelayers",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "contractPaused",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
] as const;

export const TICKET_NFT_ABI = [
  {
    type: "function",
    name: "ownerOfTxn",
    inputs: [{ name: "transactionId", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "mint",
    inputs: [
      { name: "transactionId", type: "bytes32" },
      { name: "to", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "burn",
    inputs: [{ name: "transactionId", type: "bytes32" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

export const getRelayerContract = (chainId: SupportedChainId) => {
  const config = getChainConfig(chainId);
  const publicClient = getPublicClient(chainId);
  const walletClient = getWalletClient(chainId);

  return getContract({
    address: config.relayerContract,
    abi: RELAYER_ABI,
    client: { public: publicClient, wallet: walletClient },
  });
};

export const getTicketContract = (chainId: SupportedChainId) => {
  const config = getChainConfig(chainId);
  const publicClient = getPublicClient(chainId);
  const walletClient = getWalletClient(chainId);

  return getContract({
    address: config.ticketNftContract,
    abi: TICKET_NFT_ABI,
    client: { public: publicClient, wallet: walletClient },
  });
};

export const isChainSupported = (
  chainId: number
): chainId is SupportedChainId => {
  return supportedChains.some((chain) => chain.id === chainId);
};

export const getSupportedChainIds = (): SupportedChainId[] => {
  return supportedChains.map((chain) => chain.id);
};

// Export account for address access
export { account };
