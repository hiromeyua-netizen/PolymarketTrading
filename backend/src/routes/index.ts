import { Router, Request, Response } from 'express';
import { getPriceHistoryBySlug, getLatestPriceBySlug, getAllSlugs } from '../controllers/priceHistoryController';
import { calculateTotalProfit, calculateTotalProfit2 } from '../controllers/strategyController';

const router = Router();

// Health check endpoint
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

// Price history routes
router.get('/slugs', getAllSlugs);
router.get('/price-history/:slug', getPriceHistoryBySlug);
router.get('/price-history/:slug/latest', getLatestPriceBySlug);

// Strategy calculation routes
router.get('/strategy/total-profit', calculateTotalProfit);
router.get('/strategy/total-profit-2', calculateTotalProfit2);

export default router;

