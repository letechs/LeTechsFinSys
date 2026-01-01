/**
 * Script to find user by email and get their ID
 * 
 * Usage:
 *   ts-node src/scripts/find-user.ts hello@gmail.com
 */

import mongoose from 'mongoose';
import { config } from '../config/env';
import { User } from '../models/User';
import { MT5Account } from '../models/MT5Account';

async function findUser(email: string) {
  try {
    console.log('🔍 Searching for user...');
    console.log(`Email: ${email}`);
    console.log('');

    // Connect to database
    await mongoose.connect(config.mongodbUri);
    console.log('✅ Connected to database');
    console.log('');

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase().trim() }).lean();

    if (!user) {
      console.log('❌ User not found with email:', email);
      console.log('');
      console.log('Available users in database:');
      const allUsers = await User.find({}).select('email name _id subscriptionTier subscriptionExpiry').lean();
      if (allUsers.length === 0) {
        console.log('  No users found in database');
      } else {
        console.log(`  Found ${allUsers.length} user(s):`);
        allUsers.forEach((u, index) => {
          console.log(`  ${index + 1}. Email: ${u.email}`);
          console.log(`     Name: ${u.name || 'N/A'}`);
          console.log(`     ID: ${u._id}`);
          console.log(`     Tier: ${u.subscriptionTier || 'FULL_ACCESS (default)'}`);
          console.log(`     Expiry: ${u.subscriptionExpiry || 'No expiry set'}`);
          console.log('');
        });
      }
      await mongoose.disconnect();
      return;
    }

    // User found
    console.log('✅ User found!');
    console.log('');
    console.log('User Details:');
    console.log('  Email:', user.email);
    console.log('  Name:', user.name);
    console.log('  User ID:', user._id);
    console.log('  Subscription Tier:', user.subscriptionTier || 'FULL_ACCESS (default)');
    console.log('  Subscription Expiry:', user.subscriptionExpiry || 'No expiry set');
    console.log('  Is Active:', user.isActive);
    console.log('');

    // Find MT5 accounts for this user
    const mt5Accounts = await MT5Account.find({
      userId: user._id,
    })
      .select('loginId accountName accountType status')
      .lean();

    console.log('MT5 Accounts:');
    if (mt5Accounts.length === 0) {
      console.log('  No MT5 accounts found for this user');
    } else {
      console.log(`  Found ${mt5Accounts.length} account(s):`);
      mt5Accounts.forEach((acc, index) => {
        console.log(`  ${index + 1}. Login ID: ${acc.loginId}`);
        console.log(`     Account Name: ${acc.accountName || 'N/A'}`);
        console.log(`     Type: ${acc.accountType}`);
        console.log(`     Status: ${acc.status}`);
        console.log('');
      });
    }

    console.log('');
    console.log('========================================');
    console.log('📋 Test Request for Postman:');
    console.log('========================================');
    console.log('');
    console.log('POST http://localhost:5000/api/license/validate');
    console.log('Content-Type: application/json');
    console.log('');
    console.log('Body:');
    const accountNumbers = mt5Accounts.map(acc => acc.loginId).filter(Boolean);
    if (accountNumbers.length === 0) {
      console.log(JSON.stringify({
        userId: user._id.toString(),
        mt5Accounts: ["12345"]  // Placeholder - replace with real account number
      }, null, 2));
      console.log('');
      console.log('⚠️  Note: Replace "12345" with a real MT5 account number');
    } else {
      console.log(JSON.stringify({
        userId: user._id.toString(),
        mt5Accounts: accountNumbers
      }, null, 2));
    }
    console.log('');

    await mongoose.disconnect();
    console.log('✅ Database connection closed');
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Get email from command line argument
const email = process.argv[2];

if (!email) {
  console.log('Usage: ts-node src/scripts/find-user.ts <email>');
  console.log('');
  console.log('Example:');
  console.log('  ts-node src/scripts/find-user.ts hello@gmail.com');
  process.exit(1);
}

findUser(email)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });

