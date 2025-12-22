import { Request, Response } from 'express';
import TokenPriceHistory from '../models/TokenPriceHistory';
import { logger } from '../utils/logger';
import { calculateGridHedgeStrategy, PriceData } from '../utils/strategyCalculator1';
import { calculatePrePurchasedSellStrategy, PriceData as PriceData2 } from '../utils/strategyCalculator2';
import { calculateNewHedgeStrategy, PriceData as PriceData3 } from '../utils/strategyCalculater3';

/**
 * Calculate total profit across all slugs
 * GET /api/strategy/total-profit
 * Query parameters:
 *   - maxTotalCost: number (default: 0.97)
 *   - gridGap: number (default: 5)
 *   - orderSize: number (default: 1)
 *   - enableRebuy: boolean (default: true)
 *   - enableDoubleSide: boolean (default: true)
 *   - token: string (optional) - filter by coin symbol (BTC, ETH, SOL, XRP)
 *   - eventType: string (optional) - filter by event type (hourly, 15min)
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
    const enableDoubleSide = req.query.enableDoubleSide !== undefined
      ? req.query.enableDoubleSide === 'true' || req.query.enableDoubleSide === '1'
      : true;
    const token = req.query.token as string | undefined;
    const eventType = req.query.eventType as string | undefined;
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

    // Build query for filtering slugs
    const slugQuery: any = {};
    if (token) {
      slugQuery.token = token;
    }
    if (eventType) {
      slugQuery.eventType = eventType;
    }

    // Get all distinct slugs with filters
    const allSlugs = await TokenPriceHistory.distinct('slug', slugQuery);

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
        const query: any = { slug, ...slugQuery };
        const latestPrice = await TokenPriceHistory.findOne(
          query,
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
        // Build query for price history
        const priceHistoryQuery: any = { slug, ...slugQuery };
        
        // Get price history for this slug
        const priceHistory = await TokenPriceHistory.find(priceHistoryQuery)
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
            coinPriceBias: item.coinPriceBias,
          };
        });

        // Calculate strategy for this slug
        const strategyResult = calculateGridHedgeStrategy(
          priceData,
          maxTotalCost,
          gridGap,
          orderSize,
          enableRebuy,
          enableDoubleSide
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
        enableDoubleSide,
        token: token || null,
        eventType: eventType || null,
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
 *   - token: string (optional) - filter by coin symbol (BTC, ETH, SOL, XRP)
 *   - eventType: string (optional) - filter by event type (hourly, 15min)
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
    const token = req.query.token as string | undefined;
    const eventType = req.query.eventType as string | undefined;
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

    // Build query for filtering slugs
    const slugQuery: any = {};
    if (token) {
      slugQuery.token = token;
    }
    if (eventType) {
      slugQuery.eventType = eventType;
    }

    // Get all distinct slugs with filters
    const allSlugs = await TokenPriceHistory.distinct('slug', slugQuery);

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
        const query: any = { slug, ...slugQuery };
        const latestPrice = await TokenPriceHistory.findOne(
          query,
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
        // Build query for price history
        const priceHistoryQuery: any = { slug, ...slugQuery };
        
        // Get price history for this slug
        const priceHistory = await TokenPriceHistory.find(priceHistoryQuery)
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
            coinPriceBias: item.coinPriceBias,
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
        token: token || null,
        eventType: eventType || null,
        count: count || null,
      },
      results,
    });
  } catch (error) {
    logger.error('Error calculating total profit for strategy 2:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Calculate total profit across all slugs for Strategy 3 (New Hedge Strategy)
 * GET /api/strategy/total-profit-3
 * Query parameters:
 *   - priceDiff: number (default: 100) - Maximum absolute coin price bias threshold (in dollars)
 *   - timeTillEnd: number (default: 300) - Minimum time remaining until event ends (in seconds)
 *   - targetPrice: number (default: 50) - Maximum price for losing side token (in cents)
 *   - maxTotalCent: number (default: 100) - Maximum total cost for both orders (in cents)
 *   - orderSize: number (default: 1)
 *   - token: string (optional) - filter by coin symbol (BTC, ETH, SOL, XRP)
 *   - eventType: string (optional) - filter by event type (hourly, 15min)
 *   - count: number (optional) - number of latest slugs to calculate (default: all slugs)
 */
export const calculateTotalProfit3 = async (req: Request, res: Response): Promise<void> => {
  try {
    // Get parameters from query
    const priceDiff = req.query.priceDiff 
      ? parseFloat(req.query.priceDiff as string) 
      : 100;
    const timeTillEnd = req.query.timeTillEnd 
      ? parseInt(req.query.timeTillEnd as string, 10) 
      : 300;
    const targetPrice = req.query.targetPrice 
      ? parseInt(req.query.targetPrice as string, 10) 
      : 50;
    const maxTotalCent = req.query.maxTotalCent 
      ? parseInt(req.query.maxTotalCent as string, 10) 
      : 100;
    const orderSize = req.query.orderSize 
      ? parseFloat(req.query.orderSize as string) 
      : 1;
    const token = req.query.token as string | undefined;
    const eventType = req.query.eventType as string | undefined;
    const count = req.query.count 
      ? parseInt(req.query.count as string, 10) 
      : undefined;

    // Validate parameters
    if (isNaN(priceDiff) || priceDiff <= 0) {
      res.status(400).json({ 
        error: 'Invalid priceDiff',
        message: 'priceDiff must be a positive number'
      });
      return;
    }

    if (isNaN(timeTillEnd) || timeTillEnd <= 0) {
      res.status(400).json({ 
        error: 'Invalid timeTillEnd',
        message: 'timeTillEnd must be a positive number (in seconds)'
      });
      return;
    }

    if (isNaN(targetPrice) || targetPrice <= 0 || targetPrice > 100) {
      res.status(400).json({ 
        error: 'Invalid targetPrice',
        message: 'targetPrice must be a number between 0 and 100 (in cents)'
      });
      return;
    }

    if (isNaN(maxTotalCent) || maxTotalCent <= 0 || maxTotalCent > 200) {
      res.status(400).json({ 
        error: 'Invalid maxTotalCent',
        message: 'maxTotalCent must be a number between 0 and 200 (in cents)'
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

    // Build query for filtering slugs
    const slugQuery: any = {};
    if (token) {
      slugQuery.token = token;
    }
    if (eventType) {
      slugQuery.eventType = eventType;
    }

    // Get all distinct slugs with filters
    const allSlugs = await TokenPriceHistory.distinct('slug', slugQuery);

    if (allSlugs.length === 0) {
      res.json({
        totalProfit: 0,
        totalCost: 0,
        totalFinalValue: 0,
        totalEntries: 0,
        totalHedgesFilled: 0,
        totalSlugCount: 0,
        processedSlugCount: 0,
        actualProcessedCount: 0,
        parameters: {
          priceDiff,
          timeTillEnd,
          targetPrice,
          maxTotalCent,
          orderSize,
          token: token || null,
          eventType: eventType || null,
          count: count || null,
        },
        results: []
      });
      return;
    }

    // Get slugs sorted by latest timestamp (most recent first)
    const slugsWithLatestTimestamp = await Promise.all(
      allSlugs.map(async (slug) => {
        const query: any = { slug, ...slugQuery };
        const latestPrice = await TokenPriceHistory.findOne(
          query,
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
        // Build query for price history
        const priceHistoryQuery: any = { slug, ...slugQuery };
        
        // Get price history for this slug
        const priceHistory = await TokenPriceHistory.find(priceHistoryQuery)
          .sort({ timestamp: 1 })
          .exec();

        if (priceHistory.length === 0) {
          continue;
        }

        // Get eventType from first record (all records for a slug should have same eventType)
        const eventTypeFromData = priceHistory[0].eventType as 'hourly' | '15min';

        // Convert to PriceData format
        const priceData: PriceData3[] = priceHistory.map(item => {
          const timestamp = item.timestamp.toISOString();
          return {
            slug: item.slug,
            timestamp: timestamp,
            upTokenPrice: item.upTokenPrice,
            downTokenPrice: item.downTokenPrice,
            createdAt: timestamp,
            coinPriceBias: item.coinPriceBias,
          };
        });

        // Calculate strategy for this slug
        const strategyResult = calculateNewHedgeStrategy(
          priceData,
          priceDiff,
          timeTillEnd,
          targetPrice,
          maxTotalCent,
          orderSize,
          eventTypeFromData
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
        logger.error(`Error calculating strategy 3 for slug ${slug}:`, error);
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
        priceDiff,
        timeTillEnd,
        targetPrice,
        maxTotalCent,
        orderSize,
        token: token || null,
        eventType: eventType || null,
        count: count || null,
      },
      results,
    });
  } catch (error) {
    logger.error('Error calculating total profit for strategy 3:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

