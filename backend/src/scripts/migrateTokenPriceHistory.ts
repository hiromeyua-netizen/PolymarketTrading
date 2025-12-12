import dotenv from 'dotenv';
import TokenPriceHistory from '../models/TokenPriceHistory';
import { connectDatabase, disconnectDatabase } from '../services/database';
import { logger } from '../utils/logger';

// Load environment variables
dotenv.config();

/**
 * Migration script to add missing token, eventType, and outcome fields
 * to existing TokenPriceHistory documents
 */
async function migrateTokenPriceHistory() {
  try {
    logger.info('🚀 Starting TokenPriceHistory migration...');

    // Connect to database
    await connectDatabase();

    // Find all documents that are missing token, eventType, or outcome
    const query = {
      $or: [
        { token: { $exists: false } },
        { token: null },
        { eventType: { $exists: false } },
        { eventType: null },
        { outcome: { $exists: false } },
        { outcome: null },
      ]
    };

    const documentsToUpdate = await TokenPriceHistory.find(query);
    const totalCount = documentsToUpdate.length;

    if (totalCount === 0) {
      logger.info('✅ No documents need migration. All documents already have token, eventType, and outcome fields.');
      await disconnectDatabase();
      return;
    }

    logger.info(`📊 Found ${totalCount} documents to update`);

    let updatedCount = 0;
    let errorCount = 0;

    // Process in batches to avoid memory issues
    const batchSize = 1000;
    for (let i = 0; i < documentsToUpdate.length; i += batchSize) {
      const batch = documentsToUpdate.slice(i, i + batchSize);
      
      const bulkOps = batch.map(doc => {
        // Determine outcome based on price comparison
        const outcome: 'UP' | 'DOWN' = doc.upTokenPrice > doc.downTokenPrice ? 'UP' : 'DOWN';

        return {
          updateOne: {
            filter: { _id: doc._id },
            update: {
              $set: {
                token: 'BTC',
                eventType: '15min',
                outcome: outcome,
              }
            }
          }
        };
      });

      try {
        const result = await TokenPriceHistory.bulkWrite(bulkOps);
        updatedCount += result.modifiedCount;
        logger.info(`✅ Updated batch ${Math.floor(i / batchSize) + 1}: ${result.modifiedCount} documents`);
      } catch (error) {
        errorCount += batch.length;
        logger.error(`❌ Error updating batch ${Math.floor(i / batchSize) + 1}:`, error);
      }
    }

    logger.info('📈 Migration Summary:');
    logger.info(`   Total documents found: ${totalCount}`);
    logger.info(`   Successfully updated: ${updatedCount}`);
    logger.info(`   Errors: ${errorCount}`);

    if (errorCount === 0) {
      logger.info('✅ Migration completed successfully!');
    } else {
      logger.warn(`⚠️  Migration completed with ${errorCount} errors`);
    }

    // Disconnect from database
    await disconnectDatabase();
    process.exit(0);

  } catch (error) {
    logger.error('❌ Migration failed:', error);
    await disconnectDatabase();
    process.exit(1);
  }
}

// Run migration if script is executed directly
if (require.main === module) {
  migrateTokenPriceHistory();
}

export default migrateTokenPriceHistory;

