import mongoose, { Document, Schema } from 'mongoose';

export interface ICopyLink extends Document {
  masterAccountId: mongoose.Types.ObjectId;
  slaveAccountId: mongoose.Types.ObjectId;
  status: 'active' | 'paused' | 'disabled';
  
  // Copy settings
  lotMultiplier: number;
  riskMode: 'fixed' | 'percentage' | 'balance_ratio';
  riskPercent: number;
  
  // Filters
  copySymbols: string[];
  excludeSymbols: string[];
  copyPendingOrders: boolean;
  copyModifications: boolean;
  
  // Priority (if slave has multiple masters)
  priority: number;
  
  pausedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const copyLinkSchema = new Schema<ICopyLink>(
  {
    masterAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'MT5Account',
      required: true,
      index: true,
    },
    slaveAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'MT5Account',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'paused', 'disabled'],
      default: 'active',
      index: true,
    },
    lotMultiplier: {
      type: Number,
      default: 1.0,
      min: 0.01,
      max: 10.0,
    },
    riskMode: {
      type: String,
      enum: ['fixed', 'percentage', 'balance_ratio'],
      default: 'fixed',
    },
    riskPercent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    copySymbols: {
      type: [String],
      default: [],
    },
    excludeSymbols: {
      type: [String],
      default: [],
    },
    copyPendingOrders: {
      type: Boolean,
      default: false,
    },
    copyModifications: {
      type: Boolean,
      default: true,
    },
    priority: {
      type: Number,
      default: 1,
      min: 1,
    },
    pausedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes
copyLinkSchema.index({ slaveAccountId: 1, status: 1 });
copyLinkSchema.index({ masterAccountId: 1, status: 1 });

// Prevent duplicate links
copyLinkSchema.index({ masterAccountId: 1, slaveAccountId: 1 }, { unique: true });

export const CopyLink = mongoose.model<ICopyLink>('CopyLink', copyLinkSchema);

