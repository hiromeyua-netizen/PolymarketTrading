import { Config } from '../types/config';
import dotenv from 'dotenv';

dotenv.config();

const config: Config = {
  port: parseInt(process.env.PORT || '3000', 10),
  wallet: {
    privateKey: process.env.WALLET_PRIVATE_KEY || '',
    funderAddress: process.env.WALLET_FUNDER_ADDRESS || '',
  },
};

export default config;

