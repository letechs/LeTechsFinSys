# Backend API Structure - LeTechs Copy Trading System

## Technology: Node.js + Express + TypeScript

---

## 📁 FOLDER STRUCTURE

```
backend/
├── src/
│   ├── config/
│   │   ├── database.ts          # MongoDB/PostgreSQL connection
│   │   ├── redis.ts             # Redis connection for command queue
│   │   ├── stripe.ts            # Stripe configuration
│   │   ├── env.ts               # Environment variables validation
│   │   └── constants.ts         # App constants
│   │
│   ├── models/
│   │   ├── User.ts              # User model
│   │   ├── Subscription.ts      # Subscription model
│   │   ├── MT5Account.ts        # MT5 Account model
│   │   ├── CopyLink.ts          # Master-Slave link model
│   │   ├── Command.ts           # Command model
│   │   ├── Trade.ts             # Trade model
│   │   ├── Template.ts          # Template model
│   │   └── index.ts             # Export all models
│   │
│   ├── middleware/
│   │   ├── auth.ts              # JWT authentication
│   │   ├── eaAuth.ts            # EA Token authentication
│   │   ├── subscriptionCheck.ts # Subscription validation
│   │   ├── rateLimit.ts         # Rate limiting
│   │   ├── errorHandler.ts      # Global error handler
│   │   ├── validator.ts         # Request validation
│   │   └── logger.ts            # Request logging
│   │
│   ├── services/
│   │   ├── auth/
│   │   │   ├── authService.ts   # Login, register, JWT
│   │   │   └── passwordService.ts # Password hashing
│   │   │
│   │   ├── subscription/
│   │   │   ├── subscriptionService.ts    # Subscription CRUD
│   │   │   ├── stripeService.ts          # Stripe integration
│   │   │   ├── planService.ts            # Plan management
│   │   │   └── usageService.ts           # Usage tracking
│   │   │
│   │   ├── mt5/
│   │   │   ├── accountService.ts         # MT5 account CRUD
│   │   │   ├── eaTokenService.ts         # EA token generation
│   │   │   ├── heartbeatService.ts       # Process heartbeats
│   │   │   └── statusService.ts          # Account status updates
│   │   │
│   │   ├── copyTrading/
│   │   │   ├── copyLinkService.ts        # Master-Slave links
│   │   │   ├── signalDetectionService.ts # Detect master trades
│   │   │   ├── commandGeneratorService.ts # Generate copy commands
│   │   │   └── distributionService.ts    # Distribute to slaves
│   │   │
│   │   ├── commands/
│   │   │   ├── commandService.ts         # Command CRUD
│   │   │   ├── commandQueueService.ts    # Redis queue management
│   │   │   └── commandExecutionService.ts # Track execution
│   │   │
│   │   ├── trading/
│   │   │   ├── orderService.ts           # Create orders from web
│   │   │   ├── templateService.ts        # Template execution
│   │   │   └── ruleService.ts            # Rules engine
│   │   │
│   │   └── webhooks/
│   │       └── stripeWebhookService.ts   # Stripe webhooks
│   │
│   ├── controllers/
│   │   ├── authController.ts
│   │   ├── userController.ts
│   │   ├── subscriptionController.ts
│   │   ├── mt5AccountController.ts
│   │   ├── copyLinkController.ts
│   │   ├── commandController.ts
│   │   ├── tradeController.ts
│   │   ├── templateController.ts
│   │   ├── heartbeatController.ts
│   │   └── webhookController.ts
│   │
│   ├── routes/
│   │   ├── index.ts              # Route aggregator
│   │   ├── auth.routes.ts
│   │   ├── user.routes.ts
│   │   ├── subscription.routes.ts
│   │   ├── mt5.routes.ts
│   │   ├── copyTrading.routes.ts
│   │   ├── commands.routes.ts
│   │   ├── trades.routes.ts
│   │   ├── templates.routes.ts
│   │   ├── heartbeat.routes.ts  # EA endpoints
│   │   └── webhooks.routes.ts   # Stripe webhooks
│   │
│   ├── utils/
│   │   ├── logger.ts            # Winston logger
│   │   ├── errors.ts            # Custom error classes
│   │   ├── validators.ts        # Validation helpers
│   │   ├── helpers.ts           # Utility functions
│   │   └── types.ts             # TypeScript types
│   │
│   ├── types/
│   │   ├── express.d.ts         # Express type extensions
│   │   ├── models.d.ts          # Model types
│   │   └── api.d.ts             # API request/response types
│   │
│   ├── jobs/
│   │   ├── subscriptionChecker.ts    # Check expired subscriptions
│   │   ├── accountStatusChecker.ts    # Mark offline accounts
│   │   ├── commandCleanup.ts         # Clean expired commands
│   │   └── scheduler.ts              # Job scheduler (node-cron)
│   │
│   ├── app.ts                  # Express app setup
│   └── server.ts               # Server entry point
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🔌 API ENDPOINTS

### **Authentication Routes** (`/api/auth`)

```
POST   /api/auth/register          # User registration
POST   /api/auth/login             # User login (returns JWT)
POST   /api/auth/logout            # Logout (optional)
POST   /api/auth/refresh           # Refresh JWT token
POST   /api/auth/forgot-password   # Password reset request
POST   /api/auth/reset-password    # Reset password with token
```

---

### **User Routes** (`/api/users`)

```
GET    /api/users/me               # Get current user profile
PUT    /api/users/me               # Update profile
GET    /api/users/me/accounts      # Get user's MT5 accounts
GET    /api/users/me/subscription  # Get current subscription
```

**Middleware:** `auth` (JWT required)

---

### **Subscription Routes** (`/api/subscriptions`)

```
GET    /api/subscriptions/plans           # Get available plans
POST   /api/subscriptions/create-checkout # Create Stripe checkout session
POST   /api/subscriptions/cancel          # Cancel subscription
GET    /api/subscriptions/history         # Get subscription history
GET    /api/subscriptions/usage           # Get usage statistics
```

**Middleware:** `auth`, `subscriptionCheck`

---

### **MT5 Account Routes** (`/api/mt5`)

```
POST   /api/mt5/accounts                  # Add new MT5 account
GET    /api/mt5/accounts                  # List user's accounts
GET    /api/mt5/accounts/:id              # Get account details
PUT    /api/mt5/accounts/:id              # Update account settings
DELETE /api/mt5/accounts/:id              # Remove account
POST   /api/mt5/accounts/:id/regenerate-token # Regenerate EA token
GET    /api/mt5/accounts/:id/status       # Get account status
GET    /api/mt5/accounts/:id/trades       # Get account trades
```

**Middleware:** `auth`, `subscriptionCheck`

---

### **Copy Trading Routes** (`/api/copy-trading`)

```
POST   /api/copy-trading/links            # Create master-slave link
GET    /api/copy-trading/links            # List all links
GET    /api/copy-trading/links/:id        # Get link details
PUT    /api/copy-trading/links/:id        # Update link settings
DELETE /api/copy-trading/links/:id        # Remove link
POST   /api/copy-trading/links/:id/pause  # Pause copying
POST   /api/copy-trading/links/:id/resume # Resume copying
```

**Middleware:** `auth`, `subscriptionCheck` (check copyTrading feature)

---

### **Commands Routes** (`/api/commands`)

```
POST   /api/commands                      # Create command (from web terminal)
GET    /api/commands                     # List commands (with filters)
GET    /api/commands/:id                 # Get command details
DELETE /api/commands/:id                 # Cancel pending command
```

**Middleware:** `auth`, `subscriptionCheck`

---

### **Templates Routes** (`/api/templates`)

```
POST   /api/templates                     # Create template
GET    /api/templates                     # List templates (user + global)
GET    /api/templates/:id                # Get template
PUT    /api/templates/:id                # Update template
DELETE /api/templates/:id                # Delete template
POST   /api/templates/:id/execute        # Execute template on account
```

**Middleware:** `auth`, `subscriptionCheck`

---

### **Trades Routes** (`/api/trades`)

```
GET    /api/trades                       # List trades (with filters)
GET    /api/trades/:id                   # Get trade details
GET    /api/trades/account/:accountId    # Get trades for account
GET    /api/trades/statistics            # Get trading statistics
```

**Middleware:** `auth`

---

### **EA Heartbeat Routes** (`/api/ea`) - **NO AUTH REQUIRED (EA Token only)**

```
POST   /api/ea/heartbeat                 # EA sends heartbeat
GET    /api/ea/commands                  # EA polls for commands
POST   /api/ea/command-ack               # EA acknowledges command execution
```

**Middleware:** `eaAuth` (EA Token validation)

---

### **Webhooks Routes** (`/api/webhooks`)

```
POST   /api/webhooks/stripe              # Stripe webhook handler
```

**Middleware:** Stripe signature verification

---

## 🔐 MIDDLEWARE DETAILS

### **1. auth.ts** (JWT Authentication)
```typescript
// Validates JWT token from Authorization header
// Adds user object to req.user
// Returns 401 if invalid/expired
```

### **2. eaAuth.ts** (EA Token Authentication)
```typescript
// Validates EA Token from header: X-EA-Token
// Finds MT5 account by token
// Adds account to req.eaAccount
// Checks if account is active
// Returns 401 if invalid
```

### **3. subscriptionCheck.ts** (Subscription Validation)
```typescript
// Checks if user has active subscription
// Validates feature access (copyTrading, remoteControl, etc.)
// Checks account limits (maxAccounts)
// Returns 403 if subscription expired or feature not available
```

### **4. rateLimit.ts** (Rate Limiting)
```typescript
// Uses express-rate-limit
// Different limits for different endpoints
// EA endpoints: higher limit (100 req/min)
// Auth endpoints: lower limit (5 req/min)
```

---

## 🎯 KEY SERVICES

### **1. subscriptionService.ts**

```typescript
class SubscriptionService {
  // Check if user has active subscription
  async isSubscriptionActive(userId: string): Promise<boolean>
  
  // Get user's current subscription
  async getCurrentSubscription(userId: string): Promise<Subscription>
  
  // Check feature access
  async hasFeatureAccess(userId: string, feature: string): Promise<boolean>
  
  // Check account limit
  async canAddAccount(userId: string): Promise<boolean>
  
  // Create subscription (after Stripe payment)
  async createSubscription(userId: string, stripeData: any): Promise<Subscription>
  
  // Cancel subscription
  async cancelSubscription(userId: string): Promise<void>
  
  // Update subscription status (from webhook)
  async updateFromWebhook(stripeEvent: any): Promise<void>
}
```

---

### **2. heartbeatService.ts**

```typescript
class HeartbeatService {
  // Process heartbeat from EA
  async processHeartbeat(accountId: string, data: HeartbeatData): Promise<void> {
    // 1. Update account status (balance, equity, etc.)
    // 2. Update open trades
    // 3. Detect new trades (compare with previous snapshot)
    // 4. Process command acknowledgments
    // 5. Check rules (equity stop, daily loss, etc.)
    // 6. Generate commands if rules triggered
  }
  
  // Detect master trade changes
  async detectMasterTrades(accountId: string, currentTrades: Trade[]): Promise<Trade[]>
  
  // Update account status
  async updateAccountStatus(accountId: string, data: AccountStatus): Promise<void>
}
```

---

### **3. signalDetectionService.ts**

```typescript
class SignalDetectionService {
  // Detect new master trades
  async detectNewTrades(masterAccountId: string): Promise<MasterTradeSignal[]>
  
  // Compare trade snapshots
  compareSnapshots(oldTrades: Trade[], newTrades: Trade[]): TradeDiff
  
  // Create master trade signal
  async createSignal(masterAccountId: string, trade: Trade, eventType: string): Promise<MasterTradeSignal>
}
```

---

### **4. commandGeneratorService.ts**

```typescript
class CommandGeneratorService {
  // Generate copy commands from master trade
  async generateCopyCommands(masterTrade: MasterTradeSignal): Promise<Command[]>
  
  // Calculate lot size for slave
  calculateSlaveLotSize(masterLot: number, link: CopyLink, slaveBalance: number): number
  
  // Apply filters (symbol, time, etc.)
  async applyFilters(command: Command, account: MT5Account): Promise<boolean>
  
  // Create command from template
  async createFromTemplate(templateId: string, accountId: string): Promise<Command>
  
  // Create command from manual order
  async createManualOrder(data: ManualOrderData): Promise<Command>
}
```

---

### **5. commandQueueService.ts** (Redis)

```typescript
class CommandQueueService {
  // Add command to queue
  async enqueueCommand(accountId: string, command: Command): Promise<void>
  
  // Get pending commands for EA
  async getPendingCommands(accountId: string, limit: number): Promise<Command[]>
  
  // Mark command as sent
  async markCommandSent(commandId: string): Promise<void>
  
  // Remove command from queue
  async dequeueCommand(commandId: string): Promise<void>
}
```

---

### **6. ruleService.ts** (Rules Engine)

```typescript
class RuleService {
  // Evaluate all rules for account
  async evaluateRules(accountId: string): Promise<Command[]>
  
  // Check equity stop rule
  async checkEquityStop(account: MT5Account): Promise<Command | null>
  
  // Check daily loss limit
  async checkDailyLossLimit(account: MT5Account): Promise<Command | null>
  
  // Check symbol filter
  async checkSymbolFilter(command: Command, account: MT5Account): Promise<boolean>
  
  // Check max trades limit
  async checkMaxTrades(account: MT5Account): Promise<Command | null>
  
  // Check time filter
  async checkTimeFilter(account: MT5Account): Promise<boolean>
}
```

---

### **7. stripeService.ts**

```typescript
class StripeService {
  // Create checkout session
  async createCheckoutSession(userId: string, planId: string): Promise<CheckoutSession>
  
  // Handle webhook events
  async handleWebhook(event: Stripe.Event): Promise<void>
  
  // Cancel subscription
  async cancelSubscription(stripeSubscriptionId: string): Promise<void>
  
  // Get customer
  async getCustomer(stripeCustomerId: string): Promise<Stripe.Customer>
}
```

---

## 🔄 REQUEST/RESPONSE EXAMPLES

### **POST /api/ea/heartbeat** (EA → Backend)

**Request:**
```json
{
  "eaToken": "6bd4f0cd-836b-4d0d-a9f7-0c231fc57f79",
  "balance": 10000.50,
  "equity": 10050.25,
  "margin": 500.00,
  "freeMargin": 9550.25,
  "marginLevel": 2010.05,
  "openTrades": [
    {
      "ticket": 123456,
      "symbol": "XAUUSD",
      "type": "BUY",
      "volume": 0.10,
      "openPrice": 2650.50,
      "currentPrice": 2655.25,
      "profit": 47.50,
      "sl": 2630.00,
      "tp": 2680.00
    }
  ],
  "executedCommands": [
    {
      "commandId": "cmd_abc123",
      "status": "success",
      "orderTicket": 123456,
      "error": null
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Heartbeat received",
  "accountStatus": "online"
}
```

---

### **GET /api/ea/commands** (EA Polls Backend)

**Request Headers:**
```
X-EA-Token: 6bd4f0cd-836b-4d0d-a9f7-0c231fc57f79
```

**Response:**
```json
{
  "success": true,
  "commands": [
    {
      "_id": "cmd_abc123",
      "commandType": "BUY",
      "symbol": "XAUUSD",
      "volume": 0.10,
      "slPips": 300,
      "tpPips": 600,
      "priority": 10,
      "createdAt": "2025-01-15T10:30:00Z"
    }
  ]
}
```

---

### **POST /api/commands** (Web Terminal → Backend)

**Request:**
```json
{
  "accountId": "acc_001",
  "commandType": "BUY",
  "symbol": "EURUSD",
  "volume": 0.10,
  "slPips": 50,
  "tpPips": 100
}
```

**Response:**
```json
{
  "success": true,
  "command": {
    "_id": "cmd_xyz789",
    "status": "pending",
    "createdAt": "2025-01-15T10:35:00Z"
  }
}
```

---

## 🚀 STARTUP FLOW

1. **Load environment variables**
2. **Connect to MongoDB/PostgreSQL**
3. **Connect to Redis**
4. **Initialize Stripe**
5. **Load middleware**
6. **Register routes**
7. **Start background jobs** (subscription checker, status checker)
8. **Start Express server**

---

## 📦 DEPENDENCIES

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "mongoose": "^7.5.0",  // or "pg" for PostgreSQL
    "redis": "^4.6.7",
    "stripe": "^13.0.0",
    "jsonwebtoken": "^9.0.2",
    "bcrypt": "^5.1.1",
    "express-validator": "^7.0.1",
    "express-rate-limit": "^6.10.0",
    "winston": "^3.10.0",
    "node-cron": "^3.0.2",
    "uuid": "^9.0.1",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "@types/express": "^4.17.17",
    "@types/node": "^20.5.0",
    "typescript": "^5.1.6",
    "ts-node": "^10.9.1",
    "nodemon": "^3.0.1"
  }
}
```

---

## 🔒 SECURITY FEATURES

1. **JWT Authentication** for web users
2. **EA Token Authentication** for EA connections
3. **Rate Limiting** on all endpoints
4. **Input Validation** with express-validator
5. **CORS** configuration
6. **Helmet** for security headers
7. **Stripe Webhook** signature verification
8. **Password Hashing** with bcrypt
9. **SQL Injection** prevention (parameterized queries)
10. **XSS Protection** (input sanitization)

---

This structure provides:
✅ Scalable architecture
✅ Clean separation of concerns
✅ Type safety with TypeScript
✅ Subscription management
✅ Real-time command queue
✅ Master-slave copy trading
✅ Remote order placement
✅ Rules engine
✅ Stripe integration

