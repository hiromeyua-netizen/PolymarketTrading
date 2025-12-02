import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { Side } from '@polymarket/clob-client';
import { getPolymarketCredentials } from '../utils/polymarketCredentials';
import config from '../config';

/**
 * UserMonitor event names
 */
export enum UserMonitorEvents {
    ORDER_MESSAGE = 'orderMessage', // Raw ORDER message from WebSocket
    TRADE_MESSAGE = 'tradeMessage', // Raw TRADE message from WebSocket
}

export enum TradeStatus {
    MATCHED = 'MATCHED',
    MINED = 'MINED',
    CONFIRMED = 'CONFIRMED',
    RETRYING = 'RETRYING',
    FAILED = 'FAILED',
}

/**
 * Trade message interface (from User Channel)
 */
export interface TradeMessage {
  asset_id: string;
  event_type: 'trade';
  id: string; // Trade ID
  last_update: string;
  maker_orders: Array<{
    asset_id: string;
    matched_amount: string;
    order_id: string;
    outcome: string;
    owner: string;
    price: string;
  }>;
  market: string;
  matchtime: string;
  outcome: string;
  owner: string;
  price: string;
  side: Side;
  size: string;
  status: TradeStatus;
  taker_order_id: string;
  timestamp: string;
  trade_owner: string;
  type: 'TRADE';
}

export enum Outcome {
    UP = 'Up',
    DOWN = 'Down',
}

export enum OrderType {
    PLACEMENT = 'PLACEMENT',
    UPDATE = 'UPDATE',
    CANCELLATION = 'CANCELLATION',
}


/**
 * Order message interface (from User Channel)
 */
export interface OrderMessage {
  asset_id: string;
  associate_trades: string[] | null;
  event_type: 'order';
  id: string; // Order ID
  market: string;
  order_owner: string;
  original_size: string;
  outcome: Outcome;
  owner: string;
  price: string;
  side: Side;
  size_matched: string;
  timestamp: string;
  type: OrderType;
}

/**
 * UserMonitor - Real-time order and trade monitoring via User Channel WebSocket
 * 
 * Monitors user's orders and trades using Polymarket's authenticated User Channel.
 * Based on: https://docs.polymarket.com/developers/CLOB/websocket/user-channel
 */
export class UserMonitor extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectInterval: number = 5000;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private isConnecting: boolean = false;
  private shouldReconnect: boolean = true;

  // Track orders by order ID (hash)
  // private orders: Map<string, OrderInfo> = new Map();

  constructor() {
    super();
  }

  /**
   * Connect to User Channel WebSocket and authenticate
   */
  public async connect(): Promise<void> {
    if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) {
      logger.warn('UserMonitor: WebSocket already connecting or connected');
      return;
    }

    // Check if wallet private key is configured
    if (!config.wallet?.privateKey) {
      throw new Error('WALLET_PRIVATE_KEY not configured. Please set WALLET_PRIVATE_KEY in environment variables.');
    }

    // Derive API credentials from wallet private key
    const creds = await getPolymarketCredentials(config.wallet.privateKey);

    this.isConnecting = true;
    logger.info('🔌 Connecting to Polymarket User Channel WebSocket...');

    try {
      // Connect to User Channel
      this.ws = new WebSocket('wss://ws-subscriptions-clob.polymarket.com/ws/user');

      this.ws.on('open', () => {
        this.isConnecting = false;
        logger.info('✅ User Channel WebSocket connected');
        this.authenticate(creds);
        this.startPing();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        const message = data.toString();

        // Ignore PONG responses
        if (message === 'PONG') {
          return;
        }

        this.handleMessage(data);
      });

      this.ws.on('error', (error) => {
        logger.error('❌ User Channel WebSocket error:', error);
      });

      this.ws.on('close', () => {
        logger.warn('⚠️ User Channel WebSocket disconnected');
        this.isConnecting = false;
        this.ws = null;
        this.stopPing();

        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      });

    } catch (error) {
      this.isConnecting = false;
      logger.error('Failed to connect to User Channel WebSocket:', error);
      throw error;
    }
  }

  /**
   * Authenticate with API credentials
   */
  private authenticate(creds: { key: string; secret: string; passphrase: string }): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.error('Cannot authenticate: WebSocket not connected');
      return;
    }

    const authMessage = {
      auth: {
        apikey: creds.key,
        secret: creds.secret,
        passphrase: creds.passphrase,
      },
      type: 'user',
    };

    this.ws.send(JSON.stringify(authMessage));
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString());

      // Emit raw message events - let TradingService handle the logic
      if (message.event_type === 'order') {
        this.emit(UserMonitorEvents.ORDER_MESSAGE, message as OrderMessage);
      } else if (message.event_type === 'trade') {
        this.emit(UserMonitorEvents.TRADE_MESSAGE, message as TradeMessage);
      } else {
        logger.debug('Unknown message type:', message);
      }
    } catch (error) {
      logger.error('Error parsing WebSocket message:', error);
    }
  }


  /**
   * Map trade status to order status
   * @deprecated No longer used - we rely solely on OrderMessage for order status
   */
  // private mapTradeStatusToOrderStatus(tradeStatus: TradeMessage['status']): OrderInfo['status'] {
  //   // Removed - using OrderMessage only
  // }

  /**
   * Start PING interval to keep connection alive
   */
  private startPing(): void {
    this.stopPing();

    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send('PING');
        logger.debug('📡 Sent PING to User Channel');
      }
    }, 10000); // Every 10 seconds
  }

  /**
   * Stop PING interval
   */
  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    logger.info(`⏳ Reconnecting User Channel in ${this.reconnectInterval / 1000}s...`);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, this.reconnectInterval);
  }

  /**
   * Disconnect from WebSocket
   */
  public disconnect(): void {
    this.shouldReconnect = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.stopPing();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    logger.info('🔌 Disconnected from User Channel WebSocket');
  }

  /**
   * Check if connected
   */
  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

