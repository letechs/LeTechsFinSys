import mongoose, { Document, Schema } from 'mongoose';
import { SUBSCRIPTION_STATUS, SUBSCRIPTION_PLANS } from '../config/constants';

export interface ISubscription extends Document {
  userId: mongoose.Types.ObjectId;
  planType: 'basic' | 'pro' | 'enterprise';
  billingCycle: 'monthly' | 'yearly';
  status: 'active' | 'expired' | 'cancelled' | 'trial';
  stripeSubscriptionId?: string;
  stripeCustomerId?: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  trialEndsAt?: Date;
  maxAccounts: number;
  features: {
    copyTrading: boolean;
    remoteControl: boolean;
    templates: boolean;
    rulesEngine: boolean;
    multiMaster: boolean;
    apiAccess: boolean;
  };
  cancelledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const subscriptionSchema = new Schema<ISubscription>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    planType: {
      type: String,
      enum: Object.values(SUBSCRIPTION_PLANS),
      required: true,
    },
    billingCycle: {
      type: String,
      enum: ['monthly', 'yearly'],
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(SUBSCRIPTION_STATUS),
      default: SUBSCRIPTION_STATUS.TRIAL,
      index: true,
    },
    stripeSubscriptionId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    stripeCustomerId: {
      type: String,
      index: true,
    },
    currentPeriodStart: {
      type: Date,
      required: true,
    },
    currentPeriodEnd: {
      type: Date,
      required: true,
      index: true,
    },
    trialEndsAt: {
      type: Date,
    },
    maxAccounts: {
      type: Number,
      required: true,
      default: 1,
    },
    features: {
      copyTrading: {
        type: Boolean,
        default: false,
      },
      remoteControl: {
        type: Boolean,
        default: false,
      },
      templates: {
        type: Boolean,
        default: false,
      },
      rulesEngine: {
        type: Boolean,
        default: false,
      },
      multiMaster: {
        type: Boolean,
        default: false,
      },
      apiAccess: {
        type: Boolean,
        default: false,
      },
    },
    cancelledAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Index for finding active subscriptions
subscriptionSchema.index({ userId: 1, status: 1, currentPeriodEnd: 1 });

export const Subscription = mongoose.model<ISubscription>('Subscription', subscriptionSchema);

