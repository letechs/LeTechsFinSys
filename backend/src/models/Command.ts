import mongoose, { Document, Schema } from 'mongoose';
import { COMMAND_TYPES, COMMAND_STATUS, SOURCE_TYPES } from '../config/constants';

export interface ICommand extends Document {
  targetAccountId: mongoose.Types.ObjectId;
  commandType: 'BUY' | 'SELL' | 'CLOSE' | 'CLOSE_ALL' | 'MODIFY' | 'PAUSE_COPY' | 'RESUME_COPY';
  
  // Command data
  symbol?: string;
  volume?: number;
  orderType?: 'MARKET' | 'LIMIT' | 'STOP';
  price?: number;
  sl?: number;
  tp?: number;
  slPips?: number;
  tpPips?: number;
  comment?: string;
  magicNumber?: number;
  
  // For CLOSE command
  ticket?: number;
  
  // For MODIFY command
  modifyTicket?: number;
  newSl?: number;
  newTp?: number;
  
  // Master ticket (for copy trading - used to find slave positions)
  masterTicket?: number;
  
  // Source information
  sourceType: 'master_trade' | 'manual' | 'template' | 'rule' | 'bot';
  sourceId?: mongoose.Types.ObjectId;
  masterAccountId?: mongoose.Types.ObjectId;
  
  // Status
  status: 'pending' | 'sent' | 'executed' | 'failed' | 'expired';
  priority: number;
  
  // Execution result
  executedAt?: Date;
  executionResult?: {
    success: boolean;
    orderTicket?: number;
    error?: string;
    errorCode?: number;
  };
  
  sentAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const commandSchema = new Schema<ICommand>(
  {
    targetAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'MT5Account',
      required: true,
      index: true,
    },
    commandType: {
      type: String,
      enum: Object.values(COMMAND_TYPES),
      required: true,
    },
    symbol: {
      type: String,
    },
    volume: {
      type: Number,
      min: 0.01,
    },
    orderType: {
      type: String,
      enum: ['MARKET', 'LIMIT', 'STOP'],
      default: 'MARKET',
    },
    price: {
      type: Number,
    },
    sl: {
      type: Number,
    },
    tp: {
      type: Number,
    },
    slPips: {
      type: Number,
    },
    tpPips: {
      type: Number,
    },
    ticket: {
      type: Number,
    },
    modifyTicket: {
      type: Number,
    },
    newSl: {
      type: Number,
    },
    newTp: {
      type: Number,
    },
    masterTicket: {
      type: Number,
    },
    comment: {
      type: String,
      trim: true,
    },
    magicNumber: {
      type: Number,
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
    status: {
      type: String,
      enum: Object.values(COMMAND_STATUS),
      default: COMMAND_STATUS.PENDING,
      index: true,
    },
    priority: {
      type: Number,
      default: 5,
      min: 1,
      max: 10,
    },
    executedAt: {
      type: Date,
    },
    executionResult: {
      success: Boolean,
      orderTicket: Number,
      error: String,
      errorCode: Number,
    },
    sentAt: {
      type: Date,
    },
    expiresAt: {
      type: Date,
      index: { expireAfterSeconds: 0 }, // TTL index - auto-delete after expiration
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient command polling
commandSchema.index({ targetAccountId: 1, status: 1, priority: -1, createdAt: 1 });

// Set default expiration (24 hours from creation)
(commandSchema as any).pre('save', function (this: ICommand) {
  if (!this.expiresAt && this.status === COMMAND_STATUS.PENDING) {
    this.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  }
});

export const Command = mongoose.model<ICommand>('Command', commandSchema);

