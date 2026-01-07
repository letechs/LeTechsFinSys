import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../src/models/User';
import { Subscription } from '../src/models/Subscription';
import Stripe from 'stripe';
import { config } from '../src/config/env';
import * as readline from 'readline';

dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query: string): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      rl.question(query, resolve);
    } catch (error) {
      // If readline fails (non-interactive), default to 'no' for safety
      console.log('⚠️  Non-interactive mode detected. Use --yes flag to auto-confirm.');
      reject(new Error('Non-interactive mode'));
    }
  });
}

async function cleanupTestStripeIds() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongodbUri);
    console.log('✅ Connected to MongoDB\n');

    // Initialize Stripe with current key (check env var first, then config)
    const stripeKey = process.env.STRIPE_SECRET_KEY || config.stripe.secretKey;
    
    if (!stripeKey) {
      console.error('❌ STRIPE_SECRET_KEY not set');
      console.error('   Set it as: STRIPE_SECRET_KEY=sk_live_... npx ts-node scripts/cleanup-test-stripe-ids.ts');
      process.exit(1);
    }

    const stripe = new Stripe(stripeKey);

    // Check if using live or test key
    const isLiveKey = stripeKey.startsWith('sk_live_');
    
    if (!isLiveKey) {
      console.error('❌ ERROR: This script requires LIVE Stripe keys!');
      console.error('   Current key appears to be a TEST key.');
      console.error('   Please set STRIPE_SECRET_KEY to a live key (sk_live_...)');
      await mongoose.disconnect();
      process.exit(1);
    }

    console.log('📊 Using LIVE mode Stripe key\n');
    console.log('⚠️  This script will clear TEST mode Stripe IDs from the database.');
    console.log('   Users will need to re-subscribe to create new LIVE mode customers.\n');

    // Check for --yes flag for non-interactive mode
    const autoConfirm = process.argv.includes('--yes');
    
    if (!autoConfirm) {
      // Get confirmation
      try {
        const answer = await question('Do you want to continue? (yes/no): ');
        if (answer.toLowerCase() !== 'yes') {
          console.log('❌ Operation cancelled.');
          await mongoose.disconnect();
          rl.close();
          process.exit(0);
        }
      } catch (error) {
        console.log('❌ Interactive mode not available. Use --yes flag to auto-confirm.');
        await mongoose.disconnect();
        rl.close();
        process.exit(1);
      }
    } else {
      console.log('✅ Auto-confirm mode enabled (--yes flag)\n');
    }

    // Get all users with Stripe customer IDs
    const usersWithStripe = await User.find({
      stripeCustomerId: { $exists: true, $ne: null },
    }).select('email stripeCustomerId stripeSubscriptionId _id');

    console.log(`\n📋 Found ${usersWithStripe.length} users with Stripe customer IDs\n`);

    const testModeUserIds: string[] = [];
    const liveModeUserIds: string[] = [];
    const notFoundUserIds: string[] = [];
    const usersToClean: Array<{ userId: string; email: string; customerId: string; subscriptionId?: string }> = [];

    // Check each customer ID
    console.log('🔍 Checking customer IDs...\n');
    for (const user of usersWithStripe) {
      if (!user.stripeCustomerId) continue;

      try {
        const customer = await stripe.customers.retrieve(user.stripeCustomerId);
        // If we can retrieve it with live key, it's a live customer
        liveModeUserIds.push(user._id.toString());
        console.log(`✅ LIVE: ${user.email} - ${user.stripeCustomerId}`);
      } catch (error: any) {
        if (error.type === 'StripeInvalidRequestError') {
          if (error.message.includes('test mode')) {
            // Customer exists in test mode - needs cleanup
            testModeUserIds.push(user._id.toString());
            usersToClean.push({
              userId: user._id.toString(),
              email: user.email,
              customerId: user.stripeCustomerId,
              subscriptionId: user.stripeSubscriptionId || undefined,
            });
            console.log(`⚠️  TEST (will clean): ${user.email} - ${user.stripeCustomerId}`);
          } else {
            // Customer not found at all
            notFoundUserIds.push(user._id.toString());
            usersToClean.push({
              userId: user._id.toString(),
              email: user.email,
              customerId: user.stripeCustomerId,
              subscriptionId: user.stripeSubscriptionId || undefined,
            });
            console.log(`❌ NOT FOUND (will clean): ${user.email} - ${user.stripeCustomerId}`);
          }
        } else {
          console.log(`❌ ERROR checking ${user.email}: ${error.message}`);
        }
      }
    }

    // Check subscriptions
    const subscriptionsWithStripe = await Subscription.find({
      stripeSubscriptionId: { $exists: true, $ne: null },
    }).select('userId stripeSubscriptionId stripeCustomerId _id');

    console.log(`\n📋 Found ${subscriptionsWithStripe.length} subscriptions with Stripe IDs\n`);

    const testModeSubIds: string[] = [];
    const subscriptionsToClean: Array<{ subId: string; userId: string; subscriptionId: string }> = [];

    for (const sub of subscriptionsWithStripe) {
      if (!sub.stripeSubscriptionId) continue;

      try {
        const subscription = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
        // If we can retrieve it, it's live
        console.log(`✅ LIVE SUB: ${sub.stripeSubscriptionId}`);
      } catch (error: any) {
        if (error.type === 'StripeInvalidRequestError') {
          if (error.message.includes('test mode')) {
            testModeSubIds.push(sub._id.toString());
            subscriptionsToClean.push({
              subId: sub._id.toString(),
              userId: sub.userId.toString(),
              subscriptionId: sub.stripeSubscriptionId,
            });
            console.log(`⚠️  TEST SUB (will clean): ${sub.stripeSubscriptionId}`);
          } else {
            subscriptionsToClean.push({
              subId: sub._id.toString(),
              userId: sub.userId.toString(),
              subscriptionId: sub.stripeSubscriptionId,
            });
            console.log(`❌ NOT FOUND SUB (will clean): ${sub.stripeSubscriptionId}`);
          }
        }
      }
    }

    // Summary before cleanup
    console.log('\n' + '='.repeat(60));
    console.log('📊 CLEANUP SUMMARY');
    console.log('='.repeat(60));
    console.log(`\n👥 USERS:`);
    console.log(`   ✅ Live mode customers (keep): ${liveModeUserIds.length}`);
    console.log(`   ⚠️  Test mode customers (clean): ${testModeUserIds.length}`);
    console.log(`   ❌ Not found customers (clean): ${notFoundUserIds.length}`);
    console.log(`   📝 Total users to clean: ${usersToClean.length}`);

    console.log(`\n💳 SUBSCRIPTIONS:`);
    console.log(`   ⚠️  Test/Not found subscriptions (clean): ${subscriptionsToClean.length}`);

    if (usersToClean.length === 0 && subscriptionsToClean.length === 0) {
      console.log('\n✅ No cleanup needed! All Stripe IDs are valid for LIVE mode.');
      await mongoose.disconnect();
      rl.close();
      process.exit(0);
    }

    // Final confirmation
    if (!autoConfirm) {
      console.log('\n⚠️  WARNING: This will clear Stripe IDs from the database.');
      console.log('   Users will need to re-subscribe to create new LIVE mode customers.');
      try {
        const finalAnswer = await question('\nProceed with cleanup? (yes/no): ');
        if (finalAnswer.toLowerCase() !== 'yes') {
          console.log('❌ Operation cancelled.');
          await mongoose.disconnect();
          rl.close();
          process.exit(0);
        }
      } catch (error) {
        console.log('❌ Interactive mode not available. Use --yes flag to auto-confirm.');
        await mongoose.disconnect();
        rl.close();
        process.exit(1);
      }
    }

    // Perform cleanup
    console.log('\n🧹 Starting cleanup...\n');

    let cleanedUsers = 0;
    let cleanedSubscriptions = 0;

    // Clean user Stripe IDs
    for (const user of usersToClean) {
      try {
        await User.findByIdAndUpdate(user.userId, {
          $unset: {
            stripeCustomerId: '',
            stripeSubscriptionId: '',
            stripePaymentMethodId: '',
            stripeCustomerEmail: '',
          },
        });
        cleanedUsers++;
        console.log(`✅ Cleaned: ${user.email}`);
      } catch (error: any) {
        console.error(`❌ Error cleaning ${user.email}: ${error.message}`);
      }
    }

    // Clean subscription Stripe IDs
    for (const sub of subscriptionsToClean) {
      try {
        await Subscription.findByIdAndUpdate(sub.subId, {
          $unset: {
            stripeSubscriptionId: '',
            stripeCustomerId: '',
          },
        });
        cleanedSubscriptions++;
        console.log(`✅ Cleaned subscription: ${sub.subscriptionId}`);
      } catch (error: any) {
        console.error(`❌ Error cleaning subscription ${sub.subscriptionId}: ${error.message}`);
      }
    }

    // Final summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ CLEANUP COMPLETE');
    console.log('='.repeat(60));
    console.log(`\n👥 Users cleaned: ${cleanedUsers}`);
    console.log(`💳 Subscriptions cleaned: ${cleanedSubscriptions}`);
    console.log(`\n✅ All test mode Stripe IDs have been removed.`);
    console.log(`   Users can now subscribe again to create LIVE mode customers.`);

    await mongoose.disconnect();
    rl.close();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    rl.close();
    process.exit(1);
  }
}

cleanupTestStripeIds();

