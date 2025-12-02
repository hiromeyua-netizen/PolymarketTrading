import config from "../config";
import { logger } from "../utils/logger";
import { getPolymarketCredentials } from "../utils/polymarketCredentials";
import { CoinSymbol } from "./CoinMonitor";
import { MarketInterval, MarketMonitor, MarketMonitorEvent, MarketInfo, TokenPrice } from "./MarketMonitor";
import { OrderMessage, Outcome, TradeMessage, UserMonitor, UserMonitorEvents } from "./UserMonitor";
import { Chain, ClobClient, Side, OrderType, OrderResponse } from "@polymarket/clob-client";
import { Wallet } from '@ethersproject/wallet';
import { getRedisService, TokenPrice as RedisTokenPrice } from "./RedisService";
import TokenPriceHistory from "../models/TokenPriceHistory";

interface OrderInfo {
    assetId: string;
    side: Side;
    outcome: Outcome;
    price: number;
    size: number;
    amount: number;
    sizeMatched: number;
    isMarketOrder: boolean;
}

export class TradingBot {
    private userMonitor: UserMonitor;
    private marketMonitor: MarketMonitor;
    private clobClient: ClobClient | null = null;
    private firstOrder: OrderInfo | null = null;
    private secondOrder: OrderInfo | null = null;
    private firstOrderCount: number = 0;
    private secondOrderCount: number = 0;
    private redisService = getRedisService();
    private currentSlug: string | null = null;

    constructor(symbol: CoinSymbol, marketInterval: MarketInterval) {
        this.userMonitor = new UserMonitor();
        this.marketMonitor = new MarketMonitor(symbol, marketInterval);
        this.initClobClient();
    }

    public async start(): Promise<void> {
        // Connect to Redis
        try {
            await this.redisService.connect();
        } catch (error) {
            logger.error('Failed to connect to Redis:', error);
            throw error;
        }

        await this.marketMonitor.start();
        await this.userMonitor.connect();

        // Initialize current slug from initial market info
        if (this.marketMonitor.curMarketInfo) {
            this.currentSlug = this.marketMonitor.curMarketInfo.slug;
        }

        this.marketMonitor.on(MarketMonitorEvent.PRICE_CHANGE, (priceChange: { yesPrice: TokenPrice, noPrice: TokenPrice }) => {
            this.handlePriceChange(priceChange);
        });
        this.marketMonitor.on(MarketMonitorEvent.COIN_PRICE_BIAS_CHANGE, (coinPriceBias: number) => {
            this.handleCoinPriceBiasChange(coinPriceBias);
        });
        this.marketMonitor.on(MarketMonitorEvent.MARKET_UPDATED, (marketInfo: MarketInfo) => {
            this.handleMarketUpdated(marketInfo);
        });

        // Handle raw ORDER messages from WebSocket
        this.userMonitor.on(UserMonitorEvents.ORDER_MESSAGE, (order: OrderMessage) => {
            this.handleOrderMessage(order);
        });

        // Handle raw TRADE messages from WebSocket
        this.userMonitor.on(UserMonitorEvents.TRADE_MESSAGE, (trade: TradeMessage) => {
            this.handleTradeMessage(trade);
        });
    }

    public async stop(): Promise<void> {
        await this.marketMonitor.stop();
        await this.userMonitor.disconnect();
    }

    private async initClobClient(): Promise<void> {
        // Check if wallet private key is configured
        if (!config.wallet.privateKey) {
            logger.warn('⚠️ WALLET_PRIVATE_KEY not set, order placement will not be available');
            return;
        }

        const creds = await getPolymarketCredentials(config.wallet.privateKey);

        // Create wallet from private key
        const wallet = new Wallet(config.wallet.privateKey);

        // Initialize ClobClient
        this.clobClient = new ClobClient(
            'https://clob.polymarket.com', // host
            Chain.POLYGON, // chainId
            wallet, // signer
            {
                key: creds.key,
                secret: creds.secret,
                passphrase: creds.passphrase,
            }, // creds
            2, // signature type
            config.wallet.funderAddress
        );
    }

    public async placeLimitOrder(
        assetId: string,
        side: Side,
        price: number,
        size: number,
        orderType: OrderType.GTC | OrderType.GTD = OrderType.GTC
    ): Promise<string> {
        if (!this.clobClient) {
            throw new Error('ClobClient not initialized');
        }

        try {
            const orderResponse: OrderResponse = await this.clobClient.createAndPostOrder(
                {
                    tokenID: assetId,
                    side: side,
                    price: price,
                    size: size
                },
                {},
                orderType,
                false
            );

            if (!orderResponse.success) {
                throw new Error(orderResponse.errorMsg);
            }

            const orderHash = orderResponse.orderID;
            return orderHash;
        } catch (error) {
            logger.error('Error placing limit order:', error);
            throw error;
        }
    }

    public async placeMarketOrder(
        assetId: string,
        side: Side,
        amount: number,
        orderType: OrderType.FOK | OrderType.FAK = OrderType.FOK
    ): Promise<string> {
        if (!this.clobClient) {
            throw new Error('ClobClient not initialized');
        }

        try {
            const orderResponse: OrderResponse = await this.clobClient.createAndPostMarketOrder(
                {
                    tokenID: assetId,
                    side: side,
                    amount: amount
                },
                {},
                orderType,
                false
            );

            if (!orderResponse.success) {
                throw new Error(orderResponse.errorMsg);
            }

            const orderHash = orderResponse.orderID;
            return orderHash;
        }
        catch (error) {
            logger.error('Error placing market order:', error);
            throw error;
        }
    }

    public async cancelOrder(orderHash: string): Promise<void> {
        if (!this.clobClient) {
            throw new Error('ClobClient not initialized');
        }

        try {
            const orderResponse: OrderResponse = await this.clobClient.cancelOrder({ orderID: orderHash });
            if (!orderResponse.success) {
                throw new Error(orderResponse.errorMsg);
            }
            return;
        } catch (error) {
            logger.error('Error canceling order:', error);
            throw error;
        }
    }

    private async handlePriceChange(priceChange: { yesPrice: TokenPrice, noPrice: TokenPrice }): Promise<void> {
        const marketInfo = this.marketMonitor.curMarketInfo;
        if (!marketInfo) {
            logger.warn('Cannot save price: market info not available');
            return;
        }

        // Update current slug
        this.currentSlug = marketInfo.slug;

        try {
            const timestamp = Date.now();
            const redisPrice: RedisTokenPrice = {
                slug: marketInfo.slug,
                timestamp: timestamp,
                upTokenPrice: priceChange.yesPrice.bestAsk,
                downTokenPrice: priceChange.noPrice.bestAsk,
            };

            // Save to Redis (both with timestamp and as latest)
            await this.redisService.saveTokenPrice(redisPrice);
            await this.redisService.saveLatestTokenPrice(redisPrice);
        } catch (error) {
            logger.error('Error saving token price to Redis:', error);
        }
    }

    private handleCoinPriceBiasChange(coinPriceBias: number): void {
    }

    private async handleMarketUpdated(marketInfo: MarketInfo): Promise<void> {
        logger.info(`first order count: ${this.firstOrderCount}, second order count: ${this.secondOrderCount}`);
        logger.info(`Market updated: ${marketInfo.question}`);
        
        // Get the previous market slug (before it was updated)
        const previousSlug = this.currentSlug;

        if (previousSlug) {
            try {
                // Get all token prices from Redis for the previous market
                const tokenPrices = await this.redisService.getTokenPricesBySlug(previousSlug);
                
                if (tokenPrices.length > 0) {
                    logger.info(`Saving ${tokenPrices.length} token prices to MongoDB for slug: ${previousSlug}`);
                    
                    // Batch save to MongoDB
                    const documents = tokenPrices.map(price => ({
                        slug: price.slug,
                        timestamp: new Date(price.timestamp),
                        upTokenPrice: price.upTokenPrice,
                        downTokenPrice: price.downTokenPrice,
                    }));

                    await TokenPriceHistory.insertMany(documents);
                    logger.info(`✅ Successfully saved ${documents.length} token prices to MongoDB`);

                    // Delete all token prices from Redis for the previous market
                    await this.redisService.deleteTokenPricesBySlug(previousSlug);
                    logger.info(`✅ Cleared Redis data for slug: ${previousSlug}`);
                } else {
                    logger.info(`No token prices found in Redis for slug: ${previousSlug}`);
                }
            } catch (error) {
                logger.error('Error saving Redis data to MongoDB:', error);
            }
        }

        // Update current slug to the new market
        this.currentSlug = marketInfo.slug;

        this.firstOrder = null;
        this.secondOrder = null;
    }

    private handleOrderMessage(order: OrderMessage): void {
    }

    private handleTradeMessage(trade: TradeMessage): void {
    }
}