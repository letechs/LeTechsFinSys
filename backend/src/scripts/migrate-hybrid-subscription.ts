/**
 * Migration Script: Hybrid Subscription Model
 * 
 * This script migrates existing users to the hybrid subscription model:
 * - Sets baseTier from subscriptionTier
 * - Initializes additionalMasters and additionalSlaves to 0
 * - Sets subscriptionRenewalDate from subscriptionExpiry (or creates default)
 * - Sets subscriptionStartDate if not set
 * 
 * Run with: npx ts-node src/scripts/migrate-hybrid-subscription.ts
 */

import mongoose from 'mongoose';
import { config } from '../config/env';
import { User } from '../models/User';
import { SUBSCRIPTION_TIERS } from '../config/constants';

async function migrateHybridSubscription() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongoUri);
    console.log('✅ Connected to MongoDB');

    // Find all users
    const users = await User.find({});
    console.log(`📊 Found ${users.length} users to migrate`);

    let migrated = 0;
    let skipped = 0;

    for (const user of users) {
      try {
        // Skip if already migrated (has baseTier and subscriptionRenewalDate)
        if (user.baseTier && user.subscriptionRenewalDate) {
          console.log(`⏭️  Skipping user ${user.email} - already migrated`);
          skipped++;
          continue;
        }

        // Set baseTier from subscriptionTier (or default to EA_LICENSE)
        if (!user.baseTier) {
          user.baseTier = (user.subscriptionTier as 'EA_LICENSE' | 'FULL_ACCESS') || SUBSCRIPTION_TIERS.EA_LICENSE;
        }

        // Initialize add-ons to 0 if not set
        if (user.additionalMasters === undefined) {
          user.additionalMasters = 0;
        }
        if (user.additionalSlaves === undefined) {
          user.additionalSlaves = 0;
        }

        // Set subscriptionRenewalDate from subscriptionExpiry (or create default)
        if (!user.subscriptionRenewalDate) {
          if (user.subscriptionExpiry) {
            user.subscriptionRenewalDate = user.subscriptionExpiry;
          } else {
            // Default to 30 days from now
            const now = new Date();
            user.subscriptionRenewalDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
            console.log(`📅 Set default renewal date for ${user.email}: ${user.subscriptionRenewalDate.toISOString()}`);
          }
        }

        // Set subscriptionStartDate if not set
        if (!user.subscriptionStartDate) {
          user.subscriptionStartDate = user.createdAt || new Date();
        }

        // Update subscriptionLastUpdated
        user.subscriptionLastUpdated = new Date();

        await user.save();
        migrated++;

        console.log(`✅ Migrated user ${user.email}:`, {
          baseTier: user.baseTier,
          additionalMasters: user.additionalMasters,
          additionalSlaves: user.additionalSlaves,
          renewalDate: user.subscriptionRenewalDate.toISOString(),
        });
      } catch (error: any) {
        console.error(`❌ Error migrating user ${user.email}:`, error.message);
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`   ✅ Migrated: ${migrated}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   📝 Total: ${users.length}`);

    // Close connection
    await mongoose.connection.close();
    console.log('✅ Migration completed');
  } catch (error: any) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrateHybridSubscription();

