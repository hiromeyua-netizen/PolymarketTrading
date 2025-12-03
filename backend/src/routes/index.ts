import { Router, Request, Response } from 'express';
import { getPriceHistoryBySlug, getLatestPriceBySlug, getAllSlugs } from '../controllers/priceHistoryController';
import { calculateStrategy } from '../controllers/strategyController';

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

// Strategy calculation route
router.get('/strategy/calculate', calculateStrategy);

export default router;

