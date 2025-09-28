import { EventEmitter } from "node:events";
import { HermesClient } from "@pythnetwork/hermes-client";
import {
  http,
  createPublicClient,
  createWalletClient,
  formatEther,
  formatUnits,
  parseEther,
  keccak256,
  encodePacked,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import prisma from "../config/database";
import { PRICING_ORACLE_ABI } from "../config/web3";

interface PriceData {
  price: string;
  expo: number;
  publishTime: number;
  conf: string;
}

interface PythStreamResponse {
  type: string;
  price_feed: {
    id: string;
    price: PriceData;
  };
}

interface PythPriceResponse {
  binary: {
    data: string[];
  };
  parsed: Array<{
    id: string;
    price: PriceData;
  }>;
}

export interface PriceFeed {
  symbol: string;
  price: number;
  publishTime: number;
  confidence: number;
  vaa?: string; // Price update data for on-chain submission
}

export interface Quote {
  id: string;
  userId: string;
  type: "ETH/INR" | "USD/INR";
  inrAmount: number;
  outputAmount: number; // ETH amount for ETH/INR, USD amount for USD/INR
  inputAmount: number; // USDC amount for ETH/INR, ETH amount for USD/INR
  ethPrice?: number; // Only for ETH/INR quotes
  inrPrice: number;
  lockedAt: number;
  expiresAt: number;
  isOnChain?: boolean; // Flag to indicate if this is an on-chain quote
  claimed?: boolean;
  // Raw BigInt values for contract calls (only available for on-chain quotes)
  rawOutputAmount?: bigint;
  rawInputAmount?: bigint;
  rawInrAmount?: bigint;
}

class PriceService extends EventEmitter {
  private readonly HERMES_BASE_URL = "https://hermes.pyth.network";
  private readonly PRICE_FEED_IDS = {
    "ETH/USD":
      "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
    "USD/INR":
      "0x0ac0f9a2886fc2dd708bc66cc2cea359052ce89d324f45d95fadbc6c4fcf1809",
  };

  private currentPrices: Map<string, PriceFeed> = new Map();
  private eventSource: EventSource | null = null;

  // Pyth Oracle integration
  private hermesClient: HermesClient | null = null;
  private publicClient: any = null;
  private walletClient: any = null;
  private pricingOracleAddress: `0x${string}` | null = null;
  private pythEnabled = false;

  constructor() {
    super();
    console.log("PriceService constructor called");
    this.initializePythOracle();
    this.initializePrices();
  }

  private initializePythOracle() {
    const rpcUrl = process.env.SEPOLIA_UNICHAIN_RPC_URL;
    const privateKey = process.env.PRIVATE_KEY;
    const pricingOracleAddr = process.env.PRICING_ORACLE_ADDRESS;

    if (rpcUrl && privateKey && pricingOracleAddr) {
      try {
        this.hermesClient = new HermesClient(this.HERMES_BASE_URL);

        this.publicClient = createPublicClient({
          transport: http(rpcUrl),
        });

        const account = privateKeyToAccount(privateKey as `0x${string}`);
        this.walletClient = createWalletClient({
          account,
          transport: http(rpcUrl),
        });

        this.pricingOracleAddress = pricingOracleAddr as `0x${string}`;
        this.pythEnabled = true;

        console.log("Pyth Oracle integration initialized");
        console.log("Pricing Oracle Address:", this.pricingOracleAddress);
      } catch (error) {
        console.error("Failed to initialize Pyth Oracle:", error);
        this.pythEnabled = false;
      }
    } else {
      console.log("Pyth Oracle disabled - missing environment variables");
      this.pythEnabled = false;
    }
  }

  private async initializePrices() {
    try {
      console.log("Initializing prices...");
      await this.fetchLatestPrices();
      console.log("Initial prices fetched, starting price stream...");
      this.startPriceStream();
    } catch (error) {
      console.error("Error initializing prices:", error);
      // Still start the stream even if initial fetch fails
      this.startPriceStream();
    }
  }

  private startPriceStream() {
    const priceIds = Object.values(this.PRICE_FEED_IDS)
      .map((id) => `ids[]=${id}`)
      .join("&");
    const streamUrl = `${this.HERMES_BASE_URL}/v2/updates/price/stream?${priceIds}&parsed=true`;

    // Use node-fetch with stream for SSE
    this.connectToStream(streamUrl);
  }

  private async connectToStream(url: string) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(
          `Failed to connect to price stream: ${response.statusText}`
        );
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body reader available");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const jsonString = line.substring(6);
              const data = JSON.parse(jsonString) as PythStreamResponse;
              this.processPriceUpdate(data);
            } catch (error) {
              console.error("Error parsing price stream data:", error);
            }
          }
        }
      }
    } catch (error) {
      console.error("Price stream connection error:", error);
      // Retry connection after 5 seconds
      setTimeout(() => this.connectToStream(url), 5000);
    }
  }

  private processPriceUpdate(data: PythStreamResponse) {
    if (data.type === "price_update") {
      const symbol = this.getSymbolForId(data.price_feed.id);
      if (symbol) {
        const normalizedPrice =
          Number.parseFloat(data.price_feed.price.price) *
          10 ** data.price_feed.price.expo;
        const confidence =
          Number.parseFloat(data.price_feed.price.conf) *
          10 ** data.price_feed.price.expo;

        const priceFeed: PriceFeed = {
          symbol,
          price: normalizedPrice,
          publishTime: data.price_feed.price.publishTime,
          confidence,
        };

        this.currentPrices.set(symbol, priceFeed);
        this.emit("priceUpdate", symbol, priceFeed);
      }
    }
  }

  private getSymbolForId(id: string): string | null {
    console.log("getSymbolForId called with ID:", id);

    // Normalize the ID by ensuring it has 0x prefix
    const normalizedId = id.startsWith("0x") ? id : `0x${id}`;
    console.log("Normalized ID:", normalizedId);

    const entry = Object.entries(this.PRICE_FEED_IDS).find(([_, feedId]) => {
      console.log("Comparing with feed ID:", feedId);
      return feedId === normalizedId;
    });

    const symbol = entry ? entry[0] : null;
    console.log("Found symbol:", symbol);
    return symbol;
  }

  async fetchLatestPrices(): Promise<Map<string, PriceFeed>> {
    try {
      const priceIds = Object.values(this.PRICE_FEED_IDS)
        .map((id) => `ids[]=${id}`)
        .join("&");
      const url = `${this.HERMES_BASE_URL}/v2/updates/price/latest?${priceIds}&parsed=true`;

      console.log("Fetching prices from URL:", url);
      console.log("Price feed IDs:", this.PRICE_FEED_IDS);

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch prices: ${response.statusText}`);
      }

      const data = (await response.json()) as PythPriceResponse;
      console.log("Received price data:", JSON.stringify(data, null, 2));

      const prices = new Map<string, PriceFeed>();

      for (const priceUpdate of data.parsed) {
        console.log("Processing price update:", priceUpdate);
        const symbol = this.getSymbolForId(priceUpdate.id);
        console.log("Mapped symbol:", symbol);

        if (symbol) {
          const normalizedPrice =
            Number.parseFloat(priceUpdate.price.price) *
            10 ** priceUpdate.price.expo;
          const confidence =
            Number.parseFloat(priceUpdate.price.conf) *
            10 ** priceUpdate.price.expo;

          const priceFeed = {
            symbol,
            price: normalizedPrice,
            publishTime: priceUpdate.price.publishTime,
            confidence,
          };

          console.log("Created price feed:", priceFeed);
          prices.set(symbol, priceFeed);
        } else {
          console.log("No symbol found for price feed ID:", priceUpdate.id);
        }
      }

      console.log("Final prices map:", Array.from(prices.entries()));
      this.currentPrices = prices;
      return prices;
    } catch (error) {
      console.error("Error fetching prices from Pyth:", error);
      throw error;
    }
  }

  getCurrentPrices(): Map<string, PriceFeed> {
    return this.currentPrices;
  }

  calculateETHAmount(inrAmount: number): {
    ethAmount: number;
    usdcAmount: number;
    ethPrice: number;
    inrPrice: number;
  } | null {
    const ethUsd = this.currentPrices.get("ETH/USD");
    const usdInr = this.currentPrices.get("USD/INR");

    if (!ethUsd || !usdInr) {
      return null;
    }

    const ethPrice = ethUsd.price;
    const inrPrice = usdInr.price;

    // Convert INR to USD, then USD to ETH
    const usdAmount = inrAmount / inrPrice;
    const ethAmount = usdAmount / ethPrice;

    // For ETH/INR swaps, we need USDC input to get ETH output
    const usdcAmount = usdAmount; // This is the USDC amount needed

    console.log("calculateETHAmount result:", {
      ethAmount,
      usdcAmount,
      ethPrice,
      inrPrice,
    });

    return {
      ethAmount,
      usdcAmount,
      ethPrice,
      inrPrice,
    };
  }

  calculateUSDAmount(inrAmount: number): {
    usdAmount: number;
    ethAmount: number;
    ethPrice: number;
    inrPrice: number;
  } | null {
    console.log(
      "Current prices in calculateUSDAmount:",
      Array.from(this.currentPrices.keys())
    );
    const usdInr = this.currentPrices.get("USD/INR");
    console.log("USD/INR price data:", usdInr);

    if (!usdInr) {
      return null;
    }

    const ethUsd = this.currentPrices.get("ETH/USD");

    if (!ethUsd) {
      return null;
    }

    const inrPrice = usdInr.price;
    const ethPrice = ethUsd.price;

    // Convert INR to USD
    const usdAmount = inrAmount / inrPrice;

    // For USD/INR swaps, we need ETH input to get USDC output
    const ethAmount = usdAmount / ethPrice; // This is the ETH amount needed

    console.log("calculateUSDAmount result:", {
      usdAmount,
      ethAmount,
      ethPrice,
      inrPrice,
    });

    return {
      usdAmount,
      ethAmount,
      ethPrice,
      inrPrice,
    };
  }

  /**
   * Get price update data from Hermes for on-chain submission
   */
  async getPriceUpdateData(): Promise<string[]> {
    if (!this.pythEnabled) {
      return [];
    }

    try {
      const priceIds = Object.values(this.PRICE_FEED_IDS);
      const idsQuery = priceIds.map((id) => `ids[]=${id}`).join("&");
      const url = `${this.HERMES_BASE_URL}/v2/updates/price/latest?${idsQuery}&parsed=true`;

      console.log("Fetching price updates from:", url);

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: any = await response.json();
      console.log("Price update response:", {
        binaryDataCount: data.binary?.data?.length || 0,
        parsedDataCount: data.parsed?.length || 0,
      });

      // Add "0x" prefix if not present
      const binaryData = data.binary?.data || [];
      const formattedData = binaryData.map((hex: string) =>
        hex.startsWith("0x") ? hex : `0x${hex}`
      );

      // Log freshness info
      if (data.parsed) {
        const now = Math.floor(Date.now() / 1000);
        data.parsed.forEach((feed: any, i: number) => {
          const age = now - feed.price.publish_time;
          console.log(
            `Price feed ${i} (${feed.id.substring(
              0,
              10
            )}...): age=${age}s, fresh=${age <= 60}`
          );
        });
      }

      return formattedData;
    } catch (error) {
      console.error("Error fetching price update data:", error);
      return [];
    }
  }

  /**
   * Try to lock quote on-chain first, fallback to database
   */
  async lockQuote(
    userId: string,
    inrAmount: number,
    type: "ETH/INR" | "USD/INR" = "ETH/INR"
  ): Promise<Quote | null> {
    // Try on-chain quote first if Pyth is enabled
    if (this.pythEnabled) {
      try {
        const onChainQuote = await this.lockQuoteOnChain(
          userId,
          inrAmount,
          type
        );
        if (onChainQuote) {
          console.log("Successfully locked on-chain quote:", onChainQuote.id);
          return onChainQuote;
        }
      } catch (error) {
        console.error(
          "On-chain quote failed, falling back to database:",
          error
        );
      }
    }

    // Fallback to existing database-based quote system
    return this.lockQuoteDatabase(userId, inrAmount, type);
  }

  /**
   * Lock quote on-chain using Pyth oracle
   */
  private async lockQuoteOnChain(
    userId: string,
    inrAmount: number,
    type: "ETH/INR" | "USD/INR"
  ): Promise<Quote | null> {
    if (!this.pythEnabled || !this.walletClient || !this.pricingOracleAddress) {
      throw new Error("Pyth oracle not initialized");
    }

    try {
      const inrAmountWei = parseEther(inrAmount.toString());
      const quoteType = type === "ETH/INR" ? 0 : 1;

      // Generate a database-style quote ID that we'll use everywhere
      const quoteIdString = `quote_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      // For on-chain, we need to convert to bytes32, but we'll return the original string
      const quoteIdBytes32 = keccak256(
        `0x${Buffer.from(quoteIdString).toString("hex")}`
      );
      console.log("Generated quote ID string:", quoteIdString);
      console.log("Converted to bytes32 for contract:", quoteIdBytes32);

      // Get price update data for on-chain submission
      const priceUpdateData = await this.getPriceUpdateData();
      console.log("Price update data length:", priceUpdateData.length);

      // Let the contract handle all fee calculation and refunds
      // Send enough ETH to cover potential Pyth fees, contract will refund excess
      const maxPossibleFee = parseEther("0.0000001");

      // Lock the quote with price update data
      const txHash = await this.walletClient.writeContract({
        address: this.pricingOracleAddress,
        abi: PRICING_ORACLE_ABI,
        functionName: "lockQuote",
        args: [
          quoteIdBytes32, // Use bytes32 for contract
          userId as `0x${string}`,
          inrAmountWei,
          quoteType,
          priceUpdateData as `0x${string}`[],
        ],
        value: maxPossibleFee, // Contract handles fee calculation and refunds
        gas: BigInt(500000), // Increased gas limit for safety
        maxFeePerGas: BigInt(1000000000), // 2 gwei max fee
        maxPriorityFeePerGas: BigInt(1000000000), // 1 gwei priority tip
      });

      // Wait for transaction confirmation
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash: txHash,
      });

      console.log("Transaction confirmed:", {
        status: receipt.status,
        gasUsed: receipt.gasUsed.toString(),
        blockNumber: receipt.blockNumber.toString(),
        logs: receipt.logs?.length || 0,
      });

      // Log all transaction logs for debugging
      if (receipt.logs && receipt.logs.length > 0) {
        console.log("Transaction logs:");
        receipt.logs.forEach((log: any, i: any) => {
          console.log(`Log ${i}:`, {
            address: log.address,
            topics: log.topics,
            data: log.data?.substring(0, 50) + "...",
          });
        });
      }

      if (receipt.status !== "success") {
        throw new Error(`Transaction failed with status: ${receipt.status}`);
      }

      console.log("Using database-style quote ID:", quoteIdString);

      // Small delay to ensure state is updated
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Get the full quote data from contract using bytes32
      const quoteData = await this.publicClient.readContract({
        address: this.pricingOracleAddress,
        abi: PRICING_ORACLE_ABI,
        functionName: "getQuote",
        args: [quoteIdBytes32 as `0x${string}`],
      });

      return {
        id: quoteIdString, // Return the database-style string ID
        userId,
        type,
        inrAmount,
        outputAmount:
          type === "ETH/INR"
            ? Number(formatEther(quoteData.outputAmount))
            : Number(formatUnits(quoteData.outputAmount, 6)),
        inputAmount:
          type === "ETH/INR"
            ? Number(formatUnits(quoteData.inputAmount, 6))
            : Number(formatEther(quoteData.inputAmount)),
        ethPrice:
          type === "ETH/INR"
            ? Number(formatUnits(quoteData.ethPriceUsd, 8))
            : undefined,
        inrPrice: Number(formatUnits(quoteData.usdInrRate, 8)),
        lockedAt: Number(quoteData.lockedAt) * 1000,
        expiresAt: Number(quoteData.expiresAt) * 1000,
        isOnChain: true,
        claimed: quoteData.claimed,
        // Preserve raw BigInt values for contract calls
        rawOutputAmount: quoteData.outputAmount,
        rawInputAmount: quoteData.inputAmount,
        rawInrAmount: quoteData.inrAmount,
      };
    } catch (error) {
      console.error("Error locking on-chain quote:", error);

      // Log more details about the error
      if (error instanceof Error) {
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
      }

      // If it's a viem error, log additional details
      if (error && typeof error === "object" && "details" in error) {
        console.error("Error details:", (error as any).details);
      }

      throw error;
    }
  }

  /**
   * Original database-based quote locking (fallback)
   */
  private async lockQuoteDatabase(
    userId: string,
    inrAmount: number,
    type: "ETH/INR" | "USD/INR" = "ETH/INR"
  ): Promise<Quote | null> {
    let quote: Quote;

    if (type === "ETH/INR") {
      const calculation = this.calculateETHAmount(inrAmount);
      if (!calculation) {
        return null;
      }

      const quoteId = `quote_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      const expiresAt = Date.now() + 15000; // 5 seconds

      try {
        console.log("ETH/INR Quote calculation:", calculation);
        console.log(
          "About to save quote with inputAmount (USDC):",
          calculation.usdcAmount.toString()
        );

        const createdQuote = await prisma.quote.create({
          data: {
            quoteId,
            userId,
            type: "ETH_INR",
            inrAmount: inrAmount.toString(),
            outputAmount: calculation.ethAmount.toString(),
            inputAmount: calculation.usdcAmount.toString(),
            ethPrice: calculation.ethPrice.toString(),
            inrPrice: calculation.inrPrice.toString(),
            expiresAt: new Date(expiresAt),
          },
        });

        console.log("Successfully saved quote:", createdQuote);

        quote = {
          id: quoteId,
          userId,
          type,
          inrAmount,
          outputAmount: calculation.ethAmount,
          inputAmount: calculation.usdcAmount,
          ethPrice: calculation.ethPrice,
          inrPrice: calculation.inrPrice,
          lockedAt: Date.now(),
          expiresAt,
        };
      } catch (error) {
        console.error("Error saving quote to database:", error);
        return null;
      }
    } else {
      // USD/INR
      const calculation = this.calculateUSDAmount(inrAmount);
      if (!calculation) {
        return null;
      }

      const quoteId = `quote_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      const expiresAt = Date.now() + 5000; // 5 seconds

      try {
        console.log("USD/INR Quote calculation:", calculation);
        console.log(
          "About to save quote with inputAmount (ETH):",
          calculation.ethAmount.toString()
        );

        const createdQuote = await prisma.quote.create({
          data: {
            quoteId,
            userId,
            type: "USD_INR",
            inrAmount: inrAmount.toString(),
            outputAmount: calculation.usdAmount.toString(),
            inputAmount: calculation.ethAmount.toString(),
            ethPrice: calculation.ethPrice.toString(),
            inrPrice: calculation.inrPrice.toString(),
            expiresAt: new Date(expiresAt),
          },
        });

        console.log("Successfully saved quote:", createdQuote);

        quote = {
          id: quoteId,
          userId,
          type,
          inrAmount,
          outputAmount: calculation.usdAmount,
          inputAmount: calculation.ethAmount,
          ethPrice: calculation.ethPrice,
          inrPrice: calculation.inrPrice,
          lockedAt: Date.now(),
          expiresAt,
        };
      } catch (error) {
        console.error("Error saving quote to database:", error);
        return null;
      }
    }

    return quote;
  }

  /**
   * Get locked quote by ID - try on-chain first, fallback to database
   */
  async getLockedQuote(
    quoteId: string,
    userId?: string
  ): Promise<Quote | null> {
    console.log("🔍 getLockedQuote called with:", {
      quoteId,
      userId,
      pythEnabled: this.pythEnabled,
    });

    // All quote IDs are now database-style strings, so try on-chain first if enabled
    if (this.pythEnabled) {
      console.log("🔗 Trying on-chain lookup first...");
      try {
        const onChainQuote = await this.getLockedQuoteOnChain(quoteId, userId);
        if (onChainQuote) {
          console.log("✅ Found on-chain quote for:", quoteId);
          return onChainQuote;
        }
        console.log("❌ On-chain lookup returned null");
      } catch (error) {
        console.error(
          "❌ Failed to get on-chain quote, trying database:",
          error
        );
      }
    }

    // Fallback to database
    console.log("💾 Trying database lookup for:", quoteId);
    const dbQuote = await this.getLockedQuoteDatabase(quoteId, userId);
    if (dbQuote) {
      console.log("✅ Found database quote for:", quoteId);
    } else {
      console.log("❌ Database lookup also returned null");
    }
    return dbQuote;
  }

  /**
   * Get on-chain quote
   */
  private async getLockedQuoteOnChain(
    quoteId: string,
    userId?: string
  ): Promise<Quote | null> {
    if (!this.pythEnabled || !this.publicClient || !this.pricingOracleAddress) {
      throw new Error("Pyth oracle not initialized");
    }

    try {
      // Convert string quote ID to bytes32 for contract call
      const quoteIdBytes32 = keccak256(
        `0x${Buffer.from(quoteId).toString("hex")}`
      );
      console.log("🔄 Converting quote ID:", {
        original: quoteId,
        bytes32: quoteIdBytes32,
      });

      // Check if quote is valid
      console.log("🔍 Checking if quote is valid on-chain...");
      const isValid = await this.publicClient.readContract({
        address: this.pricingOracleAddress,
        abi: PRICING_ORACLE_ABI,
        functionName: "isQuoteValid",
        args: [quoteIdBytes32 as `0x${string}`],
      });

      console.log("📊 Quote validity result:", isValid);

      if (!isValid) {
        console.log("❌ Quote is not valid on-chain");
        return null;
      }

      // Get quote data
      const quoteData = await this.publicClient.readContract({
        address: this.pricingOracleAddress,
        abi: PRICING_ORACLE_ABI,
        functionName: "getQuote",
        args: [quoteIdBytes32 as `0x${string}`],
      });

      // Verify user if provided
      if (userId && quoteData.user.toLowerCase() !== userId.toLowerCase()) {
        return null;
      }

      const type = quoteData.quoteType === 0 ? "ETH/INR" : "USD/INR";

      return {
        id: quoteId,
        userId: quoteData.user,
        type,
        inrAmount: Number(formatEther(quoteData.inrAmount)),
        outputAmount:
          type === "ETH/INR"
            ? Number(formatEther(quoteData.outputAmount))
            : Number(formatUnits(quoteData.outputAmount, 6)),
        inputAmount:
          type === "ETH/INR"
            ? Number(formatUnits(quoteData.inputAmount, 6))
            : Number(formatEther(quoteData.inputAmount)),
        ethPrice:
          type === "ETH/INR"
            ? Number(formatUnits(quoteData.ethPriceUsd, 8))
            : undefined,
        inrPrice: Number(formatUnits(quoteData.usdInrRate, 8)),
        lockedAt: Number(quoteData.lockedAt) * 1000,
        expiresAt: Number(quoteData.expiresAt) * 1000,
        isOnChain: true,
        claimed: quoteData.claimed,
        // Preserve raw BigInt values for contract calls
        rawOutputAmount: quoteData.outputAmount,
        rawInputAmount: quoteData.inputAmount,
        rawInrAmount: quoteData.inrAmount,
      };
    } catch (error) {
      console.error("Error getting on-chain quote:", error);
      throw error;
    }
  }

  /**
   * Original database-based quote retrieval (fallback)
   */
  private async getLockedQuoteDatabase(
    quoteId: string,
    userId?: string
  ): Promise<Quote | null> {
    try {
      const dbQuote = await prisma.quote.findUnique({
        where: { quoteId },
      });

      if (!dbQuote) return null;

      // Check if quote belongs to the requesting user
      if (userId && dbQuote.userId !== userId) {
        return null;
      }

      // Check if quote has expired
      // if (Date.now() > dbQuote.expiresAt.getTime()) {
      //   await prisma.quote.delete({
      //     where: { quoteId },
      //   });
      //   return null;
      // }

      const quote: Quote = {
        id: dbQuote.quoteId,
        userId: dbQuote.userId,
        type: dbQuote.type === "ETH_INR" ? "ETH/INR" : "USD/INR",
        inrAmount: Number.parseFloat(dbQuote.inrAmount.toString()),
        outputAmount: Number.parseFloat(dbQuote.outputAmount.toString()),
        inputAmount: dbQuote.inputAmount
          ? Number.parseFloat(dbQuote.inputAmount.toString())
          : 0,
        ethPrice: dbQuote.ethPrice
          ? Number.parseFloat(dbQuote.ethPrice.toString())
          : undefined,
        inrPrice: Number.parseFloat(dbQuote.inrPrice.toString()),
        lockedAt: dbQuote.lockedAt.getTime(),
        expiresAt: dbQuote.expiresAt.getTime(),
      };

      return quote;
    } catch (error) {
      console.error("Error fetching quote from database:", error);
      return null;
    }
  }

  async getAllActiveQuotes(): Promise<Quote[]> {
    try {
      const now = new Date();

      // // First, cleanup expired quotes
      // await prisma.quote.deleteMany({
      //   where: {
      //     expiresAt: {
      //       lte: now,
      //     },
      //   },
      // });

      // Then fetch active quotes
      const dbQuotes = await prisma.quote.findMany({
        where: {
          expiresAt: {
            gt: now,
          },
        },
      });

      const activeQuotes: Quote[] = dbQuotes.map((dbQuote) => ({
        id: dbQuote.quoteId,
        userId: dbQuote.userId,
        type: dbQuote.type === "ETH_INR" ? "ETH/INR" : "USD/INR",
        inrAmount: Number.parseFloat(dbQuote.inrAmount.toString()),
        outputAmount: Number.parseFloat(dbQuote.outputAmount.toString()),
        inputAmount: dbQuote.inputAmount
          ? Number.parseFloat(dbQuote.inputAmount.toString())
          : 0,
        ethPrice: dbQuote.ethPrice
          ? Number.parseFloat(dbQuote.ethPrice.toString())
          : undefined,
        inrPrice: Number.parseFloat(dbQuote.inrPrice.toString()),
        lockedAt: dbQuote.lockedAt.getTime(),
        expiresAt: dbQuote.expiresAt.getTime(),
      }));

      return activeQuotes;
    } catch (error) {
      console.error("Error fetching active quotes from database:", error);
      return [];
    }
  }

  /**
   * Claim an on-chain quote (for relayers)
   */
  async claimQuote(quoteId: string): Promise<boolean> {
    if (!this.pythEnabled || !this.walletClient || !this.pricingOracleAddress) {
      console.error(
        "Cannot claim on-chain quote - Pyth oracle not initialized"
      );
      return false;
    }

    if (quoteId.startsWith("0x") && quoteId.length === 66) {
      try {
        const txHash = await this.walletClient.writeContract({
          address: this.pricingOracleAddress,
          abi: PRICING_ORACLE_ABI,
          functionName: "claimQuote",
          args: [quoteId as `0x${string}`],
        });

        await this.publicClient.waitForTransactionReceipt({
          hash: txHash,
        });

        console.log("Successfully claimed on-chain quote:", quoteId);
        return true;
      } catch (error) {
        console.error("Error claiming on-chain quote:", error);
        return false;
      }
    }

    // Not an on-chain quote, no action needed for database quotes
    return true;
  }

  /**
   * Check if Pyth oracle is enabled and available
   */
  isPythEnabled(): boolean {
    return this.pythEnabled;
  }

  /**
   * Get Pyth oracle status and configuration
   */
  getPythStatus(): {
    enabled: boolean;
    oracleAddress: string | null;
    hermesConnected: boolean;
  } {
    return {
      enabled: this.pythEnabled,
      oracleAddress: this.pricingOracleAddress,
      hermesConnected: this.hermesClient !== null,
    };
  }

  stop() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.removeAllListeners();
  }
}

export const priceService = new PriceService();
