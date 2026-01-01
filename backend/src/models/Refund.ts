import mongoose, { Document, Schema } from 'mongoose';

export type RefundStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled';
export type RefundReason = 
  | 'duplicate'
  | 'fraudulent'
  | 'requested_by_customer'
  | 'subscription_cancelled'
  | 'product_unsatisfactory'
  | 'other';

export interface IRefund extends Document {
  userId: mongoose.Types.ObjectId;
  paymentId: mongoose.Types.ObjectId; // Reference to original Payment
  invoiceId?: mongoose.Types.ObjectId; // Reference to Invoice if applicable
  
  // Refund details
  amount: number; // Refund amount in cents
  currency: string;
  status: RefundStatus;
  reason: RefundReason;
  reasonDescription?: string; // Additional details about refund reason
  
  // Gateway information
  gateway: string; // 'stripe', 'paypal', 'manual', etc.
  gatewayRefundId?: string; // Refund ID from gateway
  gatewayTransactionId?: string; // Transaction ID from gateway
  
  // Financial details
  feeRefunded?: number; // Gateway fees refunded (if applicable)
  netAmount?: number; // Net refund amount after fees
  
  // Metadata
  metadata?: Record<string, any>;
  
  // Admin tracking
  processedBy?: mongoose.Types.ObjectId; // Admin who processed refund
  notes?: string; // Internal notes
  
  // Timestamps
  requestedAt: Date; // When refund was requested
  processedAt?: Date; // When refund was processed
  completedAt?: Date; // When refund completed
  
  createdAt: Date;
  updatedAt: Date;
}

const refundSchema = new Schema<IRefund>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    paymentId: {
      type: Schema.Types.ObjectId,
      ref: 'Payment',
      required: true,
      index: true,
    },
    invoiceId: {
      type: Schema.Types.ObjectId,
      ref: 'Invoice',
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      required: true,
      default: 'usd',
      uppercase: true,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'succeeded', 'failed', 'cancelled'],
      required: true,
      default: 'pending',
      index: true,
    },
    reason: {
      type: String,
      enum: ['duplicate', 'fraudulent', 'requested_by_customer', 'subscription_cancelled', 'product_unsatisfactory', 'other'],
      required: true,
    },
    reasonDescription: {
      type: String,
    },
    gateway: {
      type: String,
      required: true,
      index: true,
    },
    gatewayRefundId: {
      type: String,
      index: true,
    },
    gatewayTransactionId: {
      type: String,
    },
    feeRefunded: {
      type: Number,
      default: 0,
      min: 0,
    },
    netAmount: {
      type: Number,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    processedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    notes: {
      type: String,
    },
    requestedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    processedAt: {
      type: Date,
    },
    completedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
refundSchema.index({ userId: 1, createdAt: -1 });
// Note: paymentId already has index: true in schema definition
refundSchema.index({ status: 1, createdAt: -1 });

export const Refund = mongoose.model<IRefund>('Refund', refundSchema);

