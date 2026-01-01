import mongoose, { Document, Schema } from 'mongoose';
import { TRADE_STATUS, SOURCE_TYPES } from '../config/constants';

export interface ITrade extends Document {
  accountId: mongoose.Types.ObjectId;
  ticket: number; // MT5 order ticket
  symbol: string;
  orderType: 'BUY' | 'SELL';
  volume: number;
  openPrice: number;
  currentPrice: number;
  sl?: number;
  tp?: number;
  status: 'open' | 'closed' | 'pending';
  openTime: Date;
  closeTime?: Date;
  profit: number;
  swap: number;
  commission: number;
  sourceType: 'master_copy' | 'manual' | 'template' | 'rule' | 'bot';
  sourceId?: mongoose.Types.ObjectId;
  masterAccountId?: mongoose.Types.ObjectId;
  masterTicket?: number;
  magicNumber?: number;
  comment?: string;
  lastUpdate: Date;
  createdAt: Date;
}

const tradeSchema = new Schema<ITrade>(
  {
    accountId: {
      type: Schema.Types.ObjectId,
      ref: 'MT5Account',
      required: true,
      index: true,
    },
    ticket: {
      type: Number,
      required: true,
    },
    symbol: {
      type: String,
      required: true,
      index: true,
    },
    orderType: {
      type: String,
      enum: ['BUY', 'SELL'],
      required: true,
    },
    volume: {
      type: Number,
      required: true,
    },
    openPrice: {
      type: Number,
      required: true,
    },
    currentPrice: {
      type: Number,
      required: true,
    },
    sl: {
      type: Number,
    },
    tp: {
      type: Number,
    },
    status: {
      type: String,
      enum: Object.values(TRADE_STATUS),
      default: TRADE_STATUS.OPEN,
      index: true,
    },
    openTime: {
      type: Date,
      required: true,
      index: true,
    },
    closeTime: {
      type: Date,
    },
    profit: {
      type: Number,
      default: 0,
    },
    swap: {
      type: Number,
      default: 0,
    },
    commission: {
      type: Number,
      default: 0,
    },
    sourceType: {
      type: String,
      enum: Object.values(SOURCE_TYPES),
      required: true,
    },
    sourceId: {
      type: Schema.Types.ObjectId,
    },
    masterAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'MT5Account',
    },
    masterTicket: {
      type: Number,
    },
    magicNumber: {
      type: Number,
    },
    comment: {
      type: String,
    },
    lastUpdate: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes
tradeSchema.index({ accountId: 1, ticket: 1 }, { unique: true });
tradeSchema.index({ accountId: 1, status: 1 });
tradeSchema.index({ accountId: 1, symbol: 1 });
tradeSchema.index({ masterAccountId: 1, masterTicket: 1 });

export const Trade = mongoose.model<ITrade>('Trade', tradeSchema);

