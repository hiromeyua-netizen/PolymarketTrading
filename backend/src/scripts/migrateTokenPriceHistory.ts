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

    // Count total documents to update (for progress tracking)
    const totalCount = await TokenPriceHistory.countDocuments(query);

    if (totalCount === 0) {
      logger.info('✅ No documents need migration. All documents already have token, eventType, and outcome fields.');
      await disconnectDatabase();
      return;
    }

    logger.info(`📊 Found ${totalCount} documents to update`);

    let updatedCount = 0;
    let errorCount = 0;
    let processedCount = 0;

    // Process in batches using cursor to avoid loading all documents into memory
    const batchSize = 1000;
    const cursor = TokenPriceHistory.find(query).lean().cursor({ batchSize: batchSize });

    let batch: any[] = [];
    let batchNumber = 0;

    for await (const doc of cursor) {
      // Determine outcome based on price comparison
      const outcome: 'UP' | 'DOWN' = doc.upTokenPrice > doc.downTokenPrice ? 'UP' : 'DOWN';

      batch.push({
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
      });

      // Process batch when it reaches batchSize
      if (batch.length >= batchSize) {
        batchNumber++;
        try {
          const result = await TokenPriceHistory.bulkWrite(batch);
          updatedCount += result.modifiedCount;
          processedCount += batch.length;
          logger.info(`✅ Updated batch ${batchNumber}: ${result.modifiedCount} documents (${processedCount}/${totalCount} processed)`);
        } catch (error) {
          errorCount += batch.length;
          processedCount += batch.length;
          logger.error(`❌ Error updating batch ${batchNumber}:`, error);
        }
        // Clear batch for next iteration
        batch = [];
      }
    }

    // Process remaining documents in the last batch
    if (batch.length > 0) {
      batchNumber++;
      try {
        const result = await TokenPriceHistory.bulkWrite(batch);
        updatedCount += result.modifiedCount;
        processedCount += batch.length;
        logger.info(`✅ Updated batch ${batchNumber}: ${result.modifiedCount} documents (${processedCount}/${totalCount} processed)`);
      } catch (error) {
        errorCount += batch.length;
        processedCount += batch.length;
        logger.error(`❌ Error updating batch ${batchNumber}:`, error);
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

