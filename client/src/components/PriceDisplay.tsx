'use client';

import { useState, useEffect } from 'react';
import { UniPayAPI } from '@/lib/api';
import type { CurrentPricesResponse, PriceStreamEvent } from '@/types/api';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';

export default function PriceDisplay() {
    const [prices, setPrices] = useState<CurrentPricesResponse | null>(null);
    const [priceStream, setPriceStream] = useState<EventSource | null>(null);
    const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
    const [priceChanges, setPriceChanges] = useState<Record<string, 'up' | 'down' | 'neutral'>>({});

    useEffect(() => {
        // Fetch initial prices
        fetchInitialPrices();

        // Setup price stream
        setupPriceStream();

        return () => {
            if (priceStream) {
                priceStream.close();
            }
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchInitialPrices = async () => {
        try {
            const initialPrices = await UniPayAPI.getCurrentPrices();
            setPrices(initialPrices);
        } catch (err) {
            console.error('Failed to fetch initial prices:', err);
        }
    };

    const setupPriceStream = () => {
        try {
            const eventSource = UniPayAPI.createPriceStream();

            eventSource.onopen = () => {
                console.log('Price stream connected successfully');
                setConnectionStatus('connected');
            };

            eventSource.onmessage = (event) => {
                try {
                    const data: PriceStreamEvent = JSON.parse(event.data);

                    if (data.type === "initial") {
                        setPrices({
                            success: true,
                            prices: data.prices,
                            timestamp: data.timestamp
                        });
                    } else if (data.type === "update") {
                        setPrices(prev => {
                            if (!prev) return null;

                            // Type guard to ensure symbol is valid
                            const symbol = data.symbol as keyof typeof prev.prices;
                            if (!(symbol in prev.prices)) return prev;

                            // Track price change direction
                            const oldPrice = prev.prices[symbol]?.price;
                            const newPrice = data.price.price;

                            if (oldPrice && newPrice !== oldPrice) {
                                setPriceChanges(prevChanges => ({
                                    ...prevChanges,
                                    [symbol]: newPrice > oldPrice ? 'up' : 'down'
                                }));

                                // Reset change indicator after 2 seconds
                                setTimeout(() => {
                                    setPriceChanges(prevChanges => ({
                                        ...prevChanges,
                                        [symbol]: 'neutral'
                                    }));
                                }, 2000);
                            }

                            return {
                                ...prev,
                                prices: {
                                    ...prev.prices,
                                    [symbol]: data.price
                                },
                                timestamp: data.timestamp
                            };
                        });
                    }
                } catch (parseError) {
                    console.error('Failed to parse price stream data:', parseError);
                }
            };

            eventSource.onerror = (error) => {
                console.error('Price stream error:', error);
                console.error('EventSource readyState:', eventSource.readyState);
                console.error('EventSource URL:', eventSource.url);
                setConnectionStatus('disconnected');

                // Only close if not already closed
                if (eventSource.readyState !== EventSource.CLOSED) {
                    eventSource.close();
                }

                // Retry connection after 5 seconds
                setTimeout(setupPriceStream, 5000);
            };

            setPriceStream(eventSource);
        } catch (err) {
            console.error('Failed to setup price stream:', err);
            setConnectionStatus('disconnected');

            // Fallback to polling if EventSource fails
            setTimeout(() => {
                console.log('Falling back to polling for price updates');
                fetchInitialPrices();
            }, 5000);
        }
    };

    const formatPrice = (price: number) => {
        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 6
        }).format(price);
    };

    const formatTimestamp = (timestamp: number) => {
        return new Date(timestamp * 1000).toLocaleString();
    };

    const getPriceChangeColor = (symbol: string) => {
        const change = priceChanges[symbol];
        switch (change) {
            case 'up':
                return 'text-green-400';
            case 'down':
                return 'text-red-400';
            default:
                return 'text-white';
        }
    };

    const getPriceChangeIcon = (symbol: string) => {
        const change = priceChanges[symbol];
        switch (change) {
            case 'up':
                return <TrendingUp className="w-4 h-4 text-green-400" />;
            case 'down':
                return <TrendingDown className="w-4 h-4 text-red-400" />;
            default:
                return null;
        }
    };

    if (!prices) {
        return (
            <div className="w-full max-w-md mx-auto p-4 bg-white/10 backdrop-blur-md rounded-lg shadow-md">
                <div className="animate-pulse">
                    <div className="h-4 bg-gray-200/20 rounded w-1/3 mb-3"></div>
                    <div className="h-6 bg-gray-200/20 rounded w-2/3 mb-2"></div>
                    <div className="h-6 bg-gray-200/20 rounded w-2/3"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full mx-auto p-4 bg-white/10 backdrop-blur-md rounded-lg shadow-md">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Live Prices</h3>
                <div className="flex items-center gap-2">
                    <Activity className={`w-4 h-4 ${connectionStatus === 'connected' ? 'text-green-400' :
                        connectionStatus === 'connecting' ? 'text-yellow-400' : 'text-red-400'
                        }`} />
                    <span className={`text-xs ${connectionStatus === 'connected' ? 'text-green-400' :
                        connectionStatus === 'connecting' ? 'text-yellow-400' : 'text-red-400'
                        }`}>
                        {connectionStatus}
                    </span>
                </div>
            </div>

            <div className="space-y-3">
                {/* ETH/USD Price */}
                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                    <div className="flex items-center gap-2">
                        <span className="text-white font-medium">ETH/USD</span>
                        {getPriceChangeIcon("ETH/USD")}
                    </div>
                    <div className="text-right">
                        <div className={`text-lg font-bold ${getPriceChangeColor("ETH/USD")}`}>
                            ${formatPrice(prices.prices["ETH/USD"].price)}
                        </div>
                        <div className="text-xs text-gray-400">
                            Confidence: {(prices.prices["ETH/USD"].confidence * 100).toFixed(1)}%
                        </div>
                    </div>
                </div>

                {/* USD/INR Price */}
                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                    <div className="flex items-center gap-2">
                        <span className="text-white font-medium">USD/INR</span>
                        {getPriceChangeIcon("USD/INR")}
                    </div>
                    <div className="text-right">
                        <div className={`text-lg font-bold ${getPriceChangeColor("USD/INR")}`}>
                            ₹{formatPrice(prices.prices["USD/INR"].price)}
                        </div>
                        <div className="text-xs text-gray-400">
                            Confidence: {(prices.prices["USD/INR"].confidence * 100).toFixed(1)}%
                        </div>
                    </div>
                </div>

                {/* Calculated ETH/INR Rate */}
                <div className="flex items-center justify-between p-3 bg-gradient-to-r from-purple-900/20 to-blue-900/20 rounded-lg border border-purple-700/30">
                    <span className="text-white font-medium">ETH/INR</span>
                    <div className="text-right">
                        <div className="text-lg font-bold text-purple-300">
                            ₹{formatPrice(prices.prices["ETH/USD"].price * prices.prices["USD/INR"].price)}
                        </div>
                        <div className="text-xs text-gray-400">Calculated</div>
                    </div>
                </div>
            </div>

            <div className="mt-4 text-xs text-gray-400 text-center">
                Last updated: {formatTimestamp(prices.timestamp)}
            </div>
        </div>
    );
}