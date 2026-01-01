/**
 * Script to change user role (admin/client/viewer)
 * 
 * Usage:
 *   ts-node src/scripts/change-admin-role.ts <email> <role>
 *   role can be: admin, client, or viewer
 * 
 * Examples:
 *   ts-node src/scripts/change-admin-role.ts hello@gmail.com client
 *   ts-node src/scripts/change-admin-role.ts alechsltd@gmail.com admin
 */

import mongoose from 'mongoose';
import { config } from '../config/env';
import { User } from '../models/User';
import { USER_ROLES } from '../config/constants';

async function changeUserRole(email: string, role: 'admin' | 'client' | 'viewer') {
  try {
    console.log('🔧 Changing user role...');
    console.log(`Email: ${email}`);
    console.log(`New Role: ${role}`);
    console.log('');

    // Validate role
    if (!Object.values(USER_ROLES).includes(role as any)) {
      console.log('❌ Invalid role. Must be one of: admin, client, viewer');
      process.exit(1);
    }

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

    const oldRole = user.role;

    // Update user role
    user.role = role;
    await user.save();

    console.log('✅ User role updated!');
    console.log('');
    console.log('User Details:');
    console.log('  Email:', user.email);
    console.log('  Name:', user.name);
    console.log('  Old Role:', oldRole);
    console.log('  New Role:', user.role);
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

// Get email and role from command line arguments
const email = process.argv[2];
const role = process.argv[3] as 'admin' | 'client' | 'viewer';

if (!email || !role) {
  console.log('Usage: ts-node src/scripts/change-admin-role.ts <email> <role>');
  console.log('');
  console.log('Roles: admin, client, viewer');
  console.log('');
  console.log('Examples:');
  console.log('  ts-node src/scripts/change-admin-role.ts hello@gmail.com client');
  console.log('  ts-node src/scripts/change-admin-role.ts alechsltd@gmail.com admin');
  process.exit(1);
}

changeUserRole(email, role)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });

