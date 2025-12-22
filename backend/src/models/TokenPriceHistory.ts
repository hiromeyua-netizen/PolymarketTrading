import mongoose, { Schema, Document } from 'mongoose';

export type EventType = 'hourly' | '15min';
export type Outcome = 'UP' | 'DOWN';

export interface ITokenPriceHistory extends Document {
    slug: string;
    timestamp: Date;
    upTokenPrice: number; // bestAskPrice for YES/UP token
    downTokenPrice: number; // bestAskPrice for NO/DOWN token
    token: string; // Coin symbol (e.g., 'BTC', 'ETH', 'SOL', 'XRP')
    eventType: EventType; // 'hourly' or '15min'
    outcome: Outcome; // 'UP' or 'DOWN'
    coinPriceBias?: number; // Difference between current coin price and start coin price
}

const TokenPriceHistorySchema: Schema = new Schema({
    slug: {
        type: String,
        required: true,
        index: true,
    },
    timestamp: {
        type: Date,
        required: true,
        index: true,
    },
    upTokenPrice: {
        type: Number,
        required: true,
    },
    downTokenPrice: {
        type: Number,
        required: true,
    },
    token: {
        type: String,
        required: true,
        index: true,
    },
    eventType: {
        type: String,
        required: true,
        enum: ['hourly', '15min'],
        index: true,
    },
    outcome: {
        type: String,
        required: true,
        enum: ['UP', 'DOWN'],
        index: true,
    },
    coinPriceBias: {
        type: Number,
        required: false,
        index: false,
    },
}, {
    timestamps: true, // Adds createdAt and updatedAt fields
});

// Compound indexes for efficient queries
TokenPriceHistorySchema.index({ slug: 1, timestamp: -1 });
TokenPriceHistorySchema.index({ token: 1, eventType: 1, timestamp: -1 });
TokenPriceHistorySchema.index({ slug: 1, eventType: 1, timestamp: -1 });
TokenPriceHistorySchema.index({ token: 1, eventType: 1, outcome: 1, timestamp: -1 });
TokenPriceHistorySchema.index({ slug: 1, outcome: 1, timestamp: -1 });

export default mongoose.model<ITokenPriceHistory>('TokenPriceHistory', TokenPriceHistorySchema);

