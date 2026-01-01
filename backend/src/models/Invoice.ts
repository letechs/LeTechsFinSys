import mongoose, { Document, Schema } from 'mongoose';

export type InvoiceStatus = 
  | 'draft'
  | 'sent'
  | 'paid'
  | 'overdue'
  | 'cancelled'
  | 'void';

export interface IInvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number; // Price per unit in cents
  amount: number; // Total amount in cents
  type?: 'subscription' | 'addon' | 'discount' | 'tax' | 'fee' | 'other';
  metadata?: Record<string, any>;
}

export interface IInvoice extends Document {
  userId: mongoose.Types.ObjectId;
  invoiceNumber: string; // Unique invoice number (e.g., INV-2025-001)
  status: InvoiceStatus;
  
  // Dates
  issueDate: Date; // When invoice was issued
  dueDate: Date; // When payment is due
  paidDate?: Date; // When invoice was paid
  
  // Financial details
  subtotal: number; // Subtotal before discounts/taxes (in cents)
  discountAmount: number; // Total discount amount (in cents)
  taxAmount: number; // Total tax amount (in cents)
  total: number; // Total amount due (in cents)
  amountPaid: number; // Amount paid so far (in cents)
  amountDue: number; // Amount still due (in cents)
  
  currency: string; // ISO currency code
  
  // Line items
  lineItems: IInvoiceLineItem[];
  
  // Payment references
  paymentIds: mongoose.Types.ObjectId[]; // References to Payment documents
  
  // Subscription details
  subscriptionId?: string; // Stripe subscription ID or internal reference
  subscriptionPeriod?: {
    start: Date;
    end: Date;
  };
  
  // Billing information
  billingAddress?: {
    name?: string;
    email?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
  
  // Tax information
  taxRate?: number; // Tax rate percentage
  taxId?: string; // Tax ID number
  
  // PDF and email
  pdfPath?: string; // Path to generated PDF
  pdfGeneratedAt?: Date; // When PDF was generated
  sentAt?: Date; // When invoice was sent to customer
  emailSent?: boolean; // Whether email was sent
  
  // Notes
  notes?: string; // Internal notes
  customerNotes?: string; // Notes visible to customer
  
  // Metadata
  metadata?: Record<string, any>;
  
  // Admin tracking
  createdBy?: mongoose.Types.ObjectId; // Admin who created invoice
  
  createdAt: Date;
  updatedAt: Date;
}

const invoiceLineItemSchema = new Schema<IInvoiceLineItem>(
  {
    description: {
      type: String,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      default: 1,
      min: 0,
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    type: {
      type: String,
      enum: ['subscription', 'addon', 'discount', 'tax', 'fee', 'other'],
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { _id: false }
);

const invoiceSchema = new Schema<IInvoice>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['draft', 'sent', 'paid', 'overdue', 'cancelled', 'void'],
      required: true,
      default: 'draft',
      index: true,
    },
    issueDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    dueDate: {
      type: Date,
      required: true,
    },
    paidDate: {
      type: Date,
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    discountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    taxAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    total: {
      type: Number,
      required: true,
      min: 0,
    },
    amountPaid: {
      type: Number,
      default: 0,
      min: 0,
    },
    amountDue: {
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
    lineItems: {
      type: [invoiceLineItemSchema],
      required: true,
      default: [],
    },
    paymentIds: [{
      type: Schema.Types.ObjectId,
      ref: 'Payment',
    }],
    subscriptionId: {
      type: String,
    },
    subscriptionPeriod: {
      start: Date,
      end: Date,
    },
    billingAddress: {
      name: String,
      email: String,
      address: String,
      city: String,
      state: String,
      zip: String,
      country: String,
    },
    taxRate: {
      type: Number,
      min: 0,
      max: 100,
    },
    taxId: {
      type: String,
    },
    pdfPath: {
      type: String,
    },
    pdfGeneratedAt: {
      type: Date,
    },
    sentAt: {
      type: Date,
    },
    emailSent: {
      type: Boolean,
      default: false,
    },
    notes: {
      type: String,
    },
    customerNotes: {
      type: String,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
invoiceSchema.index({ userId: 1, createdAt: -1 });
invoiceSchema.index({ status: 1, dueDate: 1 });
// Note: invoiceNumber already has index: true and unique: true in schema definition

export const Invoice = mongoose.model<IInvoice>('Invoice', invoiceSchema);

