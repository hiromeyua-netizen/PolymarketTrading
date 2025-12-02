import createApp from './app';
import config from './config';
import { Server } from 'http';
import { TradingBot } from './services/TradingBot';
import { MarketInterval } from './services/MarketMonitor';
import { CoinSymbol } from './services/CoinMonitor';

const startServer = async () => {
  const app = createApp();

  const server: Server = app.listen(config.port, () => {
    console.log('🚀 Polymarket Trading Bot Backend starting...');
    console.log(`✅ Server is listening on http://localhost:${config.port}`);
  });

  const tradingBot = new TradingBot(CoinSymbol.BTC, MarketInterval.FIFTEEN_MINUTES);
  await tradingBot.start();

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('SIGINT signal received: closing HTTP server');
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
  });
};

export default startServer;

