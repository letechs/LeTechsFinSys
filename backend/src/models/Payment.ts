import mongoose, { Document, Schema } from 'mongoose';

export type PaymentMethodType = 
  | 'manual'
  | 'card'
  | 'bank_wire'
  | 'crypto'
  | 'paypal'
  | 'other';

export type PaymentStatus = 
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'refunded'
  | 'partially_refunded'
  | 'disputed'
  | 'cancelled';

export interface IPayment extends Document {
  userId: mongoose.Types.ObjectId;
  invoiceId?: mongoose.Types.ObjectId; // Link to invoice if applicable
  paymentMethod: PaymentMethodType;
  paymentMethodId?: string; // Reference to PaymentMethod document or gateway ID
  amount: number; // Amount in cents (for Stripe) or smallest currency unit
  currency: string; // ISO currency code (USD, EUR, etc.)
  status: PaymentStatus;
  
  // Gateway information
  gateway: string; // 'stripe', 'paypal', 'manual', 'bank_wire', 'crypto', etc.
  gatewayTransactionId?: string; // Transaction ID from payment gateway
  gatewayPaymentIntentId?: string; // Stripe payment intent ID
  gatewayChargeId?: string; // Stripe charge ID
  
  // Financial details
  amountAfterDiscount?: number; // Amount after discounts
  discountAmount?: number; // Discount applied
  taxAmount?: number; // Tax amount
  feeAmount?: number; // Gateway fees
  netAmount?: number; // Net amount after fees
  
  // Subscription/Invoice details
  subscriptionId?: string; // Stripe subscription ID or internal subscription reference
  invoiceNumber?: string; // Invoice number if linked
  
  // Failure information
  failureReason?: string; // Why payment failed
  failureCode?: string; // Error code from gateway
  
  // Metadata
  description?: string; // Payment description
  metadata?: Record<string, any>; // Additional metadata
  
  // Timestamps
  initiatedAt: Date; // When payment was initiated
  processedAt?: Date; // When payment was processed
  failedAt?: Date; // When payment failed
  refundedAt?: Date; // When payment was refunded
  
  // Admin tracking
  createdBy?: mongoose.Types.ObjectId; // Admin who created manual payment
  notes?: string; // Admin notes
  
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    invoiceId: {
      type: Schema.Types.ObjectId,
      ref: 'Invoice',
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ['manual', 'card', 'bank_wire', 'crypto', 'paypal', 'other'],
      required: true,
    },
    paymentMethodId: {
      type: String,
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
      enum: ['pending', 'processing', 'succeeded', 'failed', 'refunded', 'partially_refunded', 'disputed', 'cancelled'],
      required: true,
      default: 'pending',
      index: true,
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
    gatewayPaymentIntentId: {
      type: String,
      index: true,
    },
    gatewayChargeId: {
      type: String,
    },
    amountAfterDiscount: {
      type: Number,
    },
    discountAmount: {
      type: Number,
      default: 0,
    },
    taxAmount: {
      type: Number,
      default: 0,
    },
    feeAmount: {
      type: Number,
      default: 0,
    },
    netAmount: {
      type: Number,
    },
    subscriptionId: {
      type: String,
    },
    invoiceNumber: {
      type: String,
      index: true,
    },
    failureReason: {
      type: String,
    },
    failureCode: {
      type: String,
    },
    description: {
      type: String,
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
    processedAt: {
      type: Date,
    },
    failedAt: {
      type: Date,
    },
    refundedAt: {
      type: Date,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    notes: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
paymentSchema.index({ userId: 1, createdAt: -1 });
paymentSchema.index({ status: 1, createdAt: -1 });
// Note: gatewayTransactionId and invoiceNumber already have index: true in schema definition

export const Payment = mongoose.model<IPayment>('Payment', paymentSchema);

