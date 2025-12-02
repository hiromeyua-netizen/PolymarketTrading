import mongoose, { Schema, Document } from 'mongoose';

export interface ITokenPriceHistory extends Document {
    slug: string;
    timestamp: Date;
    upTokenPrice: number; // bestAskPrice for YES/UP token
    downTokenPrice: number; // bestAskPrice for NO/DOWN token
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
}, {
    timestamps: true, // Adds createdAt and updatedAt fields
});

// Compound index for efficient queries by slug and timestamp
TokenPriceHistorySchema.index({ slug: 1, timestamp: -1 });

export default mongoose.model<ITokenPriceHistory>('TokenPriceHistory', TokenPriceHistorySchema);

