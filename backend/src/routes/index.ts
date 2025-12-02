import { Router, Request, Response } from 'express';

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

export default router;

