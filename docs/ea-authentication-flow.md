# EA Authentication Flow & Protocol - LeTechs Copy Trading System

## Overview

The Expert Advisor (EA) communicates with the backend API using a token-based authentication system. The EA runs on the client's VPS inside their MT5 terminal and connects to your backend server.

---

## 🔑 EA TOKEN SYSTEM

### **Token Generation**

- **When:** Generated when user adds MT5 account via web dashboard
- **Format:** UUID v4 (e.g., `6bd4f0cd-836b-4d0d-a9f7-0c231fc57f79`)
- **Storage:** Stored in `mt5_accounts` collection with `eaToken` field
- **Persistence:** Token never expires (unlike JWT)
- **Uniqueness:** One token per MT5 account (unique constraint)

### **Token Security**

- Token is sent in HTTP header: `X-EA-Token`
- Backend validates token on every request
- If token invalid → 401 Unauthorized
- If account suspended → 403 Forbidden

---

## 🔄 AUTHENTICATION FLOW

### **Step 1: EA Initialization**

When EA starts on MT5 terminal:

```
1. EA reads EA_TOKEN from input parameter or file
2. EA validates token format (UUID)
3. EA attempts first heartbeat to backend
4. Backend validates token → returns account info
5. EA stores accountId and connection status
```

### **Step 2: Token Validation (Backend)**

```typescript
// Backend middleware: eaAuth.ts

async function validateEAToken(req, res, next) {
  const token = req.headers['x-ea-token'];
  
  if (!token) {
    return res.status(401).json({ error: 'EA Token required' });
  }
  
  // Find account by token
  const account = await MT5Account.findOne({ eaToken: token });
  
  if (!account) {
    return res.status(401).json({ error: 'Invalid EA Token' });
  }
  
  // Check account status
  if (account.status === 'suspended' || account.status === 'inactive') {
    return res.status(403).json({ error: 'Account suspended' });
  }
  
  // Check user's subscription
  const user = await User.findById(account.userId);
  const subscription = await Subscription.findOne({
    userId: user._id,
    status: 'active',
    currentPeriodEnd: { $gte: new Date() }
  });
  
  if (!subscription) {
    return res.status(403).json({ error: 'Subscription expired' });
  }
  
  // Attach account to request
  req.eaAccount = account;
  req.eaUser = user;
  req.eaSubscription = subscription;
  
  next();
}
```

---

## 📡 HEARTBEAT PROTOCOL

### **Purpose**

- Keep connection alive
- Update account status (balance, equity, trades)
- Send command execution results
- Detect connection loss

### **Frequency**

- **Recommended:** Every 2-3 seconds
- **Minimum:** Every 5 seconds
- **Maximum:** Every 1 second (if high-frequency trading)

### **Endpoint**

```
POST /api/ea/heartbeat
Headers: X-EA-Token: <token>
```

### **Request Payload**

```json
{
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
      "tp": 2680.00,
      "swap": 0.00,
      "commission": -0.50,
      "magicNumber": 12345,
      "comment": "Copy from Master",
      "openTime": "2025-01-15T10:30:00Z"
    }
  ],
  "executedCommands": [
    {
      "commandId": "cmd_abc123",
      "status": "success",
      "orderTicket": 123456,
      "error": null,
      "errorCode": null
    },
    {
      "commandId": "cmd_xyz789",
      "status": "failed",
      "orderTicket": null,
      "error": "Not enough money",
      "errorCode": 10019
    }
  ],
  "mt5Version": "5.0.0.1234",
  "eaVersion": "1.0.0"
}
```

### **Response**

```json
{
  "success": true,
  "message": "Heartbeat received",
  "accountStatus": "online",
  "serverTime": "2025-01-15T10:35:00Z"
}
```

### **Backend Processing**

```typescript
async function processHeartbeat(accountId: string, data: HeartbeatData) {
  // 1. Update account status
  await MT5Account.updateOne(
    { _id: accountId },
    {
      balance: data.balance,
      equity: data.equity,
      margin: data.margin,
      freeMargin: data.freeMargin,
      marginLevel: data.marginLevel,
      lastHeartbeat: new Date(),
      connectionStatus: 'online'
    }
  );
  
  // 2. Update trades
  for (const trade of data.openTrades) {
    await Trade.findOneAndUpdate(
      { accountId, ticket: trade.ticket },
      {
        ...trade,
        lastUpdate: new Date()
      },
      { upsert: true }
    );
  }
  
  // 3. Process command acknowledgments
  for (const ack of data.executedCommands) {
    await Command.findByIdAndUpdate(ack.commandId, {
      status: ack.status === 'success' ? 'executed' : 'failed',
      executedAt: new Date(),
      executionResult: {
        success: ack.status === 'success',
        orderTicket: ack.orderTicket,
        error: ack.error,
        errorCode: ack.errorCode
      }
    });
  }
  
  // 4. Detect master trades (if this is a master account)
  if (account.accountType === 'master') {
    await detectMasterTrades(accountId, data.openTrades);
  }
  
  // 5. Evaluate rules
  await evaluateRules(accountId, data);
}
```

---

## 📥 COMMAND POLLING PROTOCOL

### **Purpose**

EA polls backend for pending commands to execute.

### **Frequency**

- **Recommended:** Every 1 second
- **Can be:** Every 0.5 seconds for faster execution
- **Maximum:** Every 0.1 seconds (not recommended - high server load)

### **Endpoint**

```
GET /api/ea/commands?limit=10
Headers: X-EA-Token: <token>
```

### **Response**

```json
{
  "success": true,
  "commands": [
    {
      "_id": "cmd_abc123",
      "commandType": "BUY",
      "symbol": "XAUUSD",
      "volume": 0.10,
      "orderType": "MARKET",
      "sl": 2630.00,
      "tp": 2680.00,
      "slPips": 300,
      "tpPips": 600,
      "comment": "Copy from Master",
      "magicNumber": 12345,
      "priority": 10,
      "createdAt": "2025-01-15T10:30:00Z"
    },
    {
      "_id": "cmd_xyz789",
      "commandType": "CLOSE",
      "ticket": 123456,
      "priority": 5,
      "createdAt": "2025-01-15T10:31:00Z"
    }
  ]
}
```

### **Backend Logic**

```typescript
async function getPendingCommands(accountId: string, limit: number = 10) {
  // Get pending commands for this account
  const commands = await Command.find({
    targetAccountId: accountId,
    status: 'pending'
  })
  .sort({ priority: -1, createdAt: 1 })
  .limit(limit);
  
  // Mark as "sent" (so they're not sent again)
  const commandIds = commands.map(c => c._id);
  await Command.updateMany(
    { _id: { $in: commandIds } },
    { status: 'sent', sentAt: new Date() }
  );
  
  return commands;
}
```

---

## ⚙️ COMMAND EXECUTION FLOW

### **EA Side (MQL5)**

```mql5
// Pseudo-code for EA command execution

void OnTimer() {
    // Poll for commands every 1 second
    string response = HttpRequest("GET", "/api/ea/commands", headers);
    Command[] commands = ParseJSON(response);
    
    foreach(Command cmd in commands) {
        if(cmd.commandType == "BUY") {
            ExecuteBuy(cmd);
        }
        else if(cmd.commandType == "SELL") {
            ExecuteSell(cmd);
        }
        else if(cmd.commandType == "CLOSE") {
            CloseTrade(cmd.ticket);
        }
        else if(cmd.commandType == "CLOSE_ALL") {
            CloseAllTrades();
        }
        else if(cmd.commandType == "MODIFY") {
            ModifyTrade(cmd.modifyTicket, cmd.newSl, cmd.newTp);
        }
    }
}

void ExecuteBuy(Command cmd) {
    int ticket = OrderSend(
        cmd.symbol,
        OP_BUY,
        cmd.volume,
        Ask,
        slippage,
        cmd.sl,
        cmd.tp,
        cmd.comment,
        cmd.magicNumber
    );
    
    if(ticket > 0) {
        // Success - will be reported in next heartbeat
        AddCommandAck(cmd._id, "success", ticket, null);
    } else {
        // Failure
        int error = GetLastError();
        AddCommandAck(cmd._id, "failed", 0, ErrorDescription(error));
    }
}
```

### **Command Acknowledgment**

EA reports command execution results in the **next heartbeat**:

```json
{
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

---

## 🔍 SUBSCRIPTION VALIDATION

### **On Every Request**

Backend checks subscription on every EA request:

```typescript
async function validateSubscription(account: MT5Account) {
  const user = await User.findById(account.userId);
  
  // Get active subscription
  const subscription = await Subscription.findOne({
    userId: user._id,
    status: 'active',
    currentPeriodEnd: { $gte: new Date() }
  });
  
  if (!subscription) {
    // No active subscription
    return {
      valid: false,
      error: 'Subscription expired'
    };
  }
  
  // Check if account limit reached
  const accountCount = await MT5Account.countDocuments({
    userId: user._id,
    status: { $in: ['active', 'offline'] }
  });
  
  if (accountCount > subscription.maxAccounts) {
    return {
      valid: false,
      error: 'Account limit reached'
    };
  }
  
  return {
    valid: true,
    subscription
  };
}
```

### **Response to EA if Subscription Invalid**

```json
{
  "success": false,
  "error": "Subscription expired",
  "errorCode": "SUBSCRIPTION_EXPIRED"
}
```

EA should:
1. Log error
2. Show message to user in MT5 terminal
3. Stop executing commands
4. Continue sending heartbeats (to detect when subscription reactivated)

---

## 🔄 CONNECTION LOSS HANDLING

### **Backend Detection**

If no heartbeat received for > 10 seconds:

```typescript
// Background job runs every 30 seconds
async function checkAccountStatus() {
  const threshold = new Date(Date.now() - 10000); // 10 seconds ago
  
  const offlineAccounts = await MT5Account.updateMany(
    {
      lastHeartbeat: { $lt: threshold },
      connectionStatus: 'online'
    },
    {
      connectionStatus: 'offline',
      status: 'offline'
    }
  );
  
  // Notify users (optional)
  // Send email/push notification
}
```

### **EA Reconnection Logic**

```mql5
// EA should handle connection failures

int connectionFailures = 0;
datetime lastSuccessfulHeartbeat = 0;

void SendHeartbeat() {
    string response = HttpRequest("POST", "/api/ea/heartbeat", data);
    
    if(response == "") {
        // Connection failed
        connectionFailures++;
        
        if(connectionFailures > 3) {
            Alert("Connection lost. Retrying...");
        }
        
        // Exponential backoff
        Sleep(1000 * connectionFailures);
    } else {
        // Success
        connectionFailures = 0;
        lastSuccessfulHeartbeat = TimeCurrent();
    }
}
```

---

## 🛡️ SECURITY MEASURES

### **1. Token Validation**

- Token must be valid UUID format
- Token must exist in database
- Account must be active

### **2. Rate Limiting**

```typescript
// Different limits for EA endpoints
const eaRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: 'Too many requests from EA'
});
```

### **3. IP Whitelisting (Optional)**

```typescript
// Optional: Allow only specific IPs
const allowedIPs = ['1.2.3.4', '5.6.7.8'];

if (!allowedIPs.includes(req.ip)) {
  return res.status(403).json({ error: 'IP not allowed' });
}
```

### **4. Request Validation**

```typescript
// Validate heartbeat data
const schema = {
  balance: { type: 'number', required: true },
  equity: { type: 'number', required: true },
  openTrades: { type: 'array', required: true }
};

// Validate before processing
```

---

## 📊 ERROR HANDLING

### **EA Error Codes**

```typescript
const EA_ERROR_CODES = {
  INVALID_TOKEN: 'EA_TOKEN_INVALID',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  SUBSCRIPTION_EXPIRED: 'SUBSCRIPTION_EXPIRED',
  ACCOUNT_LIMIT_REACHED: 'ACCOUNT_LIMIT_REACHED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  SERVER_ERROR: 'SERVER_ERROR'
};
```

### **EA Response Handling**

```mql5
void HandleErrorResponse(string response) {
    JSONObject json = ParseJSON(response);
    
    if(json["errorCode"] == "SUBSCRIPTION_EXPIRED") {
        Alert("Your subscription has expired. Please renew.");
        // Stop executing commands
        g_bCanTrade = false;
    }
    else if(json["errorCode"] == "ACCOUNT_SUSPENDED") {
        Alert("Account suspended. Contact support.");
        g_bCanTrade = false;
    }
    else {
        Print("Error: ", json["error"]);
    }
}
```

---

## 🎯 BEST PRACTICES

### **1. Heartbeat Optimization**

- Send only changed data (delta updates)
- Compress large payloads
- Batch multiple updates

### **2. Command Polling**

- Poll frequently (1 second) for real-time execution
- Use priority field for urgent commands
- Implement command expiration (24 hours)

### **3. Error Recovery**

- Retry failed HTTP requests
- Exponential backoff on failures
- Log all errors for debugging

### **4. Resource Management**

- Limit command batch size (10-20 per poll)
- Clean up old commands
- Monitor API usage

---

## 📝 EA CONFIGURATION

### **EA Input Parameters**

```mql5
input string EA_TOKEN = "";  // EA Token from dashboard
input string API_URL = "https://api.letechs.io";  // Backend API URL
input int HEARTBEAT_INTERVAL = 3;  // Seconds between heartbeats
input int COMMAND_POLL_INTERVAL = 1;  // Seconds between command polls
input bool ENABLE_LOGGING = true;  // Enable detailed logging
```

### **EA Initialization**

```mql5
int OnInit() {
    // Validate EA Token
    if(StringLen(EA_TOKEN) != 36) {
        Alert("Invalid EA Token. Please set EA_TOKEN parameter.");
        return INIT_PARAMETERS_INCORRECT;
    }
    
    // Test API connection
    if(!TestConnection()) {
        Alert("Cannot connect to API. Check internet connection.");
        return INIT_FAILED;
    }
    
    // Start timers
    EventSetTimer(HEARTBEAT_INTERVAL);
    EventSetTimer(COMMAND_POLL_INTERVAL);
    
    Print("EA initialized successfully. Account: ", AccountInfoInteger(ACCOUNT_LOGIN));
    return INIT_SUCCEEDED;
}
```

---

## ✅ SUMMARY

**EA Authentication Flow:**

1. ✅ EA reads token from input parameter
2. ✅ EA sends heartbeat with token in header
3. ✅ Backend validates token and subscription
4. ✅ Backend updates account status
5. ✅ EA polls for commands every 1 second
6. ✅ EA executes commands in MT5
7. ✅ EA reports results in next heartbeat
8. ✅ Backend processes acknowledgments

**Key Features:**

- ✅ Token-based authentication (UUID)
- ✅ Subscription validation on every request
- ✅ Real-time heartbeat (2-3 seconds)
- ✅ Command polling (1 second)
- ✅ Automatic reconnection
- ✅ Error handling and logging
- ✅ Security measures (rate limiting, validation)

This protocol ensures secure, reliable communication between EA and backend while maintaining real-time synchronization.

