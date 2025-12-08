import { Request, Response } from 'express';
import TokenPriceHistory from '../models/TokenPriceHistory';
import { logger } from '../utils/logger';
import { calculateGridHedgeStrategy, PriceData } from '../utils/strategyCalculator1';
import { calculatePrePurchasedSellStrategy, PriceData as PriceData2 } from '../utils/strategyCalculator2';

/**
 * Calculate total profit across all slugs
 * GET /api/strategy/total-profit
 * Query parameters:
 *   - maxTotalCost: number (default: 0.97)
 *   - gridGap: number (default: 5)
 *   - orderSize: number (default: 1)
 *   - enableRebuy: boolean (default: true)
 *   - count: number (optional) - number of latest slugs to calculate (default: all slugs)
 */
export const calculateTotalProfit = async (req: Request, res: Response): Promise<void> => {
  try {
    // Get parameters from query
    const maxTotalCost = req.query.maxTotalCost 
      ? parseFloat(req.query.maxTotalCost as string) 
      : 0.97;
    const gridGap = req.query.gridGap 
      ? parseInt(req.query.gridGap as string, 10) 
      : 5;
    const orderSize = req.query.orderSize 
      ? parseFloat(req.query.orderSize as string) 
      : 1;
    const enableRebuy = req.query.enableRebuy !== undefined
      ? req.query.enableRebuy === 'true' || req.query.enableRebuy === '1'
      : true;
    const count = req.query.count 
      ? parseInt(req.query.count as string, 10) 
      : undefined;

    // Validate parameters
    if (isNaN(maxTotalCost) || maxTotalCost <= 0 || maxTotalCost >= 100) {
      res.status(400).json({ 
        error: 'Invalid maxTotalCost',
        message: 'maxTotalCost must be a number between 0 and 100'
      });
      return;
    }

    if (isNaN(gridGap) || gridGap <= 0 || gridGap > 50) {
      res.status(400).json({ 
        error: 'Invalid gridGap',
        message: 'gridGap must be a positive number less than or equal to 50'
      });
      return;
    }

    if (isNaN(orderSize) || orderSize <= 0) {
      res.status(400).json({ 
        error: 'Invalid orderSize',
        message: 'orderSize must be a positive number'
      });
      return;
    }

    if (count !== undefined && (isNaN(count) || count <= 0)) {
      res.status(400).json({ 
        error: 'Invalid count',
        message: 'count must be a positive number'
      });
      return;
    }

    // Get all distinct slugs
    const allSlugs = await TokenPriceHistory.distinct('slug');

    if (allSlugs.length === 0) {
      res.json({
        totalProfit: 0,
        totalCost: 0,
        totalFinalValue: 0,
        totalEntries: 0,
        totalHedgesFilled: 0,
        slugCount: 0,
        processedSlugCount: 0,
        results: []
      });
      return;
    }

    // Get slugs sorted by latest timestamp (most recent first)
    const slugsWithLatestTimestamp = await Promise.all(
      allSlugs.map(async (slug) => {
        const latestPrice = await TokenPriceHistory.findOne(
          { slug },
          { timestamp: 1 },
          { sort: { timestamp: -1 } }
        );
        return {
          slug,
          latestTimestamp: latestPrice?.timestamp || new Date(0), // Use epoch if no data found
        };
      })
    );

    // Sort by latest timestamp (descending - most recent first)
    slugsWithLatestTimestamp.sort((a, b) => {
      const timeA = a.latestTimestamp.getTime();
      const timeB = b.latestTimestamp.getTime();
      return timeB - timeA; // Descending order
    });

    // Extract sorted slugs and limit by count if provided
    let slugs: string[];
    if (count !== undefined) {
      slugs = slugsWithLatestTimestamp.slice(0, count).map(item => item.slug);
    } else {
      slugs = slugsWithLatestTimestamp.map(item => item.slug);
    }

    // Calculate strategy for each slug
    let totalProfit = 0;
    let totalCost = 0;
    let totalFinalValue = 0;
    let totalEntries = 0;
    let totalHedgesFilled = 0;
    const results: Array<{
      slug: string;
      profit: number;
      cost: number;
      finalValue: number;
      entries: number;
      hedgesFilled: number;
    }> = [];

    for (const slug of slugs) {
      try {
        // Get price history for this slug
        const priceHistory = await TokenPriceHistory.find({ slug })
          .sort({ timestamp: 1 })
          .exec();

        if (priceHistory.length === 0) {
          continue;
        }

        // Convert to PriceData format
        const priceData: PriceData[] = priceHistory.map(item => {
          const timestamp = item.timestamp.toISOString();
          return {
            slug: item.slug,
            timestamp: timestamp,
            upTokenPrice: item.upTokenPrice,
            downTokenPrice: item.downTokenPrice,
            createdAt: timestamp, // Use timestamp as createdAt
          };
        });

        // Calculate strategy for this slug
        const strategyResult = calculateGridHedgeStrategy(
          priceData,
          maxTotalCost,
          gridGap,
          orderSize,
          enableRebuy
        );

        // Accumulate totals
        totalProfit += strategyResult.totalProfit;
        totalCost += strategyResult.totalCost;
        totalFinalValue += strategyResult.finalValue;
        totalEntries += strategyResult.totalEntries;
        totalHedgesFilled += strategyResult.totalHedgesFilled;

        // Store individual result
        results.push({
          slug,
          profit: strategyResult.totalProfit,
          cost: strategyResult.totalCost,
          finalValue: strategyResult.finalValue,
          entries: strategyResult.totalEntries,
          hedgesFilled: strategyResult.totalHedgesFilled,
        });
      } catch (error) {
        logger.error(`Error calculating strategy for slug ${slug}:`, error);
        // Continue with next slug instead of failing completely
      }
    }

    res.json({
      totalProfit: Math.round(totalProfit * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      totalFinalValue: Math.round(totalFinalValue * 100) / 100,
      totalEntries,
      totalHedgesFilled,
      totalSlugCount: allSlugs.length,
      processedSlugCount: slugs.length,
      actualProcessedCount: results.length,
      parameters: {
        maxTotalCost,
        gridGap,
        orderSize,
        enableRebuy,
        count: count || null,
      },
      results,
    });
  } catch (error) {
    logger.error('Error calculating total profit:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Calculate total profit across all slugs for Strategy 2
 * GET /api/strategy/total-profit-2
 * Query parameters:
 *   - targetTotal: number (default: 105) - in cents
 *   - sellThreshold: number (default: 65) - in cents
 *   - orderSize: number (default: 1)
 *   - count: number (optional) - number of latest slugs to calculate (default: all slugs)
 */
export const calculateTotalProfit2 = async (req: Request, res: Response): Promise<void> => {
  try {
    // Get parameters from query
    const targetTotal = req.query.targetTotal 
      ? parseInt(req.query.targetTotal as string, 10) 
      : 105;
    const sellThreshold = req.query.sellThreshold 
      ? parseInt(req.query.sellThreshold as string, 10) 
      : 65;
    const orderSize = req.query.orderSize 
      ? parseFloat(req.query.orderSize as string) 
      : 1;
    const count = req.query.count 
      ? parseInt(req.query.count as string, 10) 
      : undefined;

    // Validate parameters
    if (isNaN(targetTotal) || targetTotal <= 0 || targetTotal > 200) {
      res.status(400).json({ 
        error: 'Invalid targetTotal',
        message: 'targetTotal must be a number between 0 and 200'
      });
      return;
    }

    if (isNaN(sellThreshold) || sellThreshold <= 0 || sellThreshold > 100) {
      res.status(400).json({ 
        error: 'Invalid sellThreshold',
        message: 'sellThreshold must be a number between 0 and 100'
      });
      return;
    }

    if (isNaN(orderSize) || orderSize <= 0) {
      res.status(400).json({ 
        error: 'Invalid orderSize',
        message: 'orderSize must be a positive number'
      });
      return;
    }

    if (count !== undefined && (isNaN(count) || count <= 0)) {
      res.status(400).json({ 
        error: 'Invalid count',
        message: 'count must be a positive number'
      });
      return;
    }

    // Get all distinct slugs
    const allSlugs = await TokenPriceHistory.distinct('slug');

    if (allSlugs.length === 0) {
      res.json({
        totalProfit: 0,
        totalCost: 0,
        totalFinalValue: 0,
        totalReceived: 0,
        totalSlugCount: 0,
        processedSlugCount: 0,
        actualProcessedCount: 0,
        results: []
      });
      return;
    }

    // Get slugs sorted by latest timestamp (most recent first)
    const slugsWithLatestTimestamp = await Promise.all(
      allSlugs.map(async (slug) => {
        const latestPrice = await TokenPriceHistory.findOne(
          { slug },
          { timestamp: 1 },
          { sort: { timestamp: -1 } }
        );
        return {
          slug,
          latestTimestamp: latestPrice?.timestamp || new Date(0),
        };
      })
    );

    // Sort by latest timestamp (descending - most recent first)
    slugsWithLatestTimestamp.sort((a, b) => {
      const timeA = a.latestTimestamp.getTime();
      const timeB = b.latestTimestamp.getTime();
      return timeB - timeA;
    });

    // Extract sorted slugs and limit by count if provided
    let slugs: string[];
    if (count !== undefined) {
      slugs = slugsWithLatestTimestamp.slice(0, count).map(item => item.slug);
    } else {
      slugs = slugsWithLatestTimestamp.map(item => item.slug);
    }

    // Calculate strategy for each slug
    let totalProfit = 0;
    let totalCost = 0;
    let totalReceived = 0;
    const results: Array<{
      slug: string;
      profit: number;
      cost: number;
      totalReceived: number;
    }> = [];

    for (const slug of slugs) {
      try {
        // Get price history for this slug
        const priceHistory = await TokenPriceHistory.find({ slug })
          .sort({ timestamp: 1 })
          .exec();

        if (priceHistory.length === 0) {
          continue;
        }

        // Convert to PriceData format
        const priceData: PriceData2[] = priceHistory.map(item => {
          const timestamp = item.timestamp.toISOString();
          return {
            slug: item.slug,
            timestamp: timestamp,
            upTokenPrice: item.upTokenPrice,
            downTokenPrice: item.downTokenPrice,
            createdAt: timestamp,
          };
        });

        // Calculate strategy for this slug
        const strategyResult = calculatePrePurchasedSellStrategy(
          priceData,
          targetTotal,
          sellThreshold,
          orderSize
        );

        // Accumulate totals
        totalProfit += strategyResult.totalProfit;
        totalCost += strategyResult.totalCost;
        totalReceived += strategyResult.totalReceived;

        // Store individual result
        results.push({
          slug,
          profit: strategyResult.totalProfit,
          cost: strategyResult.totalCost,
          totalReceived: strategyResult.totalReceived,
        });
      } catch (error) {
        logger.error(`Error calculating strategy 2 for slug ${slug}:`, error);
        // Continue with next slug instead of failing completely
      }
    }

    res.json({
      totalProfit: Math.round(totalProfit * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      totalReceived: Math.round(totalReceived * 100) / 100,
      totalSlugCount: allSlugs.length,
      processedSlugCount: slugs.length,
      actualProcessedCount: results.length,
      parameters: {
        targetTotal,
        sellThreshold,
        orderSize,
        count: count || null,
      },
      results,
    });
  } catch (error) {
    logger.error('Error calculating total profit for strategy 2:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

