/**
 * Stripe API Key Test Script
 * Tests Stripe connection with various key cleaning methods
 */

require('dotenv').config();
const Stripe = require('stripe');

const rawKey = process.env.STRIPE_SECRET_KEY || '';

console.log('='.repeat(60));
console.log('STRIPE API KEY DIAGNOSTIC TEST');
console.log('='.repeat(60));
console.log('');

// Test 1: Raw key
console.log('Test 1: Raw key from env');
console.log('  Length:', rawKey.length);
console.log('  Starts with:', rawKey.substring(0, 10));
console.log('  Ends with:', rawKey.substring(rawKey.length - 10));
console.log('  Has control chars:', /[\u0000-\u001F\u007F]/.test(rawKey));
console.log('  Has CR/LF:', /\r|\n/.test(rawKey));
console.log('');

// Test 2: Trimmed key
const trimmedKey = rawKey.trim();
console.log('Test 2: Trimmed key');
console.log('  Length:', trimmedKey.length);
console.log('');

// Test 3: Remove CR/LF
const noCrLf = rawKey.replace(/\r?\n/g, '').trim();
console.log('Test 3: Remove CR/LF');
console.log('  Length:', noCrLf.length);
console.log('');

// Test 4: Remove ALL control characters
const cleanKey = rawKey.replace(/[\u0000-\u001F\u007F]/g, '').trim();
console.log('Test 4: Remove ALL control chars');
console.log('  Length:', cleanKey.length);
console.log('  Key:', cleanKey.substring(0, 20) + '...' + cleanKey.substring(cleanKey.length - 10));
console.log('');

// Test 5: Try with Stripe SDK
console.log('Test 5: Testing with Stripe SDK');
console.log('');

const testKey = cleanKey;
const stripe = new Stripe(testKey);

stripe.account.retrieve()
  .then(account => {
    console.log('✅ SUCCESS!');
    console.log('  Account ID:', account.id);
    console.log('  Charges enabled:', account.charges_enabled);
    console.log('  Payouts enabled:', account.payouts_enabled);
    console.log('');
    console.log('🎉 Your Stripe key is VALID and working!');
  })
  .catch(error => {
    console.log('❌ FAILED');
    console.log('  Error type:', error.type);
    console.log('  Error message:', error.message);
    console.log('  Status code:', error.statusCode);
    console.log('');
    console.log('🔍 Diagnostic info:');
    console.log('  Key format correct:', /^sk_(test|live)_/.test(testKey));
    console.log('  Key length:', testKey.length);
    console.log('  Expected length: ~107');
    console.log('');
    if (error.message.includes('Invalid API Key')) {
      console.log('💡 Suggestions:');
      console.log('  1. Regenerate the key in Stripe Dashboard');
      console.log('  2. Check if key is from correct Stripe account');
      console.log('  3. Verify you are using Test Mode key in Test Mode');
      console.log('  4. Check Stripe Dashboard for account restrictions');
    }
  });


