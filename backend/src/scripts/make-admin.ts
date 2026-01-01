/**
 * Script to make a user an admin
 * 
 * Usage:
 *   ts-node src/scripts/make-admin.ts hello@gmail.com
 */

import mongoose from 'mongoose';
import { config } from '../config/env';
import { User } from '../models/User';
import { logger } from '../utils/logger';

async function makeAdmin(email: string) {
  try {
    console.log('🔧 Making user admin...');
    console.log(`Email: ${email}`);
    console.log('');

    // Connect to database
    await mongoose.connect(config.mongodbUri);
    console.log('✅ Connected to database');
    console.log('');

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      console.log('❌ User not found with email:', email);
      console.log('');
      console.log('Available users:');
      const allUsers = await User.find({}).select('email name role').lean();
      if (allUsers.length === 0) {
        console.log('  No users found in database');
      } else {
        console.log(`  Found ${allUsers.length} user(s):`);
        allUsers.forEach((u, index) => {
          console.log(`  ${index + 1}. Email: ${u.email}, Name: ${u.name}, Role: ${u.role}`);
        });
      }
      await mongoose.disconnect();
      return;
    }

    // Update user role to admin
    user.role = 'admin';
    await user.save();

    console.log('✅ User updated to admin!');
    console.log('');
    console.log('User Details:');
    console.log('  Email:', user.email);
    console.log('  Name:', user.name);
    console.log('  Role:', user.role);
    console.log('  User ID:', user._id);
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
  console.log('Usage: ts-node src/scripts/make-admin.ts <email>');
  console.log('');
  console.log('Example:');
  console.log('  ts-node src/scripts/make-admin.ts hello@gmail.com');
  process.exit(1);
}

makeAdmin(email)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });

