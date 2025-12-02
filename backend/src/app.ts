import express, { Express } from 'express';
import path from 'path';
import routes from './routes';

const createApp = (): Express => {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // API Routes
  app.use('/', routes);

  // Serve static files from frontend_build
  const frontendBuildPath = path.join(__dirname, '../frontend_build');
  app.use(express.static(frontendBuildPath));

  // Serve frontend for all non-API routes (SPA routing)
  app.get('*', (req: express.Request, res: express.Response) => {
    // Don't serve index.html for API routes
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'Not Found' });
    }
    res.sendFile(path.join(frontendBuildPath, 'index.html'));
  });

  // Error handler
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  });

  return app;
};

export default createApp;
