import { Request, Response } from 'express';
import TokenPriceHistory from '../models/TokenPriceHistory';
import { logger } from '../utils/logger';

interface StrategyResult {
  slug: string;
  entryPrice: number;
  entryTimestamp: Date;
  exitPrice?: number;
  exitTimestamp?: Date;
  outcome: 'win' | 'loss' | 'no_entry';
  profit: number;
}

interface StrategyStats {
  totalSlugs: number;
  totalTrades: number;
  wins: number;
  losses: number;
  noEntries: number;
  winRate: number;
  totalProfit: number;
  averageProfitPerTrade: number;
  results: StrategyResult[];
}

export const calculateStrategy = async (req: Request, res: Response): Promise<void> => {
  try {
    const entryThreshold = 0.80; // Buy if price > 0.80
    const exitThreshold = 0.50; // Sell if price < 0.50
    const profitAmount = 0.20; // Earn $0.20 if win
    const lossAmount = -0.30; // Lose $0.30 if loss

    // Get all slugs
    const slugs = await TokenPriceHistory.distinct('slug');

    const results: StrategyResult[] = [];
    let totalProfit = 0;
    let wins = 0;
    let losses = 0;
    let noEntries = 0;

    // Process each slug
    for (const slug of slugs) {
      // Get price history for this slug, sorted by timestamp
      const priceHistory = await TokenPriceHistory.find({ slug })
        .sort({ timestamp: 1 })
        .exec();

      if (priceHistory.length === 0) {
        continue;
      }

      // Find first entry point (first price > 0.80)
      let entryIndex = -1;
      let entryPrice = 0;
      let entryTimestamp: Date | null = null;

      for (let i = 0; i < priceHistory.length; i++) {
        if (priceHistory[i].upTokenPrice > entryThreshold) {
          entryIndex = i;
          entryPrice = priceHistory[i].upTokenPrice;
          entryTimestamp = priceHistory[i].timestamp;
          break;
        }
      }

      // If no entry point found, mark as no_entry
      if (entryIndex === -1) {
        results.push({
          slug,
          entryPrice: 0,
          entryTimestamp: priceHistory[0].timestamp,
          outcome: 'no_entry',
          profit: 0,
        });
        noEntries++;
        continue;
      }

      // Check if price drops below 0.50 after entry
      let exitPrice: number | undefined;
      let exitTimestamp: Date | undefined;
      let isLoss = false;

      for (let i = entryIndex + 1; i < priceHistory.length; i++) {
        if (priceHistory[i].upTokenPrice < exitThreshold) {
          isLoss = true;
          exitPrice = priceHistory[i].upTokenPrice;
          exitTimestamp = priceHistory[i].timestamp;
          break;
        }
      }

      // Determine outcome and profit
      const outcome: 'win' | 'loss' = isLoss ? 'loss' : 'win';
      const profit = isLoss ? lossAmount : profitAmount;

      results.push({
        slug,
        entryPrice,
        entryTimestamp: entryTimestamp!,
        exitPrice,
        exitTimestamp,
        outcome,
        profit,
      });

      totalProfit += profit;
      if (isLoss) {
        losses++;
      } else {
        wins++;
      }
    }

    const totalTrades = wins + losses;
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
    const averageProfitPerTrade = totalTrades > 0 ? totalProfit / totalTrades : 0;

    const stats: StrategyStats = {
      totalSlugs: slugs.length,
      totalTrades,
      wins,
      losses,
      noEntries,
      winRate: parseFloat(winRate.toFixed(2)),
      totalProfit: parseFloat(totalProfit.toFixed(2)),
      averageProfitPerTrade: parseFloat(averageProfitPerTrade.toFixed(2)),
      results,
    };

    res.json(stats);
  } catch (error) {
    logger.error('Error calculating strategy:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

