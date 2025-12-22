import WebSocket from 'ws';
import { EventEmitter } from 'events';
import axios from 'axios';
import cron from 'node-cron';
import { Side } from '@polymarket/clob-client';
import { CoinMonitor, CoinMonitorEvent, CoinPrice, CoinSymbol } from './CoinMonitor';
import { logger } from '../utils/logger';

export enum MarketInterval {
    HOURLY = 'hourly',
    FIFTEEN_MINUTES = '15min'
}

interface OrderSummary {
    price: string;
    size: string;
}

interface BookMessage {
    event_type: 'book';
    asset_id: string;
    market: string;
    timestamp: string;
    hash: string;
    bids: OrderSummary[];
    asks: OrderSummary[];
}

interface PriceChange {
    asset_id: string;
    price: string;
    size: string;
    side: Side;
    hash: string;
    best_bid: string;
    best_ask: string;
}

interface PriceChangeMessage {
    event_type: 'price_change';
    market: string;
    price_changes: PriceChange[];
    timestamp: string;
}

interface LastTradeMessage {
    event_type: 'last_trade_price';
    asset_id: string;
    market: string;
    price: string;
    side: Side;
    size: string;
    timestamp: string;
    fee_rate_bps: string;
}

interface TickSizeChangeMessage {
    event_type: 'tick_size_change';
    asset_id: string;
    market: string;
    old_tick_size: string;
    new_tick_size: string;
    side: string;
    timestamp: string;
}

export interface TokenPrice {
    bestAsk: number;
    bestBid: number;
}

export enum MarketMonitorEvent {
    MARKET_UPDATED = 'marketUpdated',
    PRICE_CHANGE = 'priceChange',
    COIN_PRICE_BIAS_CHANGE = 'coinPriceBiasChange',
}

export interface MarketInfo {
    yesAssetId: string;
    noAssetId: string;
    slug: string;
    conditionId: string;
    question: string;
    interval: MarketInterval;
}

export class MarketMonitor extends EventEmitter {
    private ws?: WebSocket;
    private coinMonitor: CoinMonitor;
    private symbol: CoinSymbol;
    private marketInterval: MarketInterval;
    public curMarketInfo: MarketInfo | null = null;
    private isConnecting: boolean = false;
    private pingCronTask?: cron.ScheduledTask;
    private marketUpdateCronTask?: cron.ScheduledTask;

    public startCoinPrice: CoinPrice | null = null;
    public currentCoinPrice: CoinPrice | null = null;

    public yesPrice: TokenPrice | null = null;
    public noPrice: TokenPrice | null = null;

    constructor(symbol: CoinSymbol, marketInterval: MarketInterval) {
        super();
        this.symbol = symbol;
        this.marketInterval = marketInterval;
        this.coinMonitor = new CoinMonitor(symbol);
    }

    public async connect() {
        if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) {
            logger.info('MarketMonitor WebSocket already connecting or connected');
            return;
        }

        this.isConnecting = true;
        this.ws = new WebSocket('wss://ws-subscriptions-clob.polymarket.com/ws/market');
        this.ws.on('open', () => {
            logger.info('MarketMonitor WebSocket connected');
            this.subscribeToMarket();
            this.startPingTimer();
        });

        this.ws.on('close', () => {
            logger.info('MarketMonitor WebSocket closed');
            this.isConnecting = false;
            this.stopPingTimer();
            this.ws = undefined;
            this.connect();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
            const message = data.toString();

            if (!message || message.trim().length === 0) {
                return;
            }

            if (message === 'PING') {
                this.sendPong();
                return;
            }

            if (message === 'PONG') {
                // Server responded to our ping, connection is alive
                return;
            }

            this.handleMessage(message);

        });
    }

    public async disconnect(): Promise<void> {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.close();
        }
        this.isConnecting = false;
        this.ws = undefined;
        this.stopPingTimer();
    }

    private handleMessage(data: WebSocket.Data): void {
        try {
            const message = JSON.parse(data.toString());

            // Handle different message types based on event_type
            switch (message.event_type) {
                case 'book':
                    // this.handleBookMessage(message as BookMessage);
                    break;
                case 'price_change':
                    this.handlePriceChangeMessage(message as PriceChangeMessage);
                    break;
                case 'last_trade_price':
                    // this.handleLastTradePriceMessage(message as LastTradeMessage);
                    break;
                case 'tick_size_change':
                    // this.handleTickSizeChangeMessage(message as TickSizeChangeMessage);
                    break;
                default:
                    logger.debug('Unknown message type:', message);
            }
        } catch (error) {
            logger.error('Error parsing WebSocket message:', error);
        }
    }

    private handlePriceChangeMessage(message: PriceChangeMessage): void {
        let hasPriceChange = false;
        const yesPriceChange = message.price_changes.find((priceChange) => priceChange.asset_id === this.curMarketInfo?.yesAssetId);
        const noPriceChange = message.price_changes.find((priceChange) => priceChange.asset_id === this.curMarketInfo?.noAssetId);

        if (yesPriceChange) {

            const yesPrice = {
                bestAsk: Math.round(parseFloat(yesPriceChange.best_ask) * 100) / 100 || 1,
                bestBid: Math.round(parseFloat(yesPriceChange.best_bid) * 100) / 100,
            };
            if(!this.yesPrice || (this.yesPrice && this.yesPrice.bestAsk !== yesPrice.bestAsk || this.yesPrice.bestBid !== yesPrice.bestBid)) {
                hasPriceChange = true;
            }
            this.yesPrice = yesPrice;
        }
        if (noPriceChange) {
            const noPrice = {
                bestAsk: Math.round(parseFloat(noPriceChange.best_ask) * 100) / 100 || 1,
                bestBid: Math.round(parseFloat(noPriceChange.best_bid) * 100) / 100,
            };
            if(!this.noPrice || (this.noPrice && this.noPrice.bestAsk !== noPrice.bestAsk || this.noPrice.bestBid !== noPrice.bestBid)) {
                hasPriceChange = true;
            }
            this.noPrice = noPrice;
        }

        if(hasPriceChange) {
            this.emit(MarketMonitorEvent.PRICE_CHANGE, {
                yesPrice: this.yesPrice,
                noPrice: this.noPrice,
            });
        }
    }


    private subscribeToMarket(): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            logger.error('Cannot subscribe: WebSocket not connected');
            return;
        }

        const subscribeMessage = {
            assets_ids: [this.curMarketInfo?.yesAssetId, this.curMarketInfo?.noAssetId],
            type: 'market',
        };

        logger.info(`📡 Subscribing to ${[this.curMarketInfo?.yesAssetId, this.curMarketInfo?.noAssetId].length} asset(s) for market: ${this.curMarketInfo?.slug}`);
        this.ws.send(JSON.stringify(subscribeMessage));
    }

    public async start() {
        this.coinMonitor.connect();

        this.coinMonitor.on(CoinMonitorEvent.PRICE_UPDATE, (price: CoinPrice) => {
            this.currentCoinPrice = price;
            if (this.startCoinPrice) {
                const coinPriceBias = this.currentCoinPrice.price - this.startCoinPrice.price;
                this.emit(MarketMonitorEvent.COIN_PRICE_BIAS_CHANGE, coinPriceBias);
            }
        });

        this.curMarketInfo = await this.getMarketInfoFromSlug(this.getCurrentSlug());
        if (this.curMarketInfo) {
            this.startCoinPrice = await this.getStartCoinPrice(this.curMarketInfo);
            this.connect();
        }
        this.scheduleMarketUpdate();
    }

    public async stop() {
        this.curMarketInfo = null;
        this.coinMonitor.disconnect();
        this.disconnect();
        this.marketUpdateCronTask?.stop();
        this.marketUpdateCronTask = undefined;
    }

    public async getMarketInfoFromSlug(slug: string): Promise<MarketInfo | null> {
        try {
            logger.info(`🔍 Fetching market data for slug: ${slug}`);

            // Polymarket Gamma API endpoint - query by slug parameter
            const apiUrl = `https://gamma-api.polymarket.com/markets`;

            const response = await axios.get(apiUrl, {
                params: {
                    slug: slug,
                    closed: false, // Only get active markets
                },
                timeout: 10000, // 10 second timeout
            });

            const markets = response.data;

            // Check if markets exist
            if (!markets || markets.length === 0) {
                logger.error(`❌ No active market found for slug: ${slug}`);
                return null;
            }

            const market = markets[0];

            // Extract token IDs and identify YES/NO from tokens array
            let yesAssetId = '';
            let noAssetId = '';

            if (market.clobTokenIds) {
                const tokenIds = market.clobTokenIds
                    .split(',')
                    .map((id: string) => id.trim().replace(/["'\[\]]/g, ''));

                if (tokenIds.length >= 2) {
                    // Assume first is YES, second is NO (Polymarket convention)
                    yesAssetId = tokenIds[0];
                    noAssetId = tokenIds[1];
                    logger.warn(`⚠️ Using clobTokenIds order: assuming token[0]=YES, token[1]=NO`);
                }
            }

            if (!yesAssetId || !noAssetId) {
                logger.error(`❌ Could not identify YES/NO token IDs for market: ${slug}`);
                return null;
            }

            const result = {
                yesAssetId,
                noAssetId,
                conditionId: market.conditionId || '',
                question: market.question || '',
                interval: this.marketInterval,
                slug: slug,
            };


            logger.info(`✅ Market: ${market.question}`);
            logger.info(`   YES token: ${yesAssetId.substring(0, 12)}...`);
            logger.info(`   NO token:  ${noAssetId.substring(0, 12)}...`);

            return result;

        } catch (error) {
            if (axios.isAxiosError(error)) {
                logger.error(`❌ API request failed: ${error.response?.status} ${error.response?.statusText}`);
                logger.error(`   Error message: ${error.message}`);
            } else {
                logger.error(`❌ Error fetching token IDs from slug: ${error}`);
            }
            return null;
        }
    }

    public async getStartCoinPrice(marketInfo: MarketInfo | null): Promise<CoinPrice | null> {
        if (!marketInfo) {
            return null;
        }
        try {
            // Extract symbol (e.g., "btc/usd" -> "BTC")
            const symbolUpper = this.symbol.split('/')[0].toUpperCase();

            // Determine variant based on interval
            const variant = marketInfo.interval === MarketInterval.FIFTEEN_MINUTES ? 'fifteen' : 'hourly';

            // Calculate start and end times based on current time and interval
            let eventStartTime: Date;
            let endDate: Date;

            if (marketInfo.interval === MarketInterval.FIFTEEN_MINUTES) {
                // For 15-minute markets: use UTC, round down to nearest 15-minute interval
                const now = new Date();
                const minutes = now.getMinutes();
                const roundedMinutes = Math.floor(minutes / 15) * 15;
                
                eventStartTime = new Date(now);
                eventStartTime.setMinutes(roundedMinutes, 0, 0); // Set seconds and milliseconds to 0
                
                // End time is 15 minutes after start
                endDate = new Date(eventStartTime);
                endDate.setMinutes(endDate.getMinutes() + 15);
            } else {
                // For hourly markets: use ET timezone, round down to nearest hour
                const now = new Date();
                const etTimeString = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
                const etTime = new Date(etTimeString);
                
                // Round down to nearest hour
                eventStartTime = new Date(etTime);
                eventStartTime.setMinutes(0, 0, 0); // Set minutes, seconds, and milliseconds to 0
                
                // End time is 1 hour after start
                endDate = new Date(eventStartTime);
                endDate.setHours(endDate.getHours() + 1);
            }

            const apiUrl = 'https://polymarket.com/api/crypto/crypto-price';
            
            logger.info(`🔍 Fetching start coin price for ${symbolUpper} from API...`);

            const response = await axios.get(apiUrl, {
                params: {
                    symbol: symbolUpper,
                    eventStartTime: eventStartTime.toISOString(),
                    variant: variant,
                    endDate: endDate.toISOString(),
                },
                timeout: 10000,
            });

            const data = response.data;

            if (!data || data.openPrice === null || data.openPrice === undefined) {
                logger.warn(`⚠️ No openPrice available for ${symbolUpper}`);
                return null;
            }

            const coinPrice: CoinPrice = {
                symbol: this.symbol,
                price: data.openPrice,
                timestamp: data.timestamp || Date.now(),
            };

            logger.info(`✅ Start coin price for ${symbolUpper}: ${data.openPrice}`);
            return coinPrice;

        } catch (error) {
            logger.error(`❌ Error fetching start coin price: ${error}`);
            return null;
        }
    }

    private getCurrentSlug(): string {
        switch (this.marketInterval) {
            case MarketInterval.FIFTEEN_MINUTES:
                return this.getCurrent15MinSlug();
            case MarketInterval.HOURLY:
                return this.getCurrentHourSlug();
        }
    }
    private getCurrent15MinSlug(): string {
        const cryptoShort = this.symbol.split('/')[0];

        // Get current time in UTC (Polymarket uses UTC for 15-minute markets)
        const now = new Date();

        // Round down to nearest 15-minute interval
        const minutes = now.getMinutes();
        const roundedMinutes = Math.floor(minutes / 15) * 15;

        // Create timestamp for the start of this 15-minute period
        const periodStart = new Date(now);
        periodStart.setMinutes(roundedMinutes, 0, 0); // Set seconds and milliseconds to 0

        // Get Unix timestamp in seconds
        const timestamp = Math.floor(periodStart.getTime() / 1000);

        // Build slug: {crypto_short}-updown-15m-{timestamp}
        const slug = `${cryptoShort}-updown-15m-${timestamp}`;

        return slug;
    }

    private getCurrentHourSlug(): string {
        let crypto = '';
        switch (this.symbol) {
            case CoinSymbol.BTC:
                crypto = 'bitcoin';
                break;
            case CoinSymbol.ETH:
                crypto = 'ethereum';
                break;
            case CoinSymbol.SOL:
                crypto = 'solana';
                break;
            case CoinSymbol.XRP:
                crypto = 'ripple';
                break;
            default:
                throw new Error(`Invalid symbol: ${this.symbol}`);
        }
        // Get current time in ET timezone
        const now = new Date();

        // Convert to ET (UTC-5 or UTC-4 depending on DST)
        // Using toLocaleString with ET timezone
        const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));

        // Extract components
        const month = etTime.toLocaleString('en-US', { month: 'long' }).toLowerCase();
        const day = etTime.getDate();
        let hour = etTime.getHours();

        // Determine AM/PM
        const ampm = hour >= 12 ? 'pm' : 'am';

        // Convert to 12-hour format
        if (hour === 0) {
            hour = 12;
        } else if (hour > 12) {
            hour = hour - 12;
        }

        // Build slug: {crypto}-up-or-down-{month}-{day}-{hour}{am/pm}-et
        const slug = `${crypto}-up-or-down-${month}-${day}-${hour}${ampm}-et`;

        return slug;
    }

    private startPingTimer(): void {
        // Send PING every 30 seconds to keep connection alive
        // Cron expression: */30 * * * * * (every 30 seconds)
        this.pingCronTask = cron.schedule('*/10 * * * * *', () => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send('PING');
            }
        });
    }

    private stopPingTimer(): void {
        if (this.pingCronTask) {
            this.pingCronTask.stop();
            this.pingCronTask = undefined;
        }
    }

    private sendPong(): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send('PONG');
        }
    }

    private scheduleMarketUpdate(): void {
        if (this.marketUpdateCronTask) {
            this.marketUpdateCronTask.stop();
            this.marketUpdateCronTask = undefined;
        }

        let cronExpression: string;
        if (this.marketInterval === MarketInterval.FIFTEEN_MINUTES) {
            cronExpression = '*/15 * * * *';
        } else if (this.marketInterval === MarketInterval.HOURLY) {
            cronExpression = '0 * * * *';
        } else {
            throw new Error(`Invalid market interval: ${this.marketInterval}`);
        }

        this.marketUpdateCronTask = cron.schedule(cronExpression, () => {
            if (this.currentCoinPrice) {
                this.startCoinPrice = this.currentCoinPrice;
            }
            this.updateMarket();
        });
    }

    public async updateMarket(): Promise<void> {
        await this.disconnect();
        this.curMarketInfo = await this.getMarketInfoFromSlug(this.getCurrentSlug());
        this.emit(MarketMonitorEvent.MARKET_UPDATED, this.curMarketInfo);
    }

    public canStartTrading(): boolean {
        return this.curMarketInfo !== null && this.startCoinPrice !== null && this.currentCoinPrice !== null;
    }
}