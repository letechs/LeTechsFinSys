// User Roles
export const USER_ROLES = {
  ADMIN: 'admin',
  CLIENT: 'client',
  VIEWER: 'viewer',
} as const;

// Subscription Status
export const SUBSCRIPTION_STATUS = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
  TRIAL: 'trial',
} as const;

// Subscription Plans
export const SUBSCRIPTION_PLANS = {
  BASIC: 'basic',
  PRO: 'pro',
  ENTERPRISE: 'enterprise',
} as const;

// Subscription Tiers (BASIC, EA License, Full Access)
export const SUBSCRIPTION_TIERS = {
  BASIC: 'BASIC',
  EA_LICENSE: 'EA_LICENSE',
  FULL_ACCESS: 'FULL_ACCESS',
} as const;

// Base Tier Limits (Hybrid Model)
export const BASE_TIER_LIMITS = {
  BASIC: {
    masters: 0,
    slaves: 0,
  },
  EA_LICENSE: {
    masters: 1,
    slaves: 2,
  },
  FULL_ACCESS: {
    masters: 3,
    slaves: 10,
  },
} as const;

// Trial Limits (3 days free trial)
export const TRIAL_LIMITS = {
  masters: 1,
  slaves: 1,
  durationDays: 3,
} as const;

// Grace Period Configuration
export const GRACE_PERIOD_DAYS = 5; // Days after expiry before moving to BASIC

// MT5 Account Types
export const ACCOUNT_TYPES = {
  MASTER: 'master',
  SLAVE: 'slave',
  STANDALONE: 'standalone',
} as const;

// MT5 Account Status
export const ACCOUNT_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  OFFLINE: 'offline',
  SUSPENDED: 'suspended',
} as const;

// Command Types
export const COMMAND_TYPES = {
  BUY: 'BUY',
  SELL: 'SELL',
  CLOSE: 'CLOSE',
  CLOSE_ALL: 'CLOSE_ALL',
  MODIFY: 'MODIFY',
  PAUSE_COPY: 'PAUSE_COPY',
  RESUME_COPY: 'RESUME_COPY',
} as const;

// Command Status
export const COMMAND_STATUS = {
  PENDING: 'pending',
  SENT: 'sent',
  EXECUTED: 'executed',
  FAILED: 'failed',
  EXPIRED: 'expired',
} as const;

// Trade Status
export const TRADE_STATUS = {
  OPEN: 'open',
  CLOSED: 'closed',
  PENDING: 'pending',
} as const;

// Source Types
export const SOURCE_TYPES = {
  MASTER_TRADE: 'master_trade',
  MANUAL: 'manual',
  TEMPLATE: 'template',
  RULE: 'rule',
  BOT: 'bot',
} as const;

// EA Error Codes
export const EA_ERROR_CODES = {
  INVALID_TOKEN: 'EA_TOKEN_INVALID',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  SUBSCRIPTION_EXPIRED: 'SUBSCRIPTION_EXPIRED',
  ACCOUNT_LIMIT_REACHED: 'ACCOUNT_LIMIT_REACHED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  SERVER_ERROR: 'SERVER_ERROR',
} as const;

// Heartbeat intervals (in seconds)
export const HEARTBEAT_INTERVAL = 3;
export const COMMAND_POLL_INTERVAL = 1;
export const OFFLINE_THRESHOLD = 10; // seconds

