import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcrypt';
import { USER_ROLES, SUBSCRIPTION_TIERS } from '../config/constants';

export interface IUser extends Document {
  email: string;
  password: string;
  name: string;
  role: 'admin' | 'client' | 'viewer';
  isActive: boolean;
  lastLogin?: Date;
  emailVerified?: boolean; // Email verification status
  emailVerifiedAt?: Date; // When email was verified
  // Account lockout for security
  failedLoginAttempts?: number; // Number of consecutive failed login attempts
  accountLockedUntil?: Date; // Account locked until this date (for temporary lockout)
  subscriptionTier?: 'BASIC' | 'EA_LICENSE' | 'FULL_ACCESS';
  subscriptionExpiry?: Date; // Deprecated: Use subscriptionRenewalDate instead
  subscriptionLastUpdated?: Date; // Track when admin updated subscription
  
  // Hybrid Subscription Model (Option D: Unified Renewal Date)
  baseTier?: 'EA_LICENSE' | 'FULL_ACCESS' | null; // Base subscription tier (null if BASIC)
  additionalMasters?: number; // Additional master accounts (add-ons)
  additionalSlaves?: number; // Additional slave accounts (add-ons)
  subscriptionRenewalDate?: Date; // Unified renewal date for all components
  subscriptionStartDate?: Date; // When subscription started (for proration)
  
  // Trial System (3 days free trial)
  trialClaimed?: boolean; // Whether user has claimed free trial
  trialExpiryDate?: Date; // When trial expires
  trialStartDate?: Date; // When trial started
  trialDisabled?: boolean; // Whether trial is disabled by admin (prevents claiming)
  
  // Grace Period (5 days after expiry)
  isExpired?: boolean; // Whether subscription is expired (in grace period)
  gracePeriodEndDate?: Date; // When grace period ends (expiryDate + 5 days)
  
  // Client Discount
  isClient?: boolean; // Whether user is marked as client (for discounts)
  clientDiscountPercentage?: number; // Custom discount % for client (default: 5)
  
  // Special Discount (Promotional/Festival offers)
  specialDiscountPercentage?: number; // Special promotional discount % (default: 0)
  specialDiscountExpiryDate?: Date; // When special discount expires
  specialDiscountDescription?: string; // Description of special discount (e.g., "Festival Offer 2025")
  
  // Stripe Integration Fields
  stripeCustomerId?: string; // Stripe customer ID (cus_xxx)
  stripeSubscriptionId?: string; // Stripe subscription ID (sub_xxx)
  stripePaymentMethodId?: string; // Last used payment method ID (pm_xxx)
  stripeCustomerEmail?: string; // Email used in Stripe (may differ from user email)
  
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      enum: Object.values(USER_ROLES),
      default: USER_ROLES.CLIENT,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
    },
    emailVerified: {
      type: Boolean,
      default: false,
      index: true,
    },
    emailVerifiedAt: {
      type: Date,
    },
    // Account lockout fields
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    accountLockedUntil: {
      type: Date,
      index: true,
    },
    subscriptionTier: {
      type: String,
      enum: Object.values(SUBSCRIPTION_TIERS),
      default: SUBSCRIPTION_TIERS.BASIC,
      index: true,
    },
    subscriptionExpiry: {
      type: Date,
      index: true,
    },
    subscriptionLastUpdated: {
      type: Date,
      index: true,
    },
    // Hybrid Subscription Model Fields
    baseTier: {
      type: String,
      enum: [SUBSCRIPTION_TIERS.EA_LICENSE, SUBSCRIPTION_TIERS.FULL_ACCESS],
      default: null,
      index: true,
    },
    additionalMasters: {
      type: Number,
      default: 0,
      min: 0,
    },
    additionalSlaves: {
      type: Number,
      default: 0,
      min: 0,
    },
    subscriptionRenewalDate: {
      type: Date,
      index: true,
    },
    subscriptionStartDate: {
      type: Date,
    },
    // Trial System Fields
    trialClaimed: {
      type: Boolean,
      default: false,
      index: true,
    },
    trialExpiryDate: {
      type: Date,
      index: true,
    },
    trialStartDate: {
      type: Date,
    },
    trialDisabled: {
      type: Boolean,
      default: false,
      index: true,
    },
    // Grace Period Fields
    isExpired: {
      type: Boolean,
      default: false,
      index: true,
    },
    gracePeriodEndDate: {
      type: Date,
      index: true,
    },
    // Client Discount Fields
    isClient: {
      type: Boolean,
      default: false,
      index: true,
    },
    clientDiscountPercentage: {
      type: Number,
      default: 5,
      min: 0,
      max: 100,
    },
    // Special Discount Fields
    specialDiscountPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    specialDiscountExpiryDate: {
      type: Date,
      index: true,
    },
    specialDiscountDescription: {
      type: String,
      default: null,
    },
    // Stripe Integration Fields
    stripeCustomerId: {
      type: String,
      index: true,
      unique: true,
      sparse: true, // Allows multiple null values
    },
    stripeSubscriptionId: {
      type: String,
      index: true,
      unique: true,
      sparse: true, // Allows multiple null values
    },
    stripePaymentMethodId: {
      type: String,
      index: true,
    },
    stripeCustomerEmail: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
(userSchema as any).pre('save', async function (this: IUser) {
  // Skip if password is not modified
  if (!this.isModified('password')) {
    return;
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  } catch (error: any) {
    throw error;
  }
});

// Compare password method
userSchema.methods.comparePassword = async function (this: IUser, candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

// Remove password from JSON output
userSchema.methods.toJSON = function (this: IUser) {
  const userObject = this.toObject();
  delete userObject.password;
  return userObject;
};

export const User = mongoose.model<IUser>('User', userSchema);

