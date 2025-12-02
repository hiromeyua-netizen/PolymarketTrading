import { createClient, RedisClientType } from 'redis';
import { logger } from '../utils/logger';

export interface TokenPrice {
    slug: string;
    timestamp: number;
    upTokenPrice: number; // bestAskPrice for YES/UP token
    downTokenPrice: number; // bestAskPrice for NO/DOWN token
}

export class RedisService {
    private client: RedisClientType | null = null;
    private isConnected: boolean = false;
    private reconnectAttempts: number = 0;
    private maxReconnectAttempts: number = 5;

    constructor(
        private host: string = process.env.REDIS_HOST || 'localhost',
        private port: number = parseInt(process.env.REDIS_PORT || '6379', 10),
        private password?: string
    ) {}

    public async connect(): Promise<void> {
        if (this.isConnected && this.client) {
            logger.info('Redis already connected');
            return;
        }

        try {
            this.client = createClient({
                socket: {
                    host: this.host,
                    port: this.port,
                    reconnectStrategy: (retries) => {
                        if (retries > this.maxReconnectAttempts) {
                            logger.error('Redis max reconnection attempts reached');
                            return new Error('Max reconnection attempts reached');
                        }
                        const delay = Math.min(retries * 100, 3000);
                        logger.warn(`Redis reconnecting in ${delay}ms (attempt ${retries})`);
                        return delay;
                    },
                },
                password: this.password,
            });

            this.client.on('error', (err) => {
                logger.error('Redis Client Error:', err);
                this.isConnected = false;
            });

            this.client.on('connect', () => {
                logger.info('Redis connecting...');
            });

            this.client.on('ready', () => {
                logger.info('✅ Redis connected and ready');
                this.isConnected = true;
                this.reconnectAttempts = 0;
            });

            this.client.on('end', () => {
                logger.warn('Redis connection ended');
                this.isConnected = false;
            });

            await this.client.connect();
        } catch (error) {
            logger.error('Failed to connect to Redis:', error);
            this.isConnected = false;
            throw error;
        }
    }

    public async disconnect(): Promise<void> {
        if (this.client) {
            try {
                await this.client.quit();
                this.isConnected = false;
                logger.info('Redis disconnected');
            } catch (error) {
                logger.error('Error disconnecting Redis:', error);
            } finally {
                this.client = null;
            }
        }
    }

    private ensureConnected(): void {
        if (!this.isConnected || !this.client) {
            throw new Error('Redis is not connected. Call connect() first.');
        }
    }

    /**
     * Save token price to Redis
     * Key format: token_price:{slug}:{timestamp}
     */
    public async saveTokenPrice(price: TokenPrice): Promise<void> {
        this.ensureConnected();

        try {
            const key = `token_price:${price.slug}:${price.timestamp}`;
            const value = JSON.stringify({
                slug: price.slug,
                timestamp: price.timestamp,
                upTokenPrice: price.upTokenPrice,
                downTokenPrice: price.downTokenPrice,
            });

            await this.client!.set(key, value);
        } catch (error) {
            logger.error('Error saving token price to Redis:', error);
            throw error;
        }
    }

    /**
     * Save latest token price for a slug
     * Key format: token_price:latest:{slug}
     */
    public async saveLatestTokenPrice(price: TokenPrice): Promise<void> {
        this.ensureConnected();

        try {
            const key = `token_price:latest:${price.slug}`;
            const value = JSON.stringify({
                slug: price.slug,
                timestamp: price.timestamp,
                upTokenPrice: price.upTokenPrice,
                downTokenPrice: price.downTokenPrice,
            });

            await this.client!.set(key, value);
        } catch (error) {
            logger.error('Error saving latest token price to Redis:', error);
            throw error;
        }
    }

    /**
     * Get latest token price for a slug
     */
    public async getLatestTokenPrice(slug: string): Promise<TokenPrice | null> {
        this.ensureConnected();

        try {
            const key = `token_price:latest:${slug}`;
            const value = await this.client!.get(key);

            if (!value) {
                return null;
            }

            return JSON.parse(value) as TokenPrice;
        } catch (error) {
            logger.error('Error getting latest token price from Redis:', error);
            return null;
        }
    }

    /**
     * Get token price by slug and timestamp
     */
    public async getTokenPrice(slug: string, timestamp: number): Promise<TokenPrice | null> {
        this.ensureConnected();

        try {
            const key = `token_price:${slug}:${timestamp}`;
            const value = await this.client!.get(key);

            if (!value) {
                return null;
            }

            return JSON.parse(value) as TokenPrice;
        } catch (error) {
            logger.error('Error getting token price from Redis:', error);
            return null;
        }
    }

    /**
     * Get all token prices for a slug within a time range
     * Returns array of TokenPrice sorted by timestamp
     */
    public async getTokenPricesBySlug(slug: string, startTimestamp?: number, endTimestamp?: number): Promise<TokenPrice[]> {
        this.ensureConnected();

        try {
            const pattern = `token_price:${slug}:*`;
            const keys = await this.client!.keys(pattern);

            const prices: TokenPrice[] = [];

            for (const key of keys) {
                // Skip latest keys
                if (key.includes(':latest:')) {
                    continue;
                }

                const value = await this.client!.get(key);
                if (value) {
                    const price = JSON.parse(value) as TokenPrice;

                    // Filter by timestamp range if provided
                    if (startTimestamp && price.timestamp < startTimestamp) {
                        continue;
                    }
                    if (endTimestamp && price.timestamp > endTimestamp) {
                        continue;
                    }

                    prices.push(price);
                }
            }

            // Sort by timestamp
            return prices.sort((a, b) => a.timestamp - b.timestamp);
        } catch (error) {
            logger.error('Error getting token prices by slug from Redis:', error);
            return [];
        }
    }

    /**
     * Delete token price by key
     */
    public async deleteTokenPrice(slug: string, timestamp: number): Promise<void> {
        this.ensureConnected();

        try {
            const key = `token_price:${slug}:${timestamp}`;
            await this.client!.del(key);
        } catch (error) {
            logger.error('Error deleting token price from Redis:', error);
            throw error;
        }
    }

    /**
     * Delete all token prices for a slug
     */
    public async deleteTokenPricesBySlug(slug: string): Promise<void> {
        this.ensureConnected();

        try {
            const pattern = `token_price:${slug}:*`;
            const keys = await this.client!.keys(pattern);

            if (keys.length > 0) {
                await this.client!.del(keys);
            }
        } catch (error) {
            logger.error('Error deleting token prices by slug from Redis:', error);
            throw error;
        }
    }

    /**
     * Check if Redis is connected
     */
    public get connected(): boolean {
        return this.isConnected;
    }
}

// Singleton instance
let redisServiceInstance: RedisService | null = null;

export const getRedisService = (): RedisService => {
    if (!redisServiceInstance) {
        redisServiceInstance = new RedisService();
    }
    return redisServiceInstance;
};

