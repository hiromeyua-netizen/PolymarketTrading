import { Request, Response } from 'express';
import TokenPriceHistory from '../models/TokenPriceHistory';
import { logger } from '../utils/logger';

interface StrategyResult {
  slug: string;
  winningToken: 'up' | 'down' | 'none';
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
    // Get thresholds from request parameters
    const entryThresholdParam = req.query.entryThreshold || req.query.entry;
    const exitThresholdParam = req.query.exitThreshold || req.query.exit;

    if (!entryThresholdParam || !exitThresholdParam) {
      res.status(400).json({ 
        error: 'Missing required parameters',
        message: 'Please provide entryThreshold and exitThreshold as query parameters'
      });
      return;
    }

    const entryThreshold = parseFloat(entryThresholdParam as string);
    const exitThreshold = parseFloat(exitThresholdParam as string);

    if (isNaN(entryThreshold) || isNaN(exitThreshold)) {
      res.status(400).json({ 
        error: 'Invalid parameters',
        message: 'entryThreshold and exitThreshold must be valid numbers'
      });
      return;
    }

    if (entryThreshold <= 0 || entryThreshold >= 1 || exitThreshold <= 0 || exitThreshold >= 1) {
      res.status(400).json({ 
        error: 'Invalid threshold values',
        message: 'Thresholds must be between 0 and 1'
      });
      return;
    }

    if (entryThreshold <= exitThreshold) {
      res.status(400).json({ 
        error: 'Invalid threshold values',
        message: 'entryThreshold must be greater than exitThreshold'
      });
      return;
    }

    // Get hours parameter (default 24 hours)
    const hoursParam = req.query.hours;
    const hours = hoursParam ? parseFloat(hoursParam as string) : 24;

    if (isNaN(hours) || hours <= 0) {
      res.status(400).json({ 
        error: 'Invalid hours parameter',
        message: 'hours must be a positive number'
      });
      return;
    }

    // Calculate cutoff time (current time - hours)
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);

    // Calculate profit and loss amounts based on thresholds
    // Loss: difference between entry and exit thresholds (e.g., 0.80 - 0.50 = 0.30)
    const lossAmount = -(entryThreshold - exitThreshold);
    // Profit: difference between max price (1.0) and entry threshold (e.g., 1.0 - 0.80 = 0.20)
    const profitAmount = 1.0 - entryThreshold;

    // Get slugs that have data within the time window
    const slugs = await TokenPriceHistory.distinct('slug', {
      timestamp: { $gte: cutoffTime }
    });

    const results: StrategyResult[] = [];
    let totalProfit = 0;
    let wins = 0;
    let losses = 0;
    let noEntries = 0;

    // Process each slug
    for (const slug of slugs) {
      // Get price history for this slug within the time window, sorted by timestamp
      const priceHistory = await TokenPriceHistory.find({ 
        slug,
        timestamp: { $gte: cutoffTime }
      })
        .sort({ timestamp: 1 })
        .exec();

      if (priceHistory.length === 0) {
        continue;
      }

      // Find which token first reaches > 0.80 (winning token)
      let entryIndex = -1;
      let entryPrice = 0;
      let entryTimestamp: Date | null = null;
      let winningToken: 'up' | 'down' | 'none' = 'none';

      // Check both UP and DOWN tokens to find which one first reaches > 0.80
      for (let i = 0; i < priceHistory.length; i++) {
        const upPrice = priceHistory[i].upTokenPrice;
        const downPrice = priceHistory[i].downTokenPrice;

        // Check if UP token reaches > 0.80 first
        if (upPrice > entryThreshold) {
          entryIndex = i;
          entryPrice = upPrice;
          entryTimestamp = priceHistory[i].timestamp;
          winningToken = 'up';
          break;
        }

        // Check if DOWN token reaches > 0.80 first
        if (downPrice > entryThreshold) {
          entryIndex = i;
          entryPrice = downPrice;
          entryTimestamp = priceHistory[i].timestamp;
          winningToken = 'down';
          break;
        }
      }

      // If no entry point found, mark as no_entry
      if (entryIndex === -1 || winningToken === 'none') {
        results.push({
          slug,
          winningToken: 'none',
          entryPrice: 0,
          entryTimestamp: priceHistory[0].timestamp,
          outcome: 'no_entry',
          profit: 0,
        });
        noEntries++;
        continue;
      }

      // Check if the winning token price drops below 0.50 after entry
      let exitPrice: number | undefined;
      let exitTimestamp: Date | undefined;
      let isLoss = false;

      for (let i = entryIndex + 1; i < priceHistory.length; i++) {
        const currentPrice = winningToken === 'up' 
          ? priceHistory[i].upTokenPrice 
          : priceHistory[i].downTokenPrice;

        if (currentPrice < exitThreshold) {
          isLoss = true;
          exitPrice = currentPrice;
          exitTimestamp = priceHistory[i].timestamp;
          break;
        }
      }

      // Determine outcome and profit
      const outcome: 'win' | 'loss' = isLoss ? 'loss' : 'win';
      const profit = isLoss ? lossAmount : profitAmount;

      results.push({
        slug,
        winningToken,
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

