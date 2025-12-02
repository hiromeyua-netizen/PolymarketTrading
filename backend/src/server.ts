import createApp from './app';
import config from './config';
import { Server } from 'http';
import { TradingBot } from './services/TradingBot';
import { MarketInterval } from './services/MarketMonitor';
import { CoinSymbol } from './services/CoinMonitor';
import { connectDatabase, disconnectDatabase } from './services/database';
import { logger } from './utils/logger';

const startServer = async () => {
  try {
    // Connect to MongoDB first
    await connectDatabase();

    const app = createApp();

    const server: Server = app.listen(config.port, () => {
      logger.info('🚀 Polymarket Trading Bot Backend starting...');
      logger.info(`✅ Server is listening on http://localhost:${config.port}`);
    });

    const tradingBot = new TradingBot(CoinSymbol.BTC, MarketInterval.FIFTEEN_MINUTES);
    await tradingBot.start();

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM signal received: closing HTTP server');
    server.close(async () => {
      await disconnectDatabase();
      logger.info('HTTP server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT signal received: closing HTTP server');
    server.close(async () => {
      await disconnectDatabase();
      logger.info('HTTP server closed');
      process.exit(0);
    });
  });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

export default startServer;

