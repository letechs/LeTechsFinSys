/**
 * Migration Script: Convert USD Customers to AED
 * 
 * This script helps migrate existing customers from USD to AED currency.
 * 
 * WARNING: This will cancel existing USD subscriptions and allow creating new AED ones.
 * Use with caution - this may interrupt service for customers.
 * 
 * Usage:
 *   npx ts-node scripts/migrate-usd-to-aed.ts [--dry-run] [--customer-id=CUS_XXX]
 */

import mongoose from 'mongoose';
import Stripe from 'stripe';
import { config } from '../src/config/env';
import { User } from '../src/models/User';
import { logger } from '../src/utils/logger';

// Initialize Stripe
const stripe = new Stripe(config.stripe.secretKey, {
  apiVersion: '2024-06-20',
});

interface MigrationResult {
  customerId: string;
  email: string;
  userId: string;
  hadSubscriptions: boolean;
  subscriptionsCancelled: string[];
  canMigrate: boolean;
  error?: string;
}

async function checkCustomerCurrency(customerId: string): Promise<'usd' | 'aed' | 'none'> {
  try {
    // Check active subscriptions
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 10,
    });

    if (subscriptions.data.length > 0) {
      const currency = (subscriptions.data[0].items.data[0]?.price?.currency || 'usd').toLowerCase();
      return currency === 'usd' ? 'usd' : 'aed';
    }

    // Check all subscriptions (including past)
    const allSubscriptions = await stripe.subscriptions.list({
      customer: customerId,
      limit: 10,
    });

    if (allSubscriptions.data.length > 0) {
      const currency = (allSubscriptions.data[0].items.data[0]?.price?.currency || 'usd').toLowerCase();
      return currency === 'usd' ? 'usd' : 'aed';
    }

    // Check invoices
    const invoices = await stripe.invoices.list({
      customer: customerId,
      limit: 10,
    });

    if (invoices.data.length > 0) {
      const currency = (invoices.data[0].currency || 'usd').toLowerCase();
      return currency === 'usd' ? 'usd' : 'aed';
    }

    return 'none';
  } catch (error: any) {
    logger.error(`Error checking currency for ${customerId}: ${error.message}`);
    return 'none';
  }
}

async function cancelCustomerSubscriptions(customerId: string): Promise<string[]> {
  const cancelledIds: string[] = [];
  
  try {
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 100,
    });

    for (const subscription of subscriptions.data) {
      try {
        await stripe.subscriptions.cancel(subscription.id);
        cancelledIds.push(subscription.id);
        logger.info(`Cancelled subscription ${subscription.id} for customer ${customerId}`);
      } catch (error: any) {
        logger.error(`Failed to cancel subscription ${subscription.id}: ${error.message}`);
      }
    }
  } catch (error: any) {
    logger.error(`Error listing subscriptions for ${customerId}: ${error.message}`);
  }

  return cancelledIds;
}

async function migrateCustomer(
  user: any,
  dryRun: boolean = false
): Promise<MigrationResult> {
  const result: MigrationResult = {
    customerId: user.stripeCustomerId || '',
    email: user.email,
    userId: user._id.toString(),
    hadSubscriptions: false,
    subscriptionsCancelled: [],
    canMigrate: false,
  };

  if (!user.stripeCustomerId) {
    result.canMigrate = true; // New customer, can use AED
    return result;
  }

  try {
    const currency = await checkCustomerCurrency(user.stripeCustomerId);
    
    if (currency === 'usd') {
      result.hadSubscriptions = true;
      
      if (dryRun) {
        result.canMigrate = true;
        logger.info(`[DRY RUN] Would cancel USD subscriptions for ${user.email}`);
      } else {
        // Cancel existing USD subscriptions
        result.subscriptionsCancelled = await cancelCustomerSubscriptions(user.stripeCustomerId);
        result.canMigrate = true;
        logger.info(`Migrated ${user.email} - cancelled ${result.subscriptionsCancelled.length} subscriptions`);
      }
    } else if (currency === 'aed') {
      result.canMigrate = true; // Already using AED
    } else {
      result.canMigrate = true; // No subscriptions, can use AED
    }
  } catch (error: any) {
    result.error = error.message;
    logger.error(`Error migrating ${user.email}: ${error.message}`);
  }

  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const customerIdArg = args.find(arg => arg.startsWith('--customer-id='));
  const customerId = customerIdArg ? customerIdArg.split('=')[1] : null;

  if (dryRun) {
    logger.info('🔍 DRY RUN MODE - No changes will be made');
  }

  // Connect to MongoDB
  const mongoUri = config.mongoUri;
  if (!mongoUri) {
    logger.error('MongoDB URI not configured');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  logger.info('Connected to MongoDB');

  try {
    let users: any[];

    if (customerId) {
      // Migrate specific customer
      const user = await User.findOne({ stripeCustomerId: customerId });
      if (!user) {
        logger.error(`User not found with customer ID: ${customerId}`);
        process.exit(1);
      }
      users = [user];
    } else {
      // Find all users with Stripe customer IDs
      users = await User.find({ 
        stripeCustomerId: { $exists: true, $ne: null } 
      });
    }

    logger.info(`Found ${users.length} users with Stripe customer IDs`);

    const results: MigrationResult[] = [];
    let canMigrateCount = 0;
    let needsMigrationCount = 0;

    for (const user of users) {
      const result = await migrateCustomer(user, dryRun);
      results.push(result);

      if (result.canMigrate) {
        canMigrateCount++;
      }
      if (result.hadSubscriptions && result.canMigrate) {
        needsMigrationCount++;
      }

      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Print summary
    console.log('\n=== MIGRATION SUMMARY ===');
    console.log(`Total users checked: ${results.length}`);
    console.log(`Can migrate to AED: ${canMigrateCount}`);
    console.log(`Needed migration (had USD subscriptions): ${needsMigrationCount}`);
    console.log(`Already using AED or no subscriptions: ${canMigrateCount - needsMigrationCount}`);

    if (needsMigrationCount > 0) {
      console.log('\n=== USERS MIGRATED ===');
      results
        .filter(r => r.hadSubscriptions && r.canMigrate)
        .forEach(r => {
          console.log(`- ${r.email} (${r.customerId})`);
          if (r.subscriptionsCancelled.length > 0) {
            console.log(`  Cancelled ${r.subscriptionsCancelled.length} subscriptions`);
          }
        });
    }

    if (dryRun) {
      console.log('\n⚠️  This was a DRY RUN. Run without --dry-run to apply changes.');
    }

  } catch (error: any) {
    logger.error(`Migration error: ${error.message}`);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
  }
}

main().catch(console.error);

