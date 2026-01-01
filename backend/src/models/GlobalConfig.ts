import mongoose, { Schema, Document } from 'mongoose';

export interface IGlobalConfig extends Document {
  // Subscription Pricing
  subscriptionPricing: {
    basic: {
      monthly: number;
      yearly: number;
      maxAccounts: number;
    };
    pro: {
      monthly: number;
      yearly: number;
      maxAccounts: number;
    };
    enterprise: {
      monthly: number;
      yearly: number;
      maxAccounts: number;
    };
    features: {
      basic: {
        copyTrading: boolean;
        remoteControl: boolean;
        templates: boolean;
        rulesEngine: boolean;
        multiMaster: boolean;
        apiAccess: boolean;
      };
      pro: {
        copyTrading: boolean;
        remoteControl: boolean;
        templates: boolean;
        rulesEngine: boolean;
        multiMaster: boolean;
        apiAccess: boolean;
      };
      enterprise: {
        copyTrading: boolean;
        remoteControl: boolean;
        templates: boolean;
        rulesEngine: boolean;
        multiMaster: boolean;
        apiAccess: boolean;
      };
    };
  };

  // Trial System
  trial: {
    enabled: boolean;
    durationDays: number;
    masters: number;
    slaves: number;
    enabledForAllUsers: boolean;
    enabledForGroups: string[]; // Array of user group identifiers
  };

  // Grace Period
  gracePeriod: {
    days: number;
  };

  // Base Tier Limits
  baseTierLimits: {
    BASIC: {
      masters: number;
      slaves: number;
    };
    EA_LICENSE: {
      masters: number;
      slaves: number;
    };
    FULL_ACCESS: {
      masters: number;
      slaves: number;
    };
  };

  // Default Renewal Period
  defaultRenewalPeriod: {
    days: number;
  };

  // Client Discount
  clientDiscount: {
    enabled: boolean;
    defaultPercentage: number;
    enabledForAllUsers: boolean;
    enabledForGroups: string[];
  };

  // Global Offers/Special Discounts
  globalOffers: {
    enabled: boolean;
    currentOffer: {
      percentage: number;
      expiryDate: Date | null;
      description: string;
      appliedToAllUsers: boolean;
      appliedToGroups: string[];
    };
  };

  // Add-On Pricing
  addOnPricing: {
    masterPrice: number;
    slavePrice: number;
    billingCycle: 'monthly' | 'yearly';
  };

  // EA Subscription Defaults
  eaDefaults: {
    defaultMasters: number;
    defaultSlaves: number;
  };

  // Metadata
  lastUpdated: Date;
  lastUpdatedBy: string; // admin user ID
  version: number; // For versioning/rollback
}

const GlobalConfigSchema = new Schema<IGlobalConfig>(
  {
    subscriptionPricing: {
      basic: {
        monthly: { type: Number, required: true, default: 29.99 },
        yearly: { type: Number, required: true, default: 299.99 },
        maxAccounts: { type: Number, required: true, default: 1 },
      },
      pro: {
        monthly: { type: Number, required: true, default: 59.99 },
        yearly: { type: Number, required: true, default: 599.99 },
        maxAccounts: { type: Number, required: true, default: 5 },
      },
      enterprise: {
        monthly: { type: Number, required: true, default: 99.99 },
        yearly: { type: Number, required: true, default: 999.99 },
        maxAccounts: { type: Number, required: true, default: 20 },
      },
      features: {
        basic: {
          copyTrading: { type: Boolean, default: true },
          remoteControl: { type: Boolean, default: true },
          templates: { type: Boolean, default: false },
          rulesEngine: { type: Boolean, default: false },
          multiMaster: { type: Boolean, default: false },
          apiAccess: { type: Boolean, default: false },
        },
        pro: {
          copyTrading: { type: Boolean, default: true },
          remoteControl: { type: Boolean, default: true },
          templates: { type: Boolean, default: true },
          rulesEngine: { type: Boolean, default: true },
          multiMaster: { type: Boolean, default: true },
          apiAccess: { type: Boolean, default: false },
        },
        enterprise: {
          copyTrading: { type: Boolean, default: true },
          remoteControl: { type: Boolean, default: true },
          templates: { type: Boolean, default: true },
          rulesEngine: { type: Boolean, default: true },
          multiMaster: { type: Boolean, default: true },
          apiAccess: { type: Boolean, default: true },
        },
      },
    },
    trial: {
      enabled: { type: Boolean, default: true },
      durationDays: { type: Number, default: 3 },
      masters: { type: Number, default: 1 },
      slaves: { type: Number, default: 1 },
      enabledForAllUsers: { type: Boolean, default: true },
      enabledForGroups: { type: [String], default: [] },
    },
    gracePeriod: {
      days: { type: Number, default: 5 },
    },
    baseTierLimits: {
      BASIC: {
        masters: { type: Number, default: 0 },
        slaves: { type: Number, default: 0 },
      },
      EA_LICENSE: {
        masters: { type: Number, default: 1 },
        slaves: { type: Number, default: 2 },
      },
      FULL_ACCESS: {
        masters: { type: Number, default: 3 },
        slaves: { type: Number, default: 10 },
      },
    },
    defaultRenewalPeriod: {
      days: { type: Number, default: 30 },
    },
    clientDiscount: {
      enabled: { type: Boolean, default: true },
      defaultPercentage: { type: Number, default: 5 },
      enabledForAllUsers: { type: Boolean, default: true },
      enabledForGroups: { type: [String], default: [] },
    },
    globalOffers: {
      enabled: { type: Boolean, default: false },
      currentOffer: {
        percentage: { type: Number, default: 0 },
        expiryDate: { type: Date, default: null },
        description: { type: String, default: '' },
        appliedToAllUsers: { type: Boolean, default: false },
        appliedToGroups: { type: [String], default: [] },
      },
    },
    addOnPricing: {
      masterPrice: { type: Number, default: 10.0 },
      slavePrice: { type: Number, default: 5.0 },
      billingCycle: { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },
    },
    eaDefaults: {
      defaultMasters: { type: Number, default: 0 },
      defaultSlaves: { type: Number, default: 0 },
    },
    lastUpdated: { type: Date, default: Date.now },
    lastUpdatedBy: { type: String, required: true },
    version: { type: Number, default: 1 },
  },
  {
    timestamps: true,
  }
);

// Ensure only one config document exists
GlobalConfigSchema.index({}, { unique: true });

export const GlobalConfig = mongoose.model<IGlobalConfig>('GlobalConfig', GlobalConfigSchema);

