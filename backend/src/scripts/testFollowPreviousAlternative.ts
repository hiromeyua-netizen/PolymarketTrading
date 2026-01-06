import dotenv from 'dotenv';
import TokenPriceHistory, { Outcome } from '../models/TokenPriceHistory';
import { connectDatabase, disconnectDatabase } from '../services/database';
import { logger } from '../utils/logger';

// Load environment variables
dotenv.config();

type CoinSymbol = 'BTC' | 'ETH' | 'SOL' | 'XRP';

interface SlugOutcome {
  slug: string;
  outcome: Outcome;
  timestamp: Date;
}

interface TestResult {
  coin: CoinSymbol;
  totalSlugs: number;
  totalBets: number;
  totalWins: number;
  totalLosses: number;
  winRate: number;
  maxConsecutiveFailures: number;
  failureStreaks: number[]; // Array of all consecutive failure streaks
  slugDetails: Array<{
    slug: string;
    bet: Outcome | null; // What we bet on (null for first slug)
    actualOutcome: Outcome;
    result: 'win' | 'loss' | 'first';
  }>;
}

/**
 * Test script to simulate "follow the previous alternative" strategy
 * 
 * Strategy:
 * - Round 1: Check outcome
 * - Round 2: Bet on the OPPOSITE of Round 1's outcome (if Round 1 was UP, bet DOWN)
 * - Round 3: Bet on the OPPOSITE of Round 2's outcome (if Round 2 was DOWN, bet UP)
 * - Continue betting on the alternative side of the previous outcome
 * 
 * Goal: Find maximum consecutive failure streak
 */
async function testFollowPreviousAlternative() {
  try {
    logger.info('🚀 Starting Follow Previous Alternative Strategy Test...');

    // Connect to database
    await connectDatabase();

    const coins: CoinSymbol[] = ['BTC', 'ETH', 'SOL', 'XRP'];
    const eventType = '15min';

    const results: TestResult[] = [];

    for (const coin of coins) {
      logger.info(`\n📊 Testing ${coin} (${eventType} markets)...`);

      // Get all distinct slugs for this coin and event type
      const slugs = await TokenPriceHistory.distinct('slug', {
        token: coin,
        eventType: eventType,
      });

      if (slugs.length === 0) {
        logger.info(`   ⚠️  No slugs found for ${coin}`);
        continue;
      }

      logger.info(`   Found ${slugs.length} slugs for ${coin}`);

      // Get final outcome for each slug (outcome at the last timestamp)
      const slugOutcomes: SlugOutcome[] = [];

      for (const slug of slugs) {
        // Get the last record for this slug to determine final outcome
        const lastRecord = await TokenPriceHistory.findOne(
          { slug, token: coin, eventType: eventType },
          {},
          { sort: { timestamp: -1 } }
        );

        if (lastRecord && lastRecord.outcome) {
          slugOutcomes.push({
            slug,
            outcome: lastRecord.outcome as Outcome,
            timestamp: lastRecord.timestamp,
          });
        }
      }

      if (slugOutcomes.length === 0) {
        logger.info(`   ⚠️  No valid outcomes found for ${coin}`);
        continue;
      }

      // Sort by timestamp (earliest first) to process chronologically
      slugOutcomes.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      logger.info(`   Processing ${slugOutcomes.length} slugs chronologically...`);

      // Simulate the strategy
      let previousOutcome: Outcome | null = null;
      let currentFailureStreak = 0;
      let maxConsecutiveFailures = 0;
      const failureStreaks: number[] = [];
      let totalBets = 0;
      let totalWins = 0;
      let totalLosses = 0;

      const slugDetails: Array<{
        slug: string;
        bet: Outcome | null;
        actualOutcome: Outcome;
        result: 'win' | 'loss' | 'first';
      }> = [];

      for (let i = 0; i < slugOutcomes.length; i++) {
        const slugOutcome = slugOutcomes[i];
        const actualOutcome = slugOutcome.outcome;

        if (i === 0) {
          // First slug: just record the outcome, no bet
          slugDetails.push({
            slug: slugOutcome.slug,
            bet: null,
            actualOutcome,
            result: 'first',
          });
          previousOutcome = actualOutcome;
        } else {
          // Bet on the OPPOSITE of the previous outcome
          const bet: Outcome = previousOutcome === 'UP' ? 'DOWN' : 'UP';
          totalBets++;

          if (bet === actualOutcome) {
            // Win: bet matched the outcome
            totalWins++;
            // Reset failure streak
            if (currentFailureStreak > 0) {
              failureStreaks.push(currentFailureStreak);
            }
            currentFailureStreak = 0;

            slugDetails.push({
              slug: slugOutcome.slug,
              bet,
              actualOutcome,
              result: 'win',
            });
          } else {
            // Loss: bet did not match the outcome
            totalLosses++;
            currentFailureStreak++;
            maxConsecutiveFailures = Math.max(maxConsecutiveFailures, currentFailureStreak);

            slugDetails.push({
              slug: slugOutcome.slug,
              bet,
              actualOutcome,
              result: 'loss',
            });
          }

          // Update previous outcome for next round
          previousOutcome = actualOutcome;
        }
      }

      // Record final failure streak if it's still active
      if (currentFailureStreak > 0) {
        failureStreaks.push(currentFailureStreak);
      }

      const winRate = totalBets > 0 ? (totalWins / totalBets) * 100 : 0;

      const result: TestResult = {
        coin,
        totalSlugs: slugOutcomes.length,
        totalBets,
        totalWins,
        totalLosses,
        winRate,
        maxConsecutiveFailures,
        failureStreaks,
        slugDetails,
      };

      results.push(result);

      // Log summary for this coin
      logger.info(`\n   📈 ${coin} Results:`);
      logger.info(`      Total Slugs: ${result.totalSlugs}`);
      logger.info(`      Total Bets: ${result.totalBets}`);
      logger.info(`      Wins: ${result.totalWins}`);
      logger.info(`      Losses: ${result.totalLosses}`);
      logger.info(`      Win Rate: ${result.winRate.toFixed(2)}%`);
      logger.info(`      Max Consecutive Failures: ${result.maxConsecutiveFailures}`);
      if (result.failureStreaks.length > 0) {
        logger.info(`      Total Failure Streaks: ${result.failureStreaks.length}`);
        logger.info(`      Failure Streak Lengths: ${result.failureStreaks.join(', ')}`);
      }
    }

    // Overall summary
    logger.info('\n\n' + '='.repeat(60));
    logger.info('📊 OVERALL SUMMARY');
    logger.info('='.repeat(60));

    for (const result of results) {
      logger.info(`\n${result.coin}:`);
      logger.info(`  Max Consecutive Failures: ${result.maxConsecutiveFailures}`);
      logger.info(`  Win Rate: ${result.winRate.toFixed(2)}%`);
      logger.info(`  Total Bets: ${result.totalBets}`);
    }

    // Find overall maximum
    const overallMax = Math.max(...results.map(r => r.maxConsecutiveFailures));
    logger.info(`\n🏆 Overall Maximum Consecutive Failures: ${overallMax}`);

    // Disconnect from database
    await disconnectDatabase();
    process.exit(0);

  } catch (error) {
    logger.error('❌ Test failed:', error);
    await disconnectDatabase();
    process.exit(1);
  }
}

// Run test if script is executed directly
if (require.main === module) {
  testFollowPreviousAlternative();
}

export default testFollowPreviousAlternative;

