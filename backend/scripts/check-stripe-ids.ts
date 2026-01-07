import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../src/models/User';
import { Subscription } from '../src/models/Subscription';
import Stripe from 'stripe';
import { config } from '../src/config/env';

dotenv.config();

async function checkStripeIds() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongodbUri);
    console.log('✅ Connected to MongoDB');

    // Initialize Stripe with current (live) key
    if (!config.stripe.secretKey) {
      console.error('❌ STRIPE_SECRET_KEY not set');
      process.exit(1);
    }

    const stripe = new Stripe(config.stripe.secretKey);

    // Check if using live or test key
    const isLiveKey = config.stripe.secretKey.startsWith('sk_live_');
    console.log(`\n📊 Using ${isLiveKey ? 'LIVE' : 'TEST'} mode Stripe key\n`);

    // Get all users with Stripe customer IDs
    const usersWithStripe = await User.find({
      stripeCustomerId: { $exists: true, $ne: null },
    }).select('email stripeCustomerId stripeSubscriptionId');

    console.log(`\n📋 Found ${usersWithStripe.length} users with Stripe customer IDs\n`);

    let testModeCustomers = 0;
    let liveModeCustomers = 0;
    let notFoundCustomers = 0;
    let errorCustomers = 0;
    const testModeUserIds: string[] = [];
    const notFoundUserIds: string[] = [];

    // Check each customer ID
    for (const user of usersWithStripe) {
      if (!user.stripeCustomerId) continue;

      try {
        const customer = await stripe.customers.retrieve(user.stripeCustomerId);
        
        // If we can retrieve it, it exists in the current mode
        if (isLiveKey) {
          liveModeCustomers++;
        } else {
          testModeCustomers++;
        }
      } catch (error: any) {
        if (error.type === 'StripeInvalidRequestError') {
          if (error.message.includes('test mode') && isLiveKey) {
            // Customer exists in test mode but we're using live key
            testModeCustomers++;
            testModeUserIds.push(user._id.toString());
            console.log(`⚠️  TEST MODE: ${user.email} - ${user.stripeCustomerId}`);
          } else if (error.message.includes('live mode') && !isLiveKey) {
            // Customer exists in live mode but we're using test key
            liveModeCustomers++;
            console.log(`⚠️  LIVE MODE: ${user.email} - ${user.stripeCustomerId}`);
          } else {
            // Customer not found at all
            notFoundCustomers++;
            notFoundUserIds.push(user._id.toString());
            console.log(`❌ NOT FOUND: ${user.email} - ${user.stripeCustomerId}`);
          }
        } else {
          errorCustomers++;
          console.log(`❌ ERROR: ${user.email} - ${error.message}`);
        }
      }
    }

    // Get subscriptions with Stripe IDs
    const subscriptionsWithStripe = await Subscription.find({
      stripeSubscriptionId: { $exists: true, $ne: null },
    }).select('userId stripeSubscriptionId stripeCustomerId');

    console.log(`\n📋 Found ${subscriptionsWithStripe.length} subscriptions with Stripe subscription IDs\n`);

    let testModeSubscriptions = 0;
    let liveModeSubscriptions = 0;
    let notFoundSubscriptions = 0;

    // Check each subscription ID
    for (const sub of subscriptionsWithStripe) {
      if (!sub.stripeSubscriptionId) continue;

      try {
        const subscription = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
        
        if (isLiveKey) {
          liveModeSubscriptions++;
        } else {
          testModeSubscriptions++;
        }
      } catch (error: any) {
        if (error.type === 'StripeInvalidRequestError') {
          if (error.message.includes('test mode') && isLiveKey) {
            testModeSubscriptions++;
            console.log(`⚠️  TEST MODE SUB: ${sub.stripeSubscriptionId}`);
          } else if (error.message.includes('live mode') && !isLiveKey) {
            liveModeSubscriptions++;
            console.log(`⚠️  LIVE MODE SUB: ${sub.stripeSubscriptionId}`);
          } else {
            notFoundSubscriptions++;
            console.log(`❌ NOT FOUND SUB: ${sub.stripeSubscriptionId}`);
          }
        }
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`\n👥 USERS:`);
    console.log(`   Total users with Stripe IDs: ${usersWithStripe.length}`);
    if (isLiveKey) {
      console.log(`   ✅ Live mode customers: ${liveModeCustomers}`);
      console.log(`   ⚠️  Test mode customers (MISMATCH): ${testModeCustomers}`);
    } else {
      console.log(`   ✅ Test mode customers: ${testModeCustomers}`);
      console.log(`   ⚠️  Live mode customers (MISMATCH): ${liveModeCustomers}`);
    }
    console.log(`   ❌ Not found: ${notFoundCustomers}`);
    console.log(`   ❌ Errors: ${errorCustomers}`);

    console.log(`\n💳 SUBSCRIPTIONS:`);
    console.log(`   Total subscriptions with Stripe IDs: ${subscriptionsWithStripe.length}`);
    if (isLiveKey) {
      console.log(`   ✅ Live mode subscriptions: ${liveModeSubscriptions}`);
      console.log(`   ⚠️  Test mode subscriptions (MISMATCH): ${testModeSubscriptions}`);
    } else {
      console.log(`   ✅ Test mode subscriptions: ${testModeSubscriptions}`);
      console.log(`   ⚠️  Live mode subscriptions (MISMATCH): ${liveModeSubscriptions}`);
    }
    console.log(`   ❌ Not found: ${notFoundSubscriptions}`);

    if (testModeUserIds.length > 0) {
      console.log(`\n⚠️  Users with TEST MODE customer IDs (need migration):`);
      testModeUserIds.forEach(id => console.log(`   - ${id}`));
    }

    if (notFoundUserIds.length > 0) {
      console.log(`\n❌ Users with NOT FOUND customer IDs:`);
      notFoundUserIds.forEach(id => console.log(`   - ${id}`));
    }

    console.log('\n' + '='.repeat(60));

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkStripeIds();

