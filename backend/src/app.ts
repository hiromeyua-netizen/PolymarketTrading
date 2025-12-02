import express, { Express } from 'express';
import path from 'path';
import fs from 'fs';
import routes from './routes';

const createApp = (): Express => {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // API Routes (must be before static file serving)
  app.use('/api', routes);

  // Serve static files from frontend_build (CSS, JS, images, etc.)
  const frontendBuildPath = path.join(__dirname, '../frontend_build');
  
  // Check if frontend_build exists
  if (!fs.existsSync(frontendBuildPath)) {
    console.warn(`⚠️  Frontend build directory not found at: ${frontendBuildPath}`);
    console.warn('   Please build the frontend first: cd frontend && npm run build');
  }

  app.use(express.static(frontendBuildPath, {
    maxAge: '1y', // Cache static assets for 1 year
    etag: true,
  }));

  // Serve frontend index.html for all non-API routes (SPA routing)
  // This must be last to catch all routes that don't match API or static files
  app.get('*', (req: express.Request, res: express.Response) => {
    // Skip API routes (already handled above)
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'Not Found' });
    }
    // Serve index.html for all other routes (SPA fallback)
    const indexPath = path.join(frontendBuildPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send('Frontend not found. Please build the frontend first.');
    }
  });

  // Error handler
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  });

  return app;
};

export default createApp;
