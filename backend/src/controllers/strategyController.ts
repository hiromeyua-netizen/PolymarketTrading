import { Request, Response } from 'express';
import TokenPriceHistory from '../models/TokenPriceHistory';
import { logger } from '../utils/logger';

// Grid levels: 55c, 60c, 65c, 70c, 75c, 80c, 85c, 90c, 95c
const GRID_LEVELS = [0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95];

interface GridLevelState {
  level: number;
  hasEntry: boolean;
  hedgeFilled: boolean;
  entryPrice: number;
  hedgePrice: number;
  tokenType: 'up' | 'down' | null;
  entryTimestamp: Date | null;
  hedgeFilledTimestamp: Date | null;
  positionCount: number; // Number of contracts at this level
}

interface Position {
  gridLevel: number;
  tokenType: 'up' | 'down';
  entryPrice: number;
  hedgePrice: number;
  hedgeFilled: boolean;
  orderSize: number;
  entryTimestamp: Date;
  hedgeFilledTimestamp?: Date;
}

/**
 * Calculate hedge price for a given entry price
 * Pattern: 55c → 42c, 60c → 37c
 * Formula: hedge = 1.0 - entryPrice - 0.03
 */
function calculateHedgePrice(entryPrice: number): number {
  return Math.max(0, 1.0 - entryPrice - 0.03);
}

/**
 * Check if price crosses a grid level from below (ascending)
 */
function crossesLevelFromBelow(previousPrice: number, currentPrice: number, level: number): boolean {
  return previousPrice < level && currentPrice >= level;
}

/**
 * Check if price reaches or crosses a target price
 */
function reachesPrice(previousPrice: number, currentPrice: number, targetPrice: number): boolean {
  return (previousPrice < targetPrice && currentPrice >= targetPrice) ||
         (previousPrice > targetPrice && currentPrice <= targetPrice);
}

/**
 * Grid Hedge Strategy Calculator
 * 
 * @param priceHistory - Array of token price history sorted by timestamp
 * @param orderSize - Size for each order in one event
 * @returns Total profit from the strategy
 */
export function calculateGridHedgeStrategy(
  priceHistory: Array<{
    timestamp: Date;
    upTokenPrice: number;
    downTokenPrice: number;
  }>,
  orderSize: number
): number {
  if (priceHistory.length === 0) {
    return 0;
  }

  // Track state for each grid level for both UP and DOWN tokens
  const upGridStates: Map<number, GridLevelState> = new Map();
  const downGridStates: Map<number, GridLevelState> = new Map();

  // Initialize grid states
  GRID_LEVELS.forEach(level => {
    upGridStates.set(level, {
      level,
      hasEntry: false,
      hedgeFilled: false,
      entryPrice: level,
      hedgePrice: calculateHedgePrice(level),
      tokenType: 'up',
      entryTimestamp: null,
      hedgeFilledTimestamp: null,
      positionCount: 0,
    });
    downGridStates.set(level, {
      level,
      hasEntry: false,
      hedgeFilled: false,
      entryPrice: level,
      hedgePrice: calculateHedgePrice(level),
      tokenType: 'down',
      entryTimestamp: null,
      hedgeFilledTimestamp: null,
      positionCount: 0,
    });
  });

  // Track all positions for profit calculation
  const positions: Position[] = [];

  // Process price history chronologically
  for (let i = 0; i < priceHistory.length; i++) {
    const current = priceHistory[i];
    const previous = i > 0 ? priceHistory[i - 1] : current;

    const upPrice = current.upTokenPrice;
    const downPrice = current.downTokenPrice;
    const prevUpPrice = previous.upTokenPrice;
    const prevDownPrice = previous.downTokenPrice;

    // Process UP token grid crossings
    for (const level of GRID_LEVELS) {
      const state = upGridStates.get(level)!;

      // Check if UP token crosses this level from below
      if (crossesLevelFromBelow(prevUpPrice, upPrice, level)) {
        // Check if we should place an entry:
        // 1. No entry yet, OR
        // 2. Hedge was already filled (re-entry condition)
        if (!state.hasEntry || state.hedgeFilled) {
          // Place entry order on UP token at this level
          state.hasEntry = true;
          state.entryTimestamp = current.timestamp;
          state.positionCount += orderSize;

          // Create position
          positions.push({
            gridLevel: level,
            tokenType: 'up',
            entryPrice: level,
            hedgePrice: state.hedgePrice,
            hedgeFilled: false,
            orderSize: orderSize,
            entryTimestamp: current.timestamp,
          });

          // Reset hedge filled flag for re-entry (new position needs new hedge)
          state.hedgeFilled = false;
        }
      }

      // Check if DOWN token reaches the hedge price for this UP entry
      if (state.hasEntry && !state.hedgeFilled) {
        if (reachesPrice(prevDownPrice, downPrice, state.hedgePrice)) {
          state.hedgeFilled = true;
          state.hedgeFilledTimestamp = current.timestamp;

          // Update the most recent position at this level
          const recentPositions = positions.filter(p => 
            p.gridLevel === level && 
            p.tokenType === 'up' && 
            !p.hedgeFilled
          );
          if (recentPositions.length > 0) {
            const latestPosition = recentPositions[recentPositions.length - 1];
            latestPosition.hedgeFilled = true;
            latestPosition.hedgeFilledTimestamp = current.timestamp;
          }
        }
      }
    }

    // Process DOWN token grid crossings
    for (const level of GRID_LEVELS) {
      const state = downGridStates.get(level)!;

      // Check if DOWN token crosses this level from below
      if (crossesLevelFromBelow(prevDownPrice, downPrice, level)) {
        // Check if we should place an entry:
        // 1. No entry yet, OR
        // 2. Hedge was already filled (re-entry condition)
        if (!state.hasEntry || state.hedgeFilled) {
          // Place entry order on DOWN token at this level
          state.hasEntry = true;
          state.entryTimestamp = current.timestamp;
          state.positionCount += orderSize;

          // Create position
          positions.push({
            gridLevel: level,
            tokenType: 'down',
            entryPrice: level,
            hedgePrice: state.hedgePrice,
            hedgeFilled: false,
            orderSize: orderSize,
            entryTimestamp: current.timestamp,
          });

          // Reset hedge filled flag for re-entry (new position needs new hedge)
          state.hedgeFilled = false;
        }
      }

      // Check if UP token reaches the hedge price for this DOWN entry
      if (state.hasEntry && !state.hedgeFilled) {
        if (reachesPrice(prevUpPrice, upPrice, state.hedgePrice)) {
          state.hedgeFilled = true;
          state.hedgeFilledTimestamp = current.timestamp;

          // Update the most recent position at this level
          const recentPositions = positions.filter(p => 
            p.gridLevel === level && 
            p.tokenType === 'down' && 
            !p.hedgeFilled
          );
          if (recentPositions.length > 0) {
            const latestPosition = recentPositions[recentPositions.length - 1];
            latestPosition.hedgeFilled = true;
            latestPosition.hedgeFilledTimestamp = current.timestamp;
          }
        }
      }
    }
  }

  // Calculate final profit
  // Get the final prices to determine outcomes
  const finalPrice = priceHistory[priceHistory.length - 1];
  const finalUpPrice = finalPrice.upTokenPrice;
  const finalDownPrice = finalPrice.downTokenPrice;

  let totalProfit = 0;

  for (const position of positions) {
    if (position.tokenType === 'up') {
      // UP token position
      if (position.hedgeFilled) {
        // Hedge was filled - position is protected
        // Profit = (hedgePrice - entryPrice) * orderSize
        // If UP wins (final price = 1.0), we get full profit
        // If DOWN wins (final price = 0.0), hedge protects us
        const profit = (position.hedgePrice - position.entryPrice) * position.orderSize;
        totalProfit += profit;
      } else {
        // No hedge - exposed position
        // If UP wins: profit = (1.0 - entryPrice) * orderSize
        // If DOWN wins: loss = (0.0 - entryPrice) * orderSize = -entryPrice * orderSize
        if (finalUpPrice > finalDownPrice) {
          // UP is winning
          const profit = (1.0 - position.entryPrice) * position.orderSize;
          totalProfit += profit;
        } else {
          // DOWN is winning - loss
          const loss = -position.entryPrice * position.orderSize;
          totalProfit += loss;
        }
      }
    } else {
      // DOWN token position
      if (position.hedgeFilled) {
        // Hedge was filled - position is protected
        // Profit = (hedgePrice - entryPrice) * orderSize
        const profit = (position.hedgePrice - position.entryPrice) * position.orderSize;
        totalProfit += profit;
      } else {
        // No hedge - exposed position
        // If DOWN wins: profit = (1.0 - entryPrice) * orderSize
        // If UP wins: loss = (0.0 - entryPrice) * orderSize = -entryPrice * orderSize
        if (finalDownPrice > finalUpPrice) {
          // DOWN is winning
          const profit = (1.0 - position.entryPrice) * position.orderSize;
          totalProfit += profit;
        } else {
          // UP is winning - loss
          const loss = -position.entryPrice * position.orderSize;
          totalProfit += loss;
        }
      }
    }
  }

  return totalProfit;
}

/**
 * API endpoint for calculating Grid Hedge Strategy
 */
export const calculateStrategy = async (req: Request, res: Response): Promise<void> => {
  try {
    // Get orderSize from request parameters
    const orderSizeParam = req.query.orderSize || req.query.size;
    
    if (!orderSizeParam) {
      res.status(400).json({ 
        error: 'Missing required parameter',
        message: 'Please provide orderSize as a query parameter'
      });
      return;
    }

    const orderSize = parseFloat(orderSizeParam as string);

    if (isNaN(orderSize) || orderSize <= 0) {
      res.status(400).json({ 
        error: 'Invalid parameter',
        message: 'orderSize must be a positive number'
      });
      return;
    }

    // Get optional slug parameter to filter by specific market
    const slugParam = req.query.slug;
    
    if (slugParam) {
      // Calculate profit for specific slug
      const priceHistory = await TokenPriceHistory.find({ slug: slugParam as string })
        .sort({ timestamp: 1 })
        .exec();

      if (priceHistory.length === 0) {
        res.status(404).json({ 
          error: 'No price data found',
          message: `No price data found for slug: ${slugParam}`
        });
        return;
      }

      // Convert to format expected by strategy calculator
      const priceData = priceHistory.map(item => ({
        timestamp: item.timestamp,
        upTokenPrice: item.upTokenPrice,
        downTokenPrice: item.downTokenPrice,
      }));

      // Calculate profit using Grid Hedge Strategy
      const profit = calculateGridHedgeStrategy(priceData, orderSize);

      res.json({
        success: true,
        orderSize,
        slug: slugParam as string,
        totalProfit: parseFloat(profit.toFixed(4)),
        dataPoints: priceHistory.length,
      });
    } else {
      // Calculate profit for all slugs
      const slugs = await TokenPriceHistory.distinct('slug');

      if (slugs.length === 0) {
        res.status(404).json({ 
          error: 'No price data found',
          message: 'No slugs found in database'
        });
        return;
      }

      const results: Array<{
        slug: string;
        profit: number;
        dataPoints: number;
      }> = [];

      let totalProfit = 0;
      let totalDataPoints = 0;

      // Calculate profit for each slug
      for (const slug of slugs) {
        const priceHistory = await TokenPriceHistory.find({ slug })
          .sort({ timestamp: 1 })
          .exec();

        if (priceHistory.length === 0) {
          continue;
        }

        // Convert to format expected by strategy calculator
        const priceData = priceHistory.map(item => ({
          timestamp: item.timestamp,
          upTokenPrice: item.upTokenPrice,
          downTokenPrice: item.downTokenPrice,
        }));

        // Calculate profit using Grid Hedge Strategy
        const profit = calculateGridHedgeStrategy(priceData, orderSize);

        results.push({
          slug,
          profit: parseFloat(profit.toFixed(4)),
          dataPoints: priceHistory.length,
        });

        totalProfit += profit;
        totalDataPoints += priceHistory.length;
      }

      res.json({
        success: true,
        orderSize,
        totalSlugs: slugs.length,
        totalProfit: parseFloat(totalProfit.toFixed(4)),
        totalDataPoints,
        results, // Profit breakdown per slug
      });
    }
  } catch (error) {
    logger.error('Error calculating Grid Hedge Strategy:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
