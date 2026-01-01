import mongoose, { Document, Schema } from 'mongoose';

export interface ITemplate extends Document {
  userId?: mongoose.Types.ObjectId; // null = global template (admin)
  name: string;
  description?: string;
  symbol: string;
  orderType: 'BUY' | 'SELL';
  riskMode: 'fixed_lot' | 'percent' | 'balance_ratio';
  riskValue: number;
  slPips?: number;
  tpPips?: number;
  slPrice?: number;
  tpPrice?: number;
  magicNumber?: number;
  comment?: string;
  isGlobal: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const templateSchema = new Schema<ITemplate>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    symbol: {
      type: String,
      required: true,
    },
    orderType: {
      type: String,
      enum: ['BUY', 'SELL'],
      required: true,
    },
    riskMode: {
      type: String,
      enum: ['fixed_lot', 'percent', 'balance_ratio'],
      required: true,
    },
    riskValue: {
      type: Number,
      required: true,
      min: 0.01,
    },
    slPips: {
      type: Number,
      min: 0,
    },
    tpPips: {
      type: Number,
      min: 0,
    },
    slPrice: {
      type: Number,
    },
    tpPrice: {
      type: Number,
    },
    magicNumber: {
      type: Number,
    },
    comment: {
      type: String,
      trim: true,
    },
    isGlobal: {
      type: Boolean,
      default: false,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
templateSchema.index({ userId: 1, isActive: 1 });
templateSchema.index({ isGlobal: 1, isActive: 1 });

export const Template = mongoose.model<ITemplate>('Template', templateSchema);

