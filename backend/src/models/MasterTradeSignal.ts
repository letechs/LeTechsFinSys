import mongoose, { Document, Schema } from 'mongoose';

export interface IMasterTradeSignal extends Document {
  masterAccountId: mongoose.Types.ObjectId;
  ticket: number; // Master trade ticket
  symbol: string;
  orderType: 'BUY' | 'SELL';
  volume: number;
  openPrice: number;
  sl?: number;
  tp?: number;
  eventType: 'OPEN' | 'CLOSE' | 'MODIFY';
  status: 'pending' | 'processed' | 'failed';
  processedAt?: Date;
  commandsGenerated: number;
  commandsExecuted: number;
  detectedAt: Date;
  createdAt: Date;
}

const masterTradeSignalSchema = new Schema<IMasterTradeSignal>(
  {
    masterAccountId: {
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
    sl: {
      type: Number,
    },
    tp: {
      type: Number,
    },
    eventType: {
      type: String,
      enum: ['OPEN', 'CLOSE', 'MODIFY'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'processed', 'failed'],
      default: 'pending',
      index: true,
    },
    processedAt: {
      type: Date,
    },
    commandsGenerated: {
      type: Number,
      default: 0,
    },
    commandsExecuted: {
      type: Number,
      default: 0,
    },
    detectedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes
masterTradeSignalSchema.index({ masterAccountId: 1, status: 1 });
masterTradeSignalSchema.index({ masterAccountId: 1, ticket: 1 });

export const MasterTradeSignal = mongoose.model<IMasterTradeSignal>('MasterTradeSignal', masterTradeSignalSchema);

