import { Request, Response } from 'express';
import TokenPriceHistory from '../models/TokenPriceHistory';
import { logger } from '../utils/logger';

export const getPriceHistoryBySlug = async (req: Request, res: Response): Promise<void> => {
  try {
    const { slug } = req.params;
    const { startDate, endDate, limit } = req.query;

    if (!slug) {
      res.status(400).json({ error: 'Slug parameter is required' });
      return;
    }

    // Build query
    const query: any = { slug };

    // Add date range filters if provided
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) {
        query.timestamp.$gte = new Date(startDate as string);
      }
      if (endDate) {
        query.timestamp.$lte = new Date(endDate as string);
      }
    }

    // Build query with sorting by timestamp
    let queryBuilder = TokenPriceHistory.find(query).sort({ timestamp: 1 }); // Sort by timestamp ascending

    // Add limit if provided
    if (limit) {
      const limitNum = parseInt(limit as string, 10);
      if (!isNaN(limitNum) && limitNum > 0) {
        queryBuilder = queryBuilder.limit(Math.min(limitNum, 10000)); // Max 10000 records
      }
    }

    // Query database
    const priceHistory = await queryBuilder.exec();

    res.json({
      slug,
      count: priceHistory.length,
      data: priceHistory.map(item => ({
        slug: item.slug,
        timestamp: item.timestamp,
        upTokenPrice: item.upTokenPrice,
        downTokenPrice: item.downTokenPrice,
      })),
    });
  } catch (error) {
    logger.error('Error fetching price history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getLatestPriceBySlug = async (req: Request, res: Response): Promise<void> => {
  try {
    const { slug } = req.params;

    if (!slug) {
      res.status(400).json({ error: 'Slug parameter is required' });
      return;
    }

    // Get the latest price for the slug
    const latestPrice = await TokenPriceHistory.findOne(
      { slug },
      null,
      { sort: { timestamp: -1 } }
    );

    if (!latestPrice) {
      res.status(404).json({ error: 'No price data found for this slug' });
      return;
    }

    res.json({
      slug: latestPrice.slug,
      timestamp: latestPrice.timestamp,
      upTokenPrice: latestPrice.upTokenPrice,
      downTokenPrice: latestPrice.downTokenPrice,
    });
  } catch (error) {
    logger.error('Error fetching latest price:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getAllSlugs = async (req: Request, res: Response): Promise<void> => {
  try {
    // Get distinct slugs from the database
    const slugs = await TokenPriceHistory.distinct('slug');

    // Get the latest timestamp for each slug and sort by it
    const slugsWithLatestTimestamp = await Promise.all(
      slugs.map(async (slug) => {
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

    // Extract sorted slugs
    const sortedSlugs = slugsWithLatestTimestamp.map(item => item.slug);

    res.json({
      count: sortedSlugs.length,
      slugs: sortedSlugs,
    });
  } catch (error) {
    logger.error('Error fetching all slugs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

