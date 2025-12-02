import config from "../config";
import { logger } from "../utils/logger";
import { getPolymarketCredentials } from "../utils/polymarketCredentials";
import { CoinSymbol } from "./CoinMonitor";
import { MarketInterval, MarketMonitor, MarketMonitorEvent, MarketInfo, TokenPrice } from "./MarketMonitor";
import { OrderMessage, Outcome, TradeMessage, UserMonitor, UserMonitorEvents } from "./UserMonitor";
import { Chain, ClobClient, Side, OrderType, OrderResponse } from "@polymarket/clob-client";
import { Wallet } from '@ethersproject/wallet';

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

    constructor(symbol: CoinSymbol, marketInterval: MarketInterval) {
        this.userMonitor = new UserMonitor();
        this.marketMonitor = new MarketMonitor(symbol, marketInterval);
        this.initClobClient();
    }

    public async start(): Promise<void> {
        await this.marketMonitor.start();
        await this.userMonitor.connect();

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

    private handlePriceChange(priceChange: { yesPrice: TokenPrice, noPrice: TokenPrice }): void {
        if (!this.firstOrder) {
            if (priceChange.yesPrice.bestAsk < 0.05) {
                this.firstOrder = {
                    assetId: this.marketMonitor.curMarketInfo?.yesAssetId || '',
                    side: Side.BUY,
                    outcome: Outcome.UP,
                    price: priceChange.yesPrice.bestAsk,
                    size: 100,
                    amount: priceChange.yesPrice.bestAsk * 100,
                    sizeMatched: 0,
                    isMarketOrder: false,
                };

                console.log('first order placed', this.firstOrder);
                this.firstOrderCount++;
            } else if (priceChange.noPrice.bestAsk < 0.05) {
                this.firstOrder = {
                    assetId: this.marketMonitor.curMarketInfo?.noAssetId || '',
                    side: Side.BUY,
                    outcome: Outcome.DOWN,
                    price: priceChange.noPrice.bestAsk,
                    size: 100,
                    amount: priceChange.noPrice.bestAsk * 100,
                    sizeMatched: 0,
                    isMarketOrder: false,
                };

                console.log('first order placed', this.firstOrder);
                this.firstOrderCount++;
            } else {
                return;
            }
        } else if (!this.secondOrder) {
            if (this.firstOrder.outcome === Outcome.UP && priceChange.yesPrice.bestBid > 0.1) {
                this.secondOrder = {
                    assetId: this.marketMonitor.curMarketInfo?.yesAssetId || '',
                    side: Side.SELL,
                    outcome: Outcome.UP,
                    price: priceChange.yesPrice.bestAsk,
                    size: 100,
                    amount: priceChange.yesPrice.bestAsk * 100,
                    sizeMatched: 0,
                    isMarketOrder: false,
                };

                console.log('second order placed', this.secondOrder);
                this.secondOrderCount++;
            } else if (this.firstOrder.outcome === Outcome.DOWN && priceChange.noPrice.bestBid > 0.1) {
                this.secondOrder = {
                    assetId: this.marketMonitor.curMarketInfo?.noAssetId || '',
                    side: Side.SELL,
                    outcome: Outcome.DOWN,
                    price: priceChange.noPrice.bestAsk,
                    size: 100,
                    amount: priceChange.noPrice.bestAsk * 100,
                    sizeMatched: 0,
                    isMarketOrder: false,
                };

                console.log('second order placed', this.secondOrder);
                this.secondOrderCount++;
            } else {
                return;
            }
        }
    }

    private handleCoinPriceBiasChange(coinPriceBias: number): void {
    }

    private handleMarketUpdated(marketInfo: MarketInfo): void {
        logger.info(`first order count: ${this.firstOrderCount}, second order count: ${this.secondOrderCount}`);
        logger.info(`Market updated: ${marketInfo.question}`);
        this.firstOrder = null;
        this.secondOrder = null;
    }

    private handleOrderMessage(order: OrderMessage): void {
    }

    private handleTradeMessage(trade: TradeMessage): void {
    }
}