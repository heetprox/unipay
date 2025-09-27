import { EventEmitter } from "events";

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
  ethPrice?: number; // Only for ETH/INR quotes
  inrPrice: number;
  lockedAt: number;
  expiresAt: number;
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
  private lockedQuotes: Map<string, Quote> = new Map();
  private eventSource: EventSource | null = null;

  constructor() {
    super();
    this.startPriceStream();
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
          parseFloat(data.price_feed.price.price) *
          Math.pow(10, data.price_feed.price.expo);
        const confidence =
          parseFloat(data.price_feed.price.conf) *
          Math.pow(10, data.price_feed.price.expo);

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
    // Normalize the ID by ensuring it has 0x prefix
    const normalizedId = id.startsWith("0x") ? id : `0x${id}`;
    const entry = Object.entries(this.PRICE_FEED_IDS).find(
      ([_, feedId]) => feedId === normalizedId
    );
    return entry ? entry[0] : null;
  }

  async fetchLatestPrices(): Promise<Map<string, PriceFeed>> {
    try {
      const priceIds = Object.values(this.PRICE_FEED_IDS)
        .map((id) => `ids[]=${id}`)
        .join("&");
      const url = `${this.HERMES_BASE_URL}/v2/updates/price/latest?${priceIds}&parsed=true`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch prices: ${response.statusText}`);
      }

      const data = (await response.json()) as PythPriceResponse;
      const prices = new Map<string, PriceFeed>();

      for (const priceUpdate of data.parsed) {
        const symbol = this.getSymbolForId(priceUpdate.id);

        if (symbol) {
          const normalizedPrice =
            parseFloat(priceUpdate.price.price) *
            Math.pow(10, priceUpdate.price.expo);
          const confidence =
            parseFloat(priceUpdate.price.conf) *
            Math.pow(10, priceUpdate.price.expo);

          prices.set(symbol, {
            symbol,
            price: normalizedPrice,
            publishTime: priceUpdate.price.publishTime,
            confidence,
          });
        }
      }

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
  ): { ethAmount: number; ethPrice: number; inrPrice: number } | null {
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

    return {
      ethAmount,
      ethPrice,
      inrPrice,
    };
  }

  calculateUSDAmount(
    inrAmount: number
  ): { usdAmount: number; inrPrice: number } | null {
    console.log('Current prices in calculateUSDAmount:', Array.from(this.currentPrices.keys()));
    const usdInr = this.currentPrices.get("USD/INR");
    console.log('USD/INR price data:', usdInr);

    if (!usdInr) {
      return null;
    }

    const inrPrice = usdInr.price;

    // Convert INR to USD
    const usdAmount = inrAmount / inrPrice;

    return {
      usdAmount,
      inrPrice,
    };
  }

  lockQuote(
    userId: string,
    inrAmount: number,
    type: "ETH/INR" | "USD/INR" = "ETH/INR"
  ): Quote | null {
    let quote: Quote;

    if (type === "ETH/INR") {
      const calculation = this.calculateETHAmount(inrAmount);
      if (!calculation) {
        return null;
      }

      quote = {
        id: `quote_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        type,
        inrAmount,
        outputAmount: calculation.ethAmount,
        ethPrice: calculation.ethPrice,
        inrPrice: calculation.inrPrice,
        lockedAt: Date.now(),
        expiresAt: Date.now() + 5000, // 5 seconds
      };
    } else {
      // USD/INR
      const calculation = this.calculateUSDAmount(inrAmount);
      if (!calculation) {
        return null;
      }

      quote = {
        id: `quote_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        type,
        inrAmount,
        outputAmount: calculation.usdAmount,
        inrPrice: calculation.inrPrice,
        lockedAt: Date.now(),
        expiresAt: Date.now() + 5000, // 5 seconds
      };
    }

    this.lockedQuotes.set(quote.id, quote);

    // Auto-cleanup expired quote
    setTimeout(() => {
      this.lockedQuotes.delete(quote.id);
    }, 5000);

    return quote;
  }

  getLockedQuote(quoteId: string, userId?: string): Quote | null {
    const quote = this.lockedQuotes.get(quoteId);
    if (!quote) return null;

    // Check if quote belongs to the requesting user
    if (userId && quote.userId !== userId) {
      return null;
    }

    // Check if quote has expired
    if (Date.now() > quote.expiresAt) {
      this.lockedQuotes.delete(quoteId);
      return null;
    }

    return quote;
  }

  getAllActiveQuotes(): Quote[] {
    const now = Date.now();
    const activeQuotes = Array.from(this.lockedQuotes.values()).filter(
      (quote) => quote.expiresAt > now
    );

    // Cleanup expired quotes
    for (const [id, quote] of this.lockedQuotes.entries()) {
      if (quote.expiresAt <= now) {
        this.lockedQuotes.delete(id);
      }
    }

    return activeQuotes;
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
