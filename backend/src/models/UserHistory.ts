import mongoose, { Document, Schema } from 'mongoose';

export type HistoryActionType = 
  | 'subscription_tier_changed'
  | 'subscription_expiry_updated'
  | 'trial_claimed'
  | 'trial_reset'
  | 'trial_disabled'
  | 'trial_expired'
  | 'grace_period_started'
  | 'grace_period_ended'
  | 'moved_to_basic'
  | 'account_added'
  | 'account_updated'
  | 'account_deleted'
  | 'copy_link_created'
  | 'copy_link_updated'
  | 'copy_link_deleted'
  | 'addon_added'
  | 'addon_removed'
  | 'client_status_changed'
  | 'client_discount_updated'
  | 'special_discount_added'
  | 'special_discount_removed'
  | 'user_created'
  | 'user_activated'
  | 'user_deactivated'
  | 'user_edited'
  | 'user_deleted'
  | 'user_blocked'
  | 'user_unblocked'
  | 'config_updated'
  | 'password_changed'
  | 'profile_updated'
  | 'checkout_session_created'
  | 'subscription_updated'
  | 'subscription_renewed'
  | 'subscription_cancelled'
  | 'payment_initiated'
  | 'payment_succeeded'
  | 'payment_failed'
  | 'payment_refunded'
  | 'invoice_created'
  | 'invoice_sent'
  | 'invoice_paid'
  | 'invoice_overdue'
  | 'payment_method_added'
  | 'payment_method_updated'
  | 'payment_method_removed';

export interface IUserHistory extends Document {
  userId: mongoose.Types.ObjectId;
  actionType: HistoryActionType;
  description: string;
  oldValue?: any; // Previous value (JSON)
  newValue?: any; // New value (JSON)
  performedBy?: mongoose.Types.ObjectId; // Admin who made the change (if applicable)
  performedByEmail?: string; // Admin email for quick reference
  metadata?: Record<string, any>; // Additional context
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

const userHistorySchema = new Schema<IUserHistory>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    actionType: {
      type: String,
      required: true,
      enum: [
        'subscription_tier_changed',
        'subscription_expiry_updated',
        'trial_claimed',
        'trial_reset',
        'trial_disabled',
        'trial_expired',
        'grace_period_started',
        'grace_period_ended',
        'moved_to_basic',
        'account_added',
        'account_updated',
        'account_deleted',
        'copy_link_created',
        'copy_link_updated',
        'copy_link_deleted',
        'addon_added',
        'addon_removed',
        'client_status_changed',
        'client_discount_updated',
        'special_discount_added',
        'special_discount_removed',
        'user_created',
        'user_activated',
        'user_deactivated',
        'user_edited',
        'user_deleted',
        'user_blocked',
        'user_unblocked',
        'password_changed',
        'profile_updated',
        'checkout_session_created',
        'subscription_updated',
        'subscription_renewed',
        'subscription_cancelled',
      ],
      index: true,
    },
    description: {
      type: String,
      required: true,
    },
    oldValue: {
      type: Schema.Types.Mixed,
    },
    newValue: {
      type: Schema.Types.Mixed,
    },
    performedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    performedByEmail: {
      type: String,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
  }
);

// Index for efficient queries
userHistorySchema.index({ userId: 1, createdAt: -1 });
userHistorySchema.index({ actionType: 1, createdAt: -1 });
userHistorySchema.index({ performedBy: 1, createdAt: -1 });

// TTL Index: Automatically delete records older than 1 year (365 days)
// This prevents database from growing indefinitely on free tier
// Adjust retention period as needed (in seconds: 365 * 24 * 60 * 60 = 31536000)
userHistorySchema.index(
  { createdAt: 1 },
  { 
    expireAfterSeconds: 31536000, // 1 year in seconds
    name: 'history_ttl_index'
  }
);

export const UserHistory = mongoose.model<IUserHistory>('UserHistory', userHistorySchema);

