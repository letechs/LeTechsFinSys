import mongoose, { Document, Schema } from 'mongoose';

export type PaymentAttemptStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled';

export interface IPaymentAttempt extends Document {
  userId: mongoose.Types.ObjectId;
  paymentId?: mongoose.Types.ObjectId; // Reference to Payment document
  attemptNumber: number; // Sequential attempt number (1, 2, 3, ...)
  status: PaymentAttemptStatus;
  
  // Payment details
  paymentMethod: string; // 'manual', 'card', 'bank_wire', 'crypto', 'paypal', etc.
  amount: number; // Amount attempted (in cents)
  currency: string;
  
  // Gateway information
  gateway: string; // 'stripe', 'paypal', 'manual', etc.
  gatewayTransactionId?: string; // Transaction ID from gateway
  gatewayErrorCode?: string; // Error code from gateway
  gatewayErrorMessage?: string; // Error message from gateway
  
  // Failure details
  failureReason?: string; // Human-readable failure reason
  failureCode?: string; // Internal failure code
  
  // Retry information
  isRetry: boolean; // Whether this is a retry attempt
  previousAttemptId?: mongoose.Types.ObjectId; // Reference to previous failed attempt
  
  // Metadata
  metadata?: Record<string, any>;
  
  // Timestamps
  initiatedAt: Date; // When attempt was initiated
  completedAt?: Date; // When attempt completed (success or failure)
  
  createdAt: Date;
  updatedAt: Date;
}

const paymentAttemptSchema = new Schema<IPaymentAttempt>(
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
      index: true,
    },
    attemptNumber: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'succeeded', 'failed', 'cancelled'],
      required: true,
      default: 'pending',
      index: true,
    },
    paymentMethod: {
      type: String,
      required: true,
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
    gateway: {
      type: String,
      required: true,
      index: true,
    },
    gatewayTransactionId: {
      type: String,
      index: true,
    },
    gatewayErrorCode: {
      type: String,
    },
    gatewayErrorMessage: {
      type: String,
    },
    failureReason: {
      type: String,
    },
    failureCode: {
      type: String,
    },
    isRetry: {
      type: Boolean,
      default: false,
    },
    previousAttemptId: {
      type: Schema.Types.ObjectId,
      ref: 'PaymentAttempt',
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    initiatedAt: {
      type: Date,
      required: true,
      default: Date.now,
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
paymentAttemptSchema.index({ userId: 1, createdAt: -1 });
paymentAttemptSchema.index({ status: 1, createdAt: -1 });
// Note: paymentId already has index: true in schema definition

export const PaymentAttempt = mongoose.model<IPaymentAttempt>('PaymentAttempt', paymentAttemptSchema);

