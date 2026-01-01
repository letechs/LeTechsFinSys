import mongoose, { Document, Schema } from 'mongoose';
import { ACCOUNT_TYPES, ACCOUNT_STATUS } from '../config/constants';

export interface IMT5Account extends Document {
  userId: mongoose.Types.ObjectId;
  accountName: string;
  loginId: string;
  broker: string;
  server: string;
  eaToken: string; // UUID v4
  accountType: 'master' | 'slave' | 'standalone';
  status: 'active' | 'inactive' | 'offline' | 'suspended';
  lastHeartbeat?: Date;
  connectionStatus: 'online' | 'offline';
  
  // Current account state
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
  
  // Configuration
  riskMultiplier: number;
  maxLotSize: number;
  minLotSize: number;
  
  // Rules
  rules: {
    equityStop: {
      enabled: boolean;
      threshold: number;
    };
    dailyLossLimit: {
      enabled: boolean;
      maxLossPercent: number;
    };
    symbolFilter: {
      enabled: boolean;
      allowedSymbols: string[];
      excludedSymbols: string[];
    };
    maxTrades: {
      enabled: boolean;
      maxOpenTrades: number;
    };
    timeFilter: {
      enabled: boolean;
      allowedHours: {
        start: string; // "00:00"
        end: string; // "23:59"
      };
    };
  };
  
  createdAt: Date;
  updatedAt: Date;
}

const mt5AccountSchema = new Schema<IMT5Account>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    accountName: {
      type: String,
      required: true,
      trim: true,
    },
    loginId: {
      type: String,
      required: true,
    },
    broker: {
      type: String,
      required: true,
    },
    server: {
      type: String,
      required: true,
    },
    eaToken: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    accountType: {
      type: String,
      enum: Object.values(ACCOUNT_TYPES),
      default: ACCOUNT_TYPES.STANDALONE,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(ACCOUNT_STATUS),
      default: ACCOUNT_STATUS.ACTIVE,
      index: true,
    },
    lastHeartbeat: {
      type: Date,
      index: true,
    },
    connectionStatus: {
      type: String,
      enum: ['online', 'offline'],
      default: 'offline',
    },
    balance: {
      type: Number,
      default: 0,
    },
    equity: {
      type: Number,
      default: 0,
    },
    margin: {
      type: Number,
      default: 0,
    },
    freeMargin: {
      type: Number,
      default: 0,
    },
    marginLevel: {
      type: Number,
      default: 0,
    },
    riskMultiplier: {
      type: Number,
      default: 1.0,
      min: 0.01,
      max: 10.0,
    },
    maxLotSize: {
      type: Number,
      default: 100.0,
    },
    minLotSize: {
      type: Number,
      default: 0.01,
    },
    rules: {
      equityStop: {
        enabled: {
          type: Boolean,
          default: false,
        },
        threshold: {
          type: Number,
          default: 0,
        },
      },
      dailyLossLimit: {
        enabled: {
          type: Boolean,
          default: false,
        },
        maxLossPercent: {
          type: Number,
          default: 0,
        },
      },
      symbolFilter: {
        enabled: {
          type: Boolean,
          default: false,
        },
        allowedSymbols: {
          type: [String],
          default: [],
        },
        excludedSymbols: {
          type: [String],
          default: [],
        },
      },
      maxTrades: {
        enabled: {
          type: Boolean,
          default: false,
        },
        maxOpenTrades: {
          type: Number,
          default: 10,
        },
      },
      timeFilter: {
        enabled: {
          type: Boolean,
          default: false,
        },
        allowedHours: {
          start: {
            type: String,
            default: '00:00',
          },
          end: {
            type: String,
            default: '23:59',
          },
        },
      },
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes
mt5AccountSchema.index({ userId: 1, status: 1 });
mt5AccountSchema.index({ accountType: 1, status: 1 });

export const MT5Account = mongoose.model<IMT5Account>('MT5Account', mt5AccountSchema);

