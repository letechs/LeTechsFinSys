# Database Schema - LeTechs Copy Trading System

## Technology: MongoDB (with PostgreSQL alternative notes)

---

## 📊 COLLECTIONS/TABLES

### 1. **users** (User Accounts)
```javascript
{
  _id: ObjectId,
  email: String (unique, indexed),
  password: String (hashed),
  name: String,
  role: String, // "admin" | "client"
  createdAt: Date,
  updatedAt: Date,
  isActive: Boolean,
  lastLogin: Date
}
```

**Indexes:**
- `email` (unique)
- `role`

---

### 2. **subscriptions** (Subscription Plans)
```javascript
{
  _id: ObjectId,
  userId: ObjectId (ref: users),
  planType: String, // "basic" | "pro" | "enterprise"
  billingCycle: String, // "monthly" | "yearly"
  status: String, // "active" | "expired" | "cancelled" | "trial"
  stripeSubscriptionId: String, // Stripe subscription ID
  stripeCustomerId: String, // Stripe customer ID
  currentPeriodStart: Date,
  currentPeriodEnd: Date,
  trialEndsAt: Date, // null if no trial
  maxAccounts: Number, // Maximum MT5 accounts allowed
  features: {
    copyTrading: Boolean,
    remoteControl: Boolean,
    templates: Boolean,
    rulesEngine: Boolean,
    multiMaster: Boolean,
    apiAccess: Boolean
  },
  createdAt: Date,
  updatedAt: Date,
  cancelledAt: Date
}
```

**Indexes:**
- `userId`
- `status`
- `currentPeriodEnd` (for expiration checks)
- `stripeSubscriptionId` (unique)

---

### 3. **mt5_accounts** (MT5 Account Information)
```javascript
{
  _id: ObjectId,
  userId: ObjectId (ref: users),
  accountName: String, // User-friendly name
  loginId: String, // MT5 login ID
  broker: String, // Broker name
  server: String, // MT5 server name
  eaToken: String (unique, indexed), // UUID v4 - EA authentication token
  accountType: String, // "master" | "slave" | "standalone"
  status: String, // "active" | "inactive" | "offline" | "suspended"
  lastHeartbeat: Date, // Last heartbeat received from EA
  connectionStatus: String, // "online" | "offline"
  
  // Current account state (from heartbeat)
  balance: Number,
  equity: Number,
  margin: Number,
  freeMargin: Number,
  marginLevel: Number,
  
  // Configuration
  riskMultiplier: Number, // Default lot multiplier for copy trading
  maxLotSize: Number, // Maximum lot size allowed
  minLotSize: Number, // Minimum lot size allowed
  
  // Rules
  rules: {
    equityStop: {
      enabled: Boolean,
      threshold: Number // Close all if equity <= threshold
    },
    dailyLossLimit: {
      enabled: Boolean,
      maxLossPercent: Number // Pause if daily loss > X%
    },
    symbolFilter: {
      enabled: Boolean,
      allowedSymbols: [String], // ["XAUUSD", "EURUSD"]
      excludedSymbols: [String]
    },
    maxTrades: {
      enabled: Boolean,
      maxOpenTrades: Number
    },
    timeFilter: {
      enabled: Boolean,
      allowedHours: {
        start: String, // "00:00"
        end: String // "23:59"
      }
    }
  },
  
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:**
- `userId`
- `eaToken` (unique)
- `accountType`
- `status`
- `lastHeartbeat`

---

### 4. **copy_links** (Master-Slave Relationships)
```javascript
{
  _id: ObjectId,
  masterAccountId: ObjectId (ref: mt5_accounts),
  slaveAccountId: ObjectId (ref: mt5_accounts),
  status: String, // "active" | "paused" | "disabled"
  
  // Copy settings
  lotMultiplier: Number, // e.g., 0.5, 1.0, 2.0
  riskMode: String, // "fixed" | "percentage" | "balance_ratio"
  riskPercent: Number, // If riskMode = "percentage"
  
  // Filters
  copySymbols: [String], // Only copy these symbols (empty = all)
  excludeSymbols: [String],
  copyPendingOrders: Boolean,
  copyModifications: Boolean, // Copy SL/TP changes
  
  // Priority (if slave has multiple masters)
  priority: Number, // Lower number = higher priority
  
  createdAt: Date,
  updatedAt: Date,
  pausedAt: Date
}
```

**Indexes:**
- `masterAccountId`
- `slaveAccountId`
- `status`
- Compound: `[slaveAccountId, status]`

---

### 5. **templates** (Predefined Trade Templates)
```javascript
{
  _id: ObjectId,
  userId: ObjectId (ref: users), // null = global template (admin)
  name: String,
  description: String,
  
  // Template configuration
  symbol: String,
  orderType: String, // "BUY" | "SELL"
  riskMode: String, // "fixed_lot" | "percent" | "balance_ratio"
  riskValue: Number, // Lot size or percentage
  slPips: Number, // Stop loss in pips
  tpPips: Number, // Take profit in pips
  slPrice: Number, // Optional: exact price
  tpPrice: Number, // Optional: exact price
  
  // Advanced
  magicNumber: Number, // MT5 magic number for identification
  comment: String, // Order comment
  
  isGlobal: Boolean, // true = available to all users
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:**
- `userId`
- `isGlobal`
- `isActive`

---

### 6. **commands** (Commands Queue for EA)
```javascript
{
  _id: ObjectId,
  targetAccountId: ObjectId (ref: mt5_accounts),
  commandType: String, // "BUY" | "SELL" | "CLOSE" | "CLOSE_ALL" | "MODIFY" | "PAUSE_COPY" | "RESUME_COPY"
  
  // Command data
  symbol: String,
  volume: Number, // Lot size
  orderType: String, // "MARKET" | "LIMIT" | "STOP"
  price: Number, // Entry price (for pending orders)
  sl: Number, // Stop loss price
  tp: Number, // Take profit price
  slPips: Number, // Stop loss in pips (alternative to sl)
  tpPips: Number, // Take profit in pips (alternative to tp)
  
  // For CLOSE command
  ticket: Number, // MT5 order ticket to close
  
  // For MODIFY command
  modifyTicket: Number, // Order ticket to modify
  newSl: Number,
  newTp: Number,
  
  // Source information
  sourceType: String, // "master_trade" | "manual" | "template" | "rule" | "bot"
  sourceId: ObjectId, // Reference to source (template ID, master trade ID, etc.)
  masterAccountId: ObjectId, // If copied from master
  
  // Status
  status: String, // "pending" | "sent" | "executed" | "failed" | "expired"
  priority: Number, // Higher = more priority
  
  // Execution result (from EA)
  executedAt: Date,
  executionResult: {
    success: Boolean,
    orderTicket: Number, // MT5 order ticket if successful
    error: String, // Error message if failed
    errorCode: Number // MT5 error code
  },
  
  createdAt: Date,
  sentAt: Date, // When EA received it
  expiresAt: Date // Command expires if not executed
}
```

**Indexes:**
- `targetAccountId`
- `status`
- `createdAt`
- Compound: `[targetAccountId, status, priority]` (for efficient polling)
- TTL: `expiresAt` (auto-delete expired commands after 24h)

---

### 7. **trades** (Trade History)
```javascript
{
  _id: ObjectId,
  accountId: ObjectId (ref: mt5_accounts),
  ticket: Number, // MT5 order ticket (unique per account)
  
  // Trade details
  symbol: String,
  orderType: String, // "BUY" | "SELL"
  volume: Number,
  openPrice: Number,
  currentPrice: Number,
  sl: Number,
  tp: Number,
  
  // Status
  status: String, // "open" | "closed" | "pending"
  openTime: Date,
  closeTime: Date, // null if still open
  
  // P&L
  profit: Number, // Current profit (or final if closed)
  swap: Number,
  commission: Number,
  
  // Source
  sourceType: String, // "master_copy" | "manual" | "template" | "rule" | "bot"
  sourceId: ObjectId,
  masterAccountId: ObjectId, // If copied from master
  masterTicket: Number, // Original master trade ticket
  
  // Metadata
  magicNumber: Number,
  comment: String,
  
  lastUpdate: Date, // Last time trade was updated from heartbeat
  createdAt: Date
}
```

**Indexes:**
- `accountId`
- `ticket` (unique per account)
- `status`
- `symbol`
- `openTime`
- Compound: `[accountId, status]`
- Compound: `[accountId, ticket]` (unique)

---

### 8. **heartbeats** (EA Heartbeat Log - Optional for debugging)
```javascript
{
  _id: ObjectId,
  accountId: ObjectId (ref: mt5_accounts),
  eaToken: String,
  
  // Account state
  balance: Number,
  equity: Number,
  margin: Number,
  freeMargin: Number,
  marginLevel: Number,
  
  // Open trades snapshot
  openTrades: [{
    ticket: Number,
    symbol: String,
    type: String,
    volume: Number,
    openPrice: Number,
    currentPrice: Number,
    profit: Number,
    sl: Number,
    tp: Number
  }],
  
  // Command acknowledgments
  executedCommands: [{
    commandId: ObjectId,
    status: String, // "success" | "failed"
    orderTicket: Number,
    error: String
  }],
  
  // Connection info
  ipAddress: String,
  mt5Version: String,
  eaVersion: String,
  
  receivedAt: Date
}
```

**Indexes:**
- `accountId`
- `receivedAt`
- TTL: `receivedAt` (auto-delete after 7 days for debugging)

---

### 9. **master_trade_signals** (Master Trade Events - for copy detection)
```javascript
{
  _id: ObjectId,
  masterAccountId: ObjectId (ref: mt5_accounts),
  ticket: Number, // Master trade ticket
  
  // Trade details
  symbol: String,
  orderType: String, // "BUY" | "SELL"
  volume: Number,
  openPrice: Number,
  sl: Number,
  tp: Number,
  
  // Event type
  eventType: String, // "OPEN" | "CLOSE" | "MODIFY"
  
  // Status
  status: String, // "pending" | "processed" | "failed"
  processedAt: Date,
  
  // Distribution
  commandsGenerated: Number, // How many slave commands created
  commandsExecuted: Number, // How many successfully executed
  
  detectedAt: Date, // When backend detected this trade
  createdAt: Date
}
```

**Indexes:**
- `masterAccountId`
- `ticket`
- `status`
- `detectedAt`
- Compound: `[masterAccountId, status]`

---

### 10. **subscription_usage** (Usage Tracking)
```javascript
{
  _id: ObjectId,
  userId: ObjectId (ref: users),
  subscriptionId: ObjectId (ref: subscriptions),
  
  // Daily usage stats
  date: Date,
  accountsActive: Number,
  tradesExecuted: Number,
  commandsSent: Number,
  apiCalls: Number,
  
  createdAt: Date
}
```

**Indexes:**
- `userId`
- `date`
- Compound: `[userId, date]` (unique)

---

### 11. **api_keys** (API Keys for External Access - Optional)
```javascript
{
  _id: ObjectId,
  userId: ObjectId (ref: users),
  keyName: String,
  apiKey: String (hashed, unique),
  apiSecret: String (hashed),
  
  permissions: [String], // ["read", "write", "trade"]
  isActive: Boolean,
  lastUsed: Date,
  
  createdAt: Date,
  expiresAt: Date // null = never expires
}
```

**Indexes:**
- `userId`
- `apiKey` (unique)
- `isActive`

---

## 🔄 RELATIONSHIPS SUMMARY

```
users (1) ──→ (many) subscriptions
users (1) ──→ (many) mt5_accounts
users (1) ──→ (many) templates

mt5_accounts (1) ──→ (many) copy_links (as master)
mt5_accounts (1) ──→ (many) copy_links (as slave)
mt5_accounts (1) ──→ (many) commands
mt5_accounts (1) ──→ (many) trades
mt5_accounts (1) ──→ (many) heartbeats
mt5_accounts (1) ──→ (many) master_trade_signals

subscriptions (1) ──→ (many) subscription_usage
```

---

## 📝 POSTGRESQL ALTERNATIVE NOTES

If using PostgreSQL instead of MongoDB:

1. Use `SERIAL` or `UUID` for IDs instead of `ObjectId`
2. Use `JSONB` for nested objects (rules, features, etc.)
3. Use `TIMESTAMP` for dates
4. Use foreign keys with `ON DELETE CASCADE`
5. Use `UNIQUE` constraints instead of unique indexes
6. Use `CHECK` constraints for enum-like fields (status, role, etc.)

---

## 🔐 SECURITY CONSIDERATIONS

1. **EA Tokens**: Store as plain UUID (not hashed) - but validate on every request
2. **Passwords**: Always hash with bcrypt (salt rounds: 10-12)
3. **API Keys**: Hash before storing
4. **Sensitive Data**: Consider encrypting MT5 login IDs if stored (though we don't store passwords)

---

## 📊 PERFORMANCE OPTIMIZATIONS

1. **Commands Queue**: Use Redis for real-time command queue (MongoDB for persistence)
2. **Heartbeat Aggregation**: Don't store every heartbeat - aggregate and update mt5_accounts
3. **Trade History**: Archive old trades (> 1 year) to separate collection
4. **Indexes**: All foreign keys and frequently queried fields indexed
5. **TTL Indexes**: Auto-cleanup old heartbeats and expired commands

---

## 🎯 KEY QUERIES

### Get pending commands for EA:
```javascript
db.commands.find({
  targetAccountId: accountId,
  status: "pending"
}).sort({ priority: -1, createdAt: 1 }).limit(10)
```

### Check subscription validity:
```javascript
db.subscriptions.findOne({
  userId: userId,
  status: "active",
  currentPeriodEnd: { $gte: new Date() }
})
```

### Find all slaves for a master:
```javascript
db.copy_links.find({
  masterAccountId: masterId,
  status: "active"
})
```

### Detect new master trades (compare snapshots):
```javascript
// Compare current openTrades with previous snapshot
// Store previous snapshot in memory/cache
```

---

This schema supports:
✅ Subscription management with Stripe
✅ Multi-tier plans with feature gating
✅ Master/Slave copy trading
✅ Remote order placement
✅ Templates and rules engine
✅ Command queue system
✅ Trade history and analytics
✅ Scalability (5K+ accounts)

