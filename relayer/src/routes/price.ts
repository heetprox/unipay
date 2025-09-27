import { type Request, type Response, Router } from "express";
import { z } from "zod";
import { priceService } from "../services/priceService";

const router: Router = Router();

const quoteRequestSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  inrAmount: z.number().positive("INR amount must be positive"),
  type: z.enum(["ETH/INR", "USD/INR"]).optional().default("ETH/INR"),
});

// Get current prices for ETH/USD and USD/INR
router.get("/current", async (req: Request, res: Response) => {
  try {
    let prices = priceService.getCurrentPrices();

    if (prices.size === 0) {
      // If no cached prices, fetch latest
      await priceService.fetchLatestPrices();
      prices = priceService.getCurrentPrices(); // Get updated prices
    }

    const pricesObject = Object.fromEntries(prices);

    res.json({
      success: true,
      prices: pricesObject,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("Error fetching current prices:", error);
    res.status(500).json({
      error: "Failed to fetch current prices",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Get a live quote for INR to ETH/USD conversion
router.post("/quote", async (req: Request, res: Response) => {
  try {
    const validatedData = quoteRequestSchema.parse(req.body);
    const { inrAmount, type } = validatedData;

    if (type === "ETH/INR") {
      const calculation = priceService.calculateETHAmount(inrAmount);
      if (!calculation) {
        return res.status(400).json({
          error: "Price data not available",
          message: "ETH/USD or USD/INR price feeds are not currently available",
        });
      }

      res.json({
        success: true,
        quote: {
          type,
          inrAmount,
          outputAmount: calculation.ethAmount,
          ethPriceUsd: calculation.ethPrice,
          usdInrRate: calculation.inrPrice,
          timestamp: Date.now(),
        },
      });
    } else {
      // USD/INR
      const calculation = priceService.calculateUSDAmount(inrAmount);
      if (!calculation) {
        return res.status(400).json({
          error: "Price data not available",
          message: "USD/INR price feed is not currently available",
        });
      }

      res.json({
        success: true,
        quote: {
          type,
          inrAmount,
          outputAmount: calculation.usdAmount,
          usdInrRate: calculation.inrPrice,
          timestamp: Date.now(),
        },
      });
    }
  } catch (error) {
    if (error instanceof Error && "issues" in error) {
      return res.status(400).json({
        error: "Validation failed",
        details: error.issues,
      });
    }
    console.error("Error calculating quote:", error);
    res.status(500).json({
      error: "Failed to calculate quote",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Lock a quote for 5 seconds for a specific user
router.post("/quote/lock", async (req: Request, res: Response) => {
  // Store in DB
  try {
    const validatedData = quoteRequestSchema.parse(req.body);
    const { userId, inrAmount, type } = validatedData;

    const lockedQuote = priceService.lockQuote(userId, inrAmount, type);
    if (!lockedQuote) {
      const message =
        type === "ETH/INR"
          ? "Cannot lock quote - ETH/USD or USD/INR price feeds are not currently available"
          : "Cannot lock quote - USD/INR price feed is not currently available";

      return res.status(400).json({
        error: "Price data not available",
        message,
      });
    }

    const response: any = {
      id: lockedQuote.id,
      userId: lockedQuote.userId,
      type: lockedQuote.type,
      inrAmount: lockedQuote.inrAmount,
      outputAmount: lockedQuote.outputAmount,
      usdInrRate: lockedQuote.inrPrice,
      lockedAt: lockedQuote.lockedAt,
      expiresAt: lockedQuote.expiresAt,
      validFor: Math.max(0, lockedQuote.expiresAt - Date.now()),
    };

    // Add ETH price only for ETH/INR quotes
    if (lockedQuote.type === "ETH/INR" && lockedQuote.ethPrice) {
      response.ethPriceUsd = lockedQuote.ethPrice;
    }

    res.json({
      success: true,
      quote: response,
    });
  } catch (error) {
    if (error instanceof Error && "issues" in error) {
      return res.status(400).json({
        error: "Validation failed",
        details: error.issues,
      });
    }
    console.error("Error locking quote:", error);
    res.status(500).json({
      error: "Failed to lock quote",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Get a locked quote by ID (with user verification)
router.get("/quote/:quoteId", async (req: Request, res: Response) => {
  try {
    const { quoteId } = req.params;
    const userId = req.query.userId as string;

    if (!quoteId) {
      return res.status(400).json({
        error: "Quote ID is required",
      });
    }

    if (!userId) {
      return res.status(400).json({
        error: "User ID is required",
      });
    }

    const lockedQuote = priceService.getLockedQuote(quoteId, userId);
    if (!lockedQuote) {
      return res.status(404).json({
        error: "Quote not found, expired, or not accessible by this user",
      });
    }

    const response: any = {
      id: lockedQuote.id,
      userId: lockedQuote.userId,
      type: lockedQuote.type,
      inrAmount: lockedQuote.inrAmount,
      outputAmount: lockedQuote.outputAmount,
      usdInrRate: lockedQuote.inrPrice,
      lockedAt: lockedQuote.lockedAt,
      expiresAt: lockedQuote.expiresAt,
      validFor: Math.max(0, lockedQuote.expiresAt - Date.now()),
    };

    // Add ETH price only for ETH/INR quotes
    if (lockedQuote.type === "ETH/INR" && lockedQuote.ethPrice) {
      response.ethPriceUsd = lockedQuote.ethPrice;
    }

    res.json({
      success: true,
      quote: response,
    });
  } catch (error) {
    console.error("Error fetching locked quote:", error);
    res.status(500).json({
      error: "Failed to fetch locked quote",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Server-Sent Events endpoint for real-time price updates
router.get("/stream", (req: Request, res: Response) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Cache-Control",
  });

  // Send initial prices
  const currentPrices = priceService.getCurrentPrices();
  if (currentPrices.size > 0) {
    res.write(
      `data: ${JSON.stringify({
        type: "initial",
        prices: Object.fromEntries(currentPrices),
        timestamp: Date.now(),
      })}\n\n`
    );
  }

  // Listen for price updates
  const onPriceUpdate = (symbol: string, priceFeed: any) => {
    res.write(
      `data: ${JSON.stringify({
        type: "update",
        symbol,
        price: priceFeed,
        timestamp: Date.now(),
      })}\n\n`
    );
  };

  priceService.on("priceUpdate", onPriceUpdate);

  // Handle client disconnect
  req.on("close", () => {
    priceService.off("priceUpdate", onPriceUpdate);
  });

  // Keep connection alive
  const keepAlive = setInterval(() => {
    res.write(
      `data: ${JSON.stringify({ type: "ping", timestamp: Date.now() })}\n\n`
    );
  }, 30000);

  req.on("close", () => {
    clearInterval(keepAlive);
  });
});

export { router as priceRoutes };
