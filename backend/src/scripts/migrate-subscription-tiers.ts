/**
 * Migration Script: Add Subscription Tiers to Existing Users
 * 
 * This script updates all existing users to have:
 * - subscriptionTier: 'FULL_ACCESS' (default)
 * - subscriptionExpiry: null (no expiry)
 * 
 * Run this script once after deploying the subscription tier feature.
 * 
 * Usage:
 *   ts-node src/scripts/migrate-subscription-tiers.ts
 *   or
 *   npm run migrate:tiers
 */

import mongoose from 'mongoose';
import { config } from '../config/env';
import { User } from '../models/User';
import { SUBSCRIPTION_TIERS } from '../config/constants';

async function migrateSubscriptionTiers() {
  try {
    console.log('🔄 Starting subscription tier migration...');

    // Connect to database
    await mongoose.connect(config.mongodbUri);
    console.log('✅ Connected to database');

    // Find all users without subscriptionTier
    const usersToUpdate = await User.find({
      $or: [
        { subscriptionTier: { $exists: false } },
        { subscriptionTier: null },
      ],
    });

    console.log(`📊 Found ${usersToUpdate.length} users to update`);

    if (usersToUpdate.length === 0) {
      console.log('✅ No users need updating. Migration complete.');
      await mongoose.disconnect();
      return;
    }

    // Update all users to FULL_ACCESS (default)
    const result = await User.updateMany(
      {
        $or: [
          { subscriptionTier: { $exists: false } },
          { subscriptionTier: null },
        ],
      },
      {
        $set: {
          subscriptionTier: SUBSCRIPTION_TIERS.FULL_ACCESS,
        },
      }
    );

    console.log(`✅ Updated ${result.modifiedCount} users`);
    console.log('✅ Migration complete!');

    // Verify migration
    const usersWithoutTier = await User.countDocuments({
      $or: [
        { subscriptionTier: { $exists: false } },
        { subscriptionTier: null },
      ],
    });

    if (usersWithoutTier === 0) {
      console.log('✅ Verification: All users have subscription tier');
    } else {
      console.log(`⚠️  Warning: ${usersWithoutTier} users still missing subscription tier`);
    }

    await mongoose.disconnect();
    console.log('✅ Database connection closed');
  } catch (error: any) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration if script is executed directly
if (require.main === module) {
  migrateSubscriptionTiers()
    .then(() => {
      console.log('✅ Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration script failed:', error);
      process.exit(1);
    });
}

export { migrateSubscriptionTiers };

