import mongoose, { Document, Schema } from 'mongoose';

export type PaymentMethodType = 
  | 'manual'
  | 'card'
  | 'bank_wire'
  | 'crypto'
  | 'paypal'
  | 'other';

export type PaymentMethodStatus = 'active' | 'inactive' | 'expired' | 'failed';

export interface IPaymentMethod extends Document {
  userId: mongoose.Types.ObjectId;
  type: PaymentMethodType;
  status: PaymentMethodStatus;
  isDefault: boolean; // Whether this is the default payment method
  
  // Card details (if type is 'card')
  cardDetails?: {
    brand?: string; // 'visa', 'mastercard', 'amex', etc.
    last4?: string; // Last 4 digits
    expMonth?: number;
    expYear?: number;
    holderName?: string;
  };
  
  // Bank details (if type is 'bank_wire')
  bankDetails?: {
    bankName?: string;
    accountNumber?: string; // Last 4 digits only
    routingNumber?: string; // Last 4 digits only
    accountHolderName?: string;
    swiftCode?: string;
    iban?: string; // Masked
  };
  
  // Crypto details (if type is 'crypto')
  cryptoDetails?: {
    currency?: string; // 'BTC', 'ETH', 'USDT', etc.
    walletAddress?: string; // Masked
    network?: string; // 'bitcoin', 'ethereum', etc.
  };
  
  // PayPal details (if type is 'paypal')
  paypalDetails?: {
    email?: string; // Masked
    payerId?: string;
  };
  
  // Gateway information
  gateway: string; // 'stripe', 'paypal', 'manual', etc.
  gatewayPaymentMethodId?: string; // Payment method ID from gateway (e.g., Stripe pm_xxx)
  
  // Metadata
  metadata?: Record<string, any>;
  
  // Timestamps
  addedAt: Date; // When payment method was added
  lastUsedAt?: Date; // When payment method was last used
  expiresAt?: Date; // When payment method expires (for cards)
  
  createdAt: Date;
  updatedAt: Date;
}

const paymentMethodSchema = new Schema<IPaymentMethod>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['manual', 'card', 'bank_wire', 'crypto', 'paypal', 'other'],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'expired', 'failed'],
      required: true,
      default: 'active',
      index: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
      index: true,
    },
    cardDetails: {
      brand: String,
      last4: String,
      expMonth: Number,
      expYear: Number,
      holderName: String,
    },
    bankDetails: {
      bankName: String,
      accountNumber: String,
      routingNumber: String,
      accountHolderName: String,
      swiftCode: String,
      iban: String,
    },
    cryptoDetails: {
      currency: String,
      walletAddress: String,
      network: String,
    },
    paypalDetails: {
      email: String,
      payerId: String,
    },
    gateway: {
      type: String,
      required: true,
      index: true,
    },
    gatewayPaymentMethodId: {
      type: String,
      index: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    addedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    lastUsedAt: {
      type: Date,
    },
    expiresAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
paymentMethodSchema.index({ userId: 1, isDefault: 1 });
paymentMethodSchema.index({ userId: 1, status: 1 });
// Note: gatewayPaymentMethodId already has index: true in schema definition

export const PaymentMethod = mongoose.model<IPaymentMethod>('PaymentMethod', paymentMethodSchema);

