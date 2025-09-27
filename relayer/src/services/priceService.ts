import { EventEmitter } from "node:events";
import prisma from "../config/database";

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
}

class PriceService extends EventEmitter {
  private readonly HERMES_BASE_URL = "https://hermes.pyth.network";
  private readonly PRICE_FEED_IDS = {
    "ETH/USD": "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
    "USD/INR": "0x0ac0f9a2886fc2dd708bc66cc2cea359052ce89d324f45d95fadbc6c4fcf1809",
  };

  private currentPrices: Map<string, PriceFeed> = new Map();
  private eventSource: EventSource | null = null;

  constructor() {
    super();
    console.log("PriceService constructor called");
    this.initializePrices();
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
        throw new Error(`Failed to connect to price stream: ${response.statusText}`);
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
          Number.parseFloat(data.price_feed.price.price) * 10 ** data.price_feed.price.expo;
        const confidence =
          Number.parseFloat(data.price_feed.price.conf) * 10 ** data.price_feed.price.expo;

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
            Number.parseFloat(priceUpdate.price.price) * 10 ** priceUpdate.price.expo;
          const confidence =
            Number.parseFloat(priceUpdate.price.conf) * 10 ** priceUpdate.price.expo;

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

  calculateETHAmount(
    inrAmount: number
  ): { ethAmount: number; usdcAmount: number; ethPrice: number; inrPrice: number } | null {
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

  calculateUSDAmount(inrAmount: number): { usdAmount: number; ethAmount: number; ethPrice: number; inrPrice: number } | null {
    console.log("Current prices in calculateUSDAmount:", Array.from(this.currentPrices.keys()));
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

  async lockQuote(
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

      const quoteId = `quote_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const expiresAt = Date.now() + 15000; // 5 seconds

      try {
        console.log("ETH/INR Quote calculation:", calculation);
        console.log("About to save quote with inputAmount (USDC):", calculation.usdcAmount.toString());
        
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

      const quoteId = `quote_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const expiresAt = Date.now() + 5000; // 5 seconds

      try {
        console.log("USD/INR Quote calculation:", calculation);
        console.log("About to save quote with inputAmount (ETH):", calculation.ethAmount.toString());
        
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

  async getLockedQuote(quoteId: string, userId?: string): Promise<Quote | null> {
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
        inputAmount: dbQuote.inputAmount ? Number.parseFloat(dbQuote.inputAmount.toString()) : 0,
        ethPrice: dbQuote.ethPrice ? Number.parseFloat(dbQuote.ethPrice.toString()) : undefined,
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
        inputAmount: dbQuote.inputAmount ? Number.parseFloat(dbQuote.inputAmount.toString()) : 0,
        ethPrice: dbQuote.ethPrice ? Number.parseFloat(dbQuote.ethPrice.toString()) : undefined,
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

  stop() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.removeAllListeners();
  }
}

export const priceService = new PriceService();
