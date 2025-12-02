import { ClobClient, Chain } from '@polymarket/clob-client';
import { Wallet } from '@ethersproject/wallet';
import { logger } from './logger';

/**
 * Polymarket API credentials interface
 */
export interface PolymarketCredentials {
  key: string;
  secret: string;
  passphrase: string;
}

/**
 * Cache for API credentials to avoid repeated API calls
 */
let credentialsCache: PolymarketCredentials | null = null;
let credentialsPromise: Promise<PolymarketCredentials> | null = null;

/**
 * Get Polymarket API credentials from wallet private key
 * 
 * This function derives or creates API credentials using the wallet's private key.
 * The credentials are cached after the first call to avoid repeated API requests.
 * 
 * @param privateKey - Wallet private key
 * @returns Promise resolving to API credentials (key, secret, passphrase)
 * @throws Error if private key is invalid or API key generation fails
 */
export async function getPolymarketCredentials(
  privateKey: string
): Promise<PolymarketCredentials> {
  // Return cached credentials if available
  if (credentialsCache) {
    logger.debug('✅ Using cached Polymarket API credentials');
    return credentialsCache;
  }

  // If a request is already in progress, wait for it
  if (credentialsPromise) {
    logger.debug('⏳ Waiting for existing API credentials request...');
    return credentialsPromise;
  }

  // Validate private key
  if (!privateKey) {
    throw new Error('Wallet private key is required to generate API credentials');
  }

  // Create new promise for credentials
  credentialsPromise = (async () => {
    try {
      logger.info('🔑 Deriving Polymarket API credentials from wallet private key...');

      // Create wallet from private key
      const wallet = new Wallet(privateKey);
      logger.debug(`📝 Wallet Address: ${wallet.address}`);

      // Create temporary ClobClient to generate API keys
      const tempClient = new ClobClient(
        'https://clob.polymarket.com',
        Chain.POLYGON,
        wallet
      );

      // Create or derive API key
      // This will create a new key if none exists, or derive existing one
      const creds = await tempClient.createOrDeriveApiKey();

      if (!creds.key || !creds.secret || !creds.passphrase) {
        throw new Error('Failed to generate API credentials: missing key, secret, or passphrase');
      }

      // Cache the credentials
      credentialsCache = {
        key: creds.key,
        secret: creds.secret,
        passphrase: creds.passphrase,
      };

      logger.info('✅ Polymarket API credentials derived successfully');
      logger.debug(`   API Key: ${creds.key.substring(0, 12)}...`);

      return credentialsCache;
    } catch (error: any) {
      // Clear the promise on error so it can be retried
      credentialsPromise = null;
      
      logger.error('❌ Failed to derive Polymarket API credentials:', error.message);
      
      if (error.message.includes('Unauthorized') || error.message.includes('401')) {
        throw new Error(
          'Failed to generate API credentials. Make sure your wallet has been used on Polymarket before. ' +
          'You may need to sign in to Polymarket at least once with this wallet.'
        );
      }
      
      throw new Error(`Failed to derive API credentials: ${error.message}`);
    }
  })();

  return credentialsPromise;
}

/**
 * Clear the cached credentials
 * Useful for testing or when switching wallets
 */
export function clearCredentialsCache(): void {
  credentialsCache = null;
  credentialsPromise = null;
  logger.debug('🗑️ Cleared Polymarket API credentials cache');
}

