/**
 * Stripe Flow Verification Script
 * Verifies all components of the Stripe integration are correctly set up
 */

require('dotenv').config();
const Stripe = require('stripe');

console.log('='.repeat(60));
console.log('STRIPE FLOW VERIFICATION');
console.log('='.repeat(60));
console.log('');

let allChecksPassed = true;

// 1. Check Environment Variables
console.log('1. Environment Variables:');
console.log('   Checking STRIPE_SECRET_KEY...');
if (!process.env.STRIPE_SECRET_KEY) {
  console.log('   ❌ STRIPE_SECRET_KEY not found');
  allChecksPassed = false;
} else {
  const key = process.env.STRIPE_SECRET_KEY.trim();
  if (key.length < 100) {
    console.log(`   ❌ Key too short: ${key.length} chars`);
    allChecksPassed = false;
  } else if (!key.startsWith('sk_test_') && !key.startsWith('sk_live_')) {
    console.log('   ❌ Invalid key format');
    allChecksPassed = false;
  } else {
    console.log(`   ✅ Key found: ${key.substring(0, 20)}... (${key.length} chars)`);
  }
}

console.log('   Checking STRIPE_WEBHOOK_SECRET...');
if (!process.env.STRIPE_WEBHOOK_SECRET) {
  console.log('   ⚠️  STRIPE_WEBHOOK_SECRET not found (needed for webhooks)');
} else {
  console.log(`   ✅ Webhook secret found: ${process.env.STRIPE_WEBHOOK_SECRET.substring(0, 20)}...`);
}

console.log('   Checking STRIPE_PUBLISHABLE_KEY...');
if (!process.env.STRIPE_PUBLISHABLE_KEY) {
  console.log('   ⚠️  STRIPE_PUBLISHABLE_KEY not found (needed for frontend)');
} else {
  console.log(`   ✅ Publishable key found: ${process.env.STRIPE_PUBLISHABLE_KEY.substring(0, 20)}...`);
}

console.log('');

// 2. Test Stripe API Connection
console.log('2. Stripe API Connection:');
if (process.env.STRIPE_SECRET_KEY) {
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY.trim());
    const balance = await stripe.balance.retrieve();
    console.log('   ✅ Connected to Stripe API');
    console.log(`   ✅ Account balance: ${balance.available[0]?.amount || 0} ${balance.available[0]?.currency || 'usd'}`);
  } catch (error) {
    console.log(`   ❌ Failed to connect: ${error.message}`);
    allChecksPassed = false;
  }
} else {
  console.log('   ⏭️  Skipped (no key)');
}

console.log('');

// 3. Check File Structure
console.log('3. File Structure:');
const fs = require('fs');
const path = require('path');

const requiredFiles = [
  'src/services/payment/stripeService.ts',
  'src/controllers/paymentController.ts',
  'src/routes/payment.routes.ts',
  'src/app.ts',
];

requiredFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    console.log(`   ✅ ${file}`);
  } else {
    console.log(`   ❌ ${file} - NOT FOUND`);
    allChecksPassed = false;
  }
});

console.log('');

// 4. Check Route Registration
console.log('4. Route Registration:');
try {
  const appContent = fs.readFileSync(path.join(__dirname, 'src/app.ts'), 'utf8');
  if (appContent.includes('/api/payment/webhook')) {
    console.log('   ✅ Webhook route registered in app.ts');
  } else {
    console.log('   ❌ Webhook route NOT found in app.ts');
    allChecksPassed = false;
  }

  const routesContent = fs.readFileSync(path.join(__dirname, 'src/routes/index.ts'), 'utf8');
  if (routesContent.includes('/payment')) {
    console.log('   ✅ Payment routes registered in routes/index.ts');
  } else {
    console.log('   ❌ Payment routes NOT found in routes/index.ts');
    allChecksPassed = false;
  }
} catch (error) {
  console.log(`   ❌ Error checking routes: ${error.message}`);
  allChecksPassed = false;
}

console.log('');

// 5. Check Webhook Setup
console.log('5. Webhook Setup:');
try {
  const appContent = fs.readFileSync(path.join(__dirname, 'src/app.ts'), 'utf8');
  if (appContent.includes('express.raw') && appContent.includes('webhook')) {
    console.log('   ✅ Webhook uses raw body parser (required for signature verification)');
  } else {
    console.log('   ⚠️  Webhook may not use raw body parser');
  }

  if (appContent.includes('stripe-signature')) {
    console.log('   ✅ Webhook signature verification implemented');
  } else {
    console.log('   ⚠️  Webhook signature verification may be missing');
  }
} catch (error) {
  console.log(`   ❌ Error checking webhook: ${error.message}`);
}

console.log('');

// 6. Summary
console.log('='.repeat(60));
if (allChecksPassed) {
  console.log('✅ ALL CHECKS PASSED - Stripe flow is correctly set up!');
} else {
  console.log('❌ SOME CHECKS FAILED - Please fix the issues above');
}
console.log('='.repeat(60));


