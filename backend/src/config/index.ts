import { Config } from '../types/config';
import dotenv from 'dotenv';

dotenv.config();

const config: Config = {
  port: parseInt(process.env.PORT || '3000', 10),
  wallet: {
    privateKey: process.env.WALLET_PRIVATE_KEY || '',
    funderAddress: process.env.WALLET_FUNDER_ADDRESS || '',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
  },
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/polytradingbot',
  },
};

export default config;

