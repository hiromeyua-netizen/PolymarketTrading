import WebSocket from "ws";
import { EventEmitter } from "events";
import cron from "node-cron";
import { logger } from "../utils/logger";

export enum CoinMonitorEvent {
    PRICE_UPDATE = "priceUpdate"
}

export enum CoinSymbol {
    BTC = "btc/usd",
    ETH = "eth/usd",
    SOL = "sol/usd",
    XRP = "xrp/usd"
}

export interface CoinPrice {
    symbol: CoinSymbol;
    price: number;
    timestamp: number;
}

interface SubscriptionMessage {
    action: 'subscribe' | 'unsubscribe';
    subscriptions: Array<{
        topic: string;
        type: string;
        filters: string;
    }>;
}

interface CryptoPriceMessage {
    topic: string;
    type: string;
    timestamp: number;
    payload: {
        symbol: string;
        timestamp: number;
        value: number;
    };
}

export class CoinMonitor extends EventEmitter {
    private ws?: WebSocket;
    private coinSymbol: CoinSymbol;
    private isConnecting: boolean = false;
    private pingCronTask?: cron.ScheduledTask;
    private currentCoinPrice?: CoinPrice;


    constructor(coinSymbol: CoinSymbol) {
        super();
        this.coinSymbol = coinSymbol;
    }

    public async connect() {
        if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) {
            logger.info('CoinMonitor WebSocket already connecting or connected');
            return;
        }

        this.isConnecting = true;
        this.ws = new WebSocket('wss://ws-live-data.polymarket.com/');
        this.ws.on('open', () => {
            logger.info('CoinMonitor WebSocket connected');
            this.isConnecting = false;
            this.subscribeToPriceFeed();
            this.startPingTimer();
        });

        this.ws.on('close', () => {
            logger.info('CoinMonitor WebSocket closed');
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

    private subscribeToPriceFeed(): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            logger.error('Cannot subscribe: CoinMonitor WebSocket not connected');
            return;
        }

        const subscriptionMessage: SubscriptionMessage = {
            action: 'subscribe',
            subscriptions: [
                {
                    topic: 'crypto_prices_chainlink',
                    type: '*',
                    filters: JSON.stringify({ symbol: this.coinSymbol }),
                },
            ],
        };

        logger.info(`📡 Subscribing to ${this.coinSymbol} price feed...`);
        this.ws.send(JSON.stringify(subscriptionMessage));
    }

    private startPingTimer(): void {
        // Send PING every 30 seconds to keep connection alive
        // Cron expression: */30 * * * * * (every 30 seconds)
        this.pingCronTask = cron.schedule('*/30 * * * * *', () => {
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

    private handleMessage(data: WebSocket.Data): void {
        try {
            const messageStr = data.toString();

            if (!messageStr || messageStr.trim().length === 0) {
                return;
            }

            // Try to parse JSON
            let message: CryptoPriceMessage;
            try {
                message = JSON.parse(messageStr) as CryptoPriceMessage;
            } catch (parseError) {
                // If it's not valid JSON, log and skip
                logger.debug('CoinMonitor received non-JSON message:', messageStr.substring(0, 100));
                return;
            }

            // Check if this is a crypto price update
            if (message.topic === 'crypto_prices_chainlink' && message.type === 'update') {
                this.currentCoinPrice = {
                    symbol: this.coinSymbol,
                    price: message.payload.value,
                    timestamp: message.payload.timestamp,
                };
                this.emit(CoinMonitorEvent.PRICE_UPDATE, this.currentCoinPrice);
            }
        } catch (error) {
            // Only log unexpected errors, not JSON parse errors (handled above)
            if (error instanceof SyntaxError) {
                logger.debug('CoinMonitor received invalid JSON, skipping');
            } else {
                logger.error('❌ Error handling CoinMonitor message:', error);
            }
        }
    }

    public disconnect(): void {
        logger.info(`Disconnecting CoinMonitor for ${this.coinSymbol}...`);

        // Stop ping timer
        this.stopPingTimer();

        // Close WebSocket connection if it exists
        if (this.ws) {
            // Remove event listeners to prevent reconnection
            this.ws.removeAllListeners();

            if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
                this.ws.close();
            }
            this.ws = undefined;
        }

        this.isConnecting = false;
        logger.info(`CoinMonitor disconnected for ${this.coinSymbol}`);
    }
}