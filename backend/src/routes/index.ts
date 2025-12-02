import { Router, Request, Response } from 'express';
import { getPriceHistoryBySlug, getLatestPriceBySlug, getAllSlugs } from '../controllers/priceHistoryController';

const router = Router();

// Health check route
router.get('/', (req: Request, res: Response) => {
  res.json({
    message: 'Polymarket Trading Bot API',
    status: 'running',
    timestamp: new Date().toISOString(),
  });
});

// Health check endpoint
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

// Price history routes
router.get('/api/slugs', getAllSlugs);
router.get('/api/price-history/:slug', getPriceHistoryBySlug);
router.get('/api/price-history/:slug/latest', getLatestPriceBySlug);

export default router;

