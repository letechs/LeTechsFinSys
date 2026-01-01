# MT5 Expert Advisor (EA) Specification

## 📋 **Overview**

This document specifies the requirements for the MT5 Expert Advisor that will:
1. **Connect to the backend API** to receive copy trading commands
2. **Execute trades** on slave accounts based on master account signals
3. **Send trade updates** back to the backend
4. **Handle authentication** using EA tokens

---

## 🎯 **Core Functionality**

### **1. Authentication & Connection**
- Use EA Token (provided when creating MT5 account) for authentication
- Connect to backend API at: `http://localhost:5000` (configurable)
- Send heartbeat/ping every 30 seconds to maintain connection
- Handle connection errors gracefully (retry with exponential backoff)

### **2. Command Polling**
- Poll backend every 5-10 seconds for pending commands
- Endpoint: `GET /api/commands/pending?accountId={loginId}`
- Authenticate using EA Token in headers
- Process commands in priority order

### **3. Trade Execution**
Execute the following command types (based on actual backend API):

#### **3.1 BUY Order**
```json
{
  "commandType": "BUY",
  "symbol": "EURUSD",
  "volume": 0.01,
  "orderType": "MARKET",
  "price": 1.0850,  // optional, for pending orders
  "sl": 1.0800,  // Stop Loss (optional)
  "tp": 1.0900,  // Take Profit (optional)
  "comment": "Copy from Master #12345",
  "magicNumber": 12345
}
```

**EA Action:**
- If `orderType` is "MARKET": Open market BUY order
- If `orderType` is "LIMIT" or "STOP": Open pending order
- Set SL and TP if provided
- Use magicNumber to identify copied trades
- Add comment to identify copied trade
- Send execution result back to backend

#### **3.2 SELL Order**
```json
{
  "commandType": "SELL",
  "symbol": "EURUSD",
  "volume": 0.01,
  "orderType": "MARKET",
  "price": 1.0850,
  "sl": 1.0900,
  "tp": 1.0800,
  "comment": "Copy from Master #12345",
  "magicNumber": 12345
}
```

**EA Action:**
- Same as BUY but for SELL direction
- Open market or pending SELL order
- Set SL and TP
- Report result

#### **3.3 CLOSE Order**
```json
{
  "commandType": "CLOSE",
  "ticket": 12345678
}
```

**EA Action:**
- Find order by ticket number
- Close the order
- Send confirmation back with result

#### **3.4 MODIFY Order**
```json
{
  "commandType": "MODIFY",
  "modifyTicket": 12345678,
  "newSl": 1.0800,
  "newTp": 1.0900
}
```

**EA Action:**
- Find order by `modifyTicket`
- Modify SL to `newSl` and/or TP to `newTp`
- Send confirmation back

#### **3.5 CLOSE_ALL Orders**
```json
{
  "commandType": "CLOSE_ALL"
}
```

**EA Action:**
- Close all open positions
- Send confirmation back

### **4. Trade Reporting**
- Send trade updates to backend when:
  - Order is opened successfully
  - Order is closed (manually or by SL/TP)
  - Order is modified
  - Order execution fails
  - Error occurs

**Endpoint:** `POST /api/webhooks/mt5/trade-update`

**Payload:**
```json
{
  "accountId": "123456",
  "eaToken": "token-here",
  "eventType": "ORDER_OPENED" | "ORDER_CLOSED" | "ORDER_MODIFIED" | "ORDER_FAILED",
  "ticket": 12345678,
  "symbol": "EURUSD",
  "orderType": "BUY",
  "volume": 0.01,
  "openPrice": 1.0850,
  "closePrice": 1.0900,  // if closed
  "sl": 1.0800,
  "tp": 1.0900,
  "profit": 50.00,  // if closed
  "comment": "Copy from Master #12345",
  "error": "Error message if failed"
}
```

### **5. Heartbeat/Ping**
- Send heartbeat every 30 seconds
- Endpoint: `POST /api/ea/heartbeat`
- Include account info: loginId, balance, equity, margin, connection status

**Payload:**
```json
{
  "accountId": "123456",
  "eaToken": "token-here",
  "balance": 10000.00,
  "equity": 10050.00,
  "margin": 500.00,
  "freeMargin": 9550.00,
  "connectionStatus": "online"
}
```

---

## 🔧 **Technical Requirements**

### **Input Parameters (EA Settings)**
```
- BackendURL: "http://localhost:5000" (or production URL)
- EAToken: "your-ea-token-here" (from account settings)
- CommandPollInterval: 5 (seconds)
- HeartbeatInterval: 30 (seconds)
- MaxRetries: 3
- RetryDelay: 1000 (milliseconds)
- EnableLogging: true
- LogLevel: "INFO" | "DEBUG" | "ERROR"
```

### **Error Handling**
- **Network Errors:**
  - Retry with exponential backoff (1s, 2s, 4s)
  - Log errors to EA log
  - Continue polling even if one request fails

- **Trade Execution Errors:**
  - Send error details to backend
  - Log error locally
  - Don't crash EA - continue processing

- **Authentication Errors:**
  - Log error
  - Stop trading (safety measure)
  - Alert user to check EA token

### **Safety Features**
- **Account Validation:**
  - Verify account login matches expected account
  - Prevent trading on wrong account

- **Risk Limits:**
  - Check free margin before opening orders
  - Respect account margin requirements
  - Don't exceed maximum lot size (if configured)

- **Symbol Validation:**
  - Verify symbol exists and is tradeable
  - Check market hours
  - Handle symbol not found errors

---

## 📡 **API Integration Details**

### **Base URL**
- Development: `http://localhost:5000`
- Production: Configurable via EA settings

### **Authentication**
- Header: `X-EA-Token: {eaToken}`
- Or: `Authorization: Bearer {eaToken}`

### **Endpoints Used**

#### **1. Get Pending Commands** ✅ (EXISTS)
```
GET /api/ea/commands?limit=10
Headers: X-EA-Token: {token}
Response: {
  "success": true,
  "commands": [
    {
      "_id": "command-id",
      "commandType": "BUY" | "SELL" | "CLOSE" | "MODIFY",
      "symbol": "EURUSD",
      "volume": 0.01,
      "orderType": "MARKET",
      "price": 1.0850,
      "sl": 1.0800,
      "tp": 1.0900,
      "ticket": 12345678,  // for CLOSE/MODIFY
      "modifyTicket": 12345678,  // for MODIFY
      "newSl": 1.0800,  // for MODIFY
      "newTp": 1.0900,  // for MODIFY
      "comment": "Copy from Master",
      "magicNumber": 12345,
      "priority": 1,
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

#### **2. Update Command Status** ⚠️ (NEEDS TO BE CREATED)
**Note:** This endpoint doesn't exist yet. You'll need to create it or use an alternative method.

**Option A - Create new endpoint:**
```
PATCH /api/ea/commands/{commandId}/status
Headers: X-EA-Token: {token}
Body: {
  "status": "executed" | "failed",
  "executionResult": {
    "success": true,
    "orderTicket": 12345678,  // if executed
    "error": "error message",  // if failed
    "errorCode": 10004  // MT5 error code
  }
}
```

**Option B - Use existing command update (if available):**
Check if there's a way to update commands via existing endpoints.

#### **3. Send Heartbeat** ✅ (EXISTS)
```
POST /api/ea/heartbeat
Headers: X-EA-Token: {token}
Body: {
  "balance": 10000.00,
  "equity": 10050.00,
  "margin": 500.00,
  "freeMargin": 9550.00,
  "connectionStatus": "online"
}
Response: {
  "success": true,
  "message": "Heartbeat received",
  "accountStatus": "online",
  "serverTime": "2024-01-15T10:30:00Z"
}
```

#### **4. Send Trade Update** ⚠️ (NEEDS TO BE CREATED)
**Note:** This endpoint doesn't exist yet. This is for reporting trades back to backend.

```
POST /api/webhooks/mt5/trade-update
Headers: X-EA-Token: {token}
Body: {
  "eventType": "ORDER_OPENED" | "ORDER_CLOSED" | "ORDER_MODIFIED" | "ORDER_FAILED",
  "ticket": 12345678,
  "symbol": "EURUSD",
  "orderType": "BUY",
  "volume": 0.01,
  "openPrice": 1.0850,
  "closePrice": 1.0900,  // if closed
  "sl": 1.0800,
  "tp": 1.0900,
  "profit": 50.00,  // if closed
  "comment": "Copy from Master #12345",
  "error": "Error message if failed"
}
```

---

## 🏗️ **EA Architecture**

### **Main Components**

1. **Initialization (OnInit)**
   - Validate EA token
   - Test backend connection
   - Get account information
   - Start timers

2. **Command Polling Timer**
   - Every 5-10 seconds:
     - Fetch pending commands
     - Process each command
     - Update command status

3. **Heartbeat Timer**
   - Every 30 seconds:
     - Send account status to backend
     - Verify connection

4. **Trade Execution Functions**
   - `ExecuteOpenOrder()` - Open new trade
   - `ExecuteCloseOrder()` - Close existing trade
   - `ExecuteModifyOrder()` - Modify SL/TP
   - `ExecuteDeleteOrder()` - Delete pending order

5. **HTTP Communication**
   - `SendHTTPRequest()` - Generic HTTP function
   - `GetPendingCommands()` - Fetch commands
   - `UpdateCommandStatus()` - Report execution
   - `SendHeartbeat()` - Send ping
   - `SendTradeUpdate()` - Report trade events

6. **Error Handling**
   - `HandleNetworkError()` - Retry logic
   - `HandleTradeError()` - Log and report
   - `ValidateAccount()` - Safety checks

---

## 📝 **MQL5 Code Structure**

### **Suggested File Organization**

```
CopyTradingEA/
├── CopyTradingEA.mq5          (Main EA file)
├── Config.mqh                  (Configuration constants)
├── HttpClient.mqh              (HTTP communication)
├── CommandProcessor.mqh        (Command execution)
├── TradeExecutor.mqh          (Trade operations)
├── ErrorHandler.mqh           (Error handling)
└── Logger.mqh                 (Logging utilities)
```

### **Key Functions Needed**

```mql5
// Main EA
void OnInit()
void OnDeinit()
void OnTimer()

// HTTP Communication
bool SendHTTPRequest(string url, string method, string headers, string body, string &response)
bool GetPendingCommands()
bool UpdateCommandStatus(string commandId, string status, string result)
bool SendHeartbeat()
bool SendTradeUpdate(string eventType, ...)

// Command Processing
void ProcessCommand(Command command)
bool ExecuteOpenOrder(CommandData data)
bool ExecuteCloseOrder(int ticket)
bool ExecuteModifyOrder(int ticket, double sl, double tp)
bool ExecuteDeleteOrder(int ticket)

// Utilities
bool ValidateAccount()
bool CheckSymbol(string symbol)
void Log(string message, int level)
```

---

## 🔐 **Security Considerations**

1. **EA Token Protection**
   - Store token securely (not in source code)
   - Use input parameter (user enters in EA settings)
   - Never log token in plain text

2. **Account Verification**
   - Verify account login matches expected
   - Prevent unauthorized trading

3. **Network Security**
   - Use HTTPS in production (if available)
   - Validate SSL certificates
   - Handle certificate errors appropriately

4. **Error Messages**
   - Don't expose sensitive info in logs
   - Sanitize error messages before sending

---

## 📊 **Logging Requirements**

### **Log Levels**
- **INFO:** Normal operations (heartbeat sent, command received)
- **DEBUG:** Detailed information (HTTP requests, responses)
- **ERROR:** Errors and failures (network errors, trade failures)
- **WARNING:** Warnings (retries, connection issues)

### **What to Log**
- EA initialization and shutdown
- Command received and executed
- Trade execution results
- Network errors and retries
- Authentication failures
- Account status changes

### **Log Format**
```
[2024-01-15 10:30:45] [INFO] EA initialized successfully
[2024-01-15 10:30:50] [INFO] Command received: OPEN_ORDER for EURUSD
[2024-01-15 10:30:51] [INFO] Trade opened: Ticket #12345678
[2024-01-15 10:30:52] [ERROR] Failed to send update: Network timeout
```

---

## ✅ **Testing Checklist**

### **Unit Tests**
- [ ] HTTP request/response handling
- [ ] Command parsing
- [ ] Trade execution functions
- [ ] Error handling logic

### **Integration Tests**
- [ ] Connect to backend API
- [ ] Receive and execute commands
- [ ] Send trade updates
- [ ] Handle network failures
- [ ] Authentication flow

### **Manual Testing**
- [ ] EA starts and connects
- [ ] Commands are received and executed
- [ ] Trades open/close correctly
- [ ] Heartbeat works
- [ ] Error handling works
- [ ] Logs are readable

---

## 🚀 **Deployment Steps**

1. **Compile EA**
   - Use MetaEditor to compile MQL5 code
   - Fix any compilation errors
   - Generate .ex5 file

2. **Configure EA**
   - Add EA to MT5 chart
   - Enter EA Token from account settings
   - Set backend URL
   - Configure intervals

3. **Test Connection**
   - Check EA logs for connection status
   - Verify heartbeat is being sent
   - Test with a small trade command

4. **Monitor**
   - Watch EA logs
   - Check backend for received heartbeats
   - Verify commands are being executed

---

## 📚 **Additional Notes**

### **MQL5 HTTP Limitations**
- MT5 has built-in `WebRequest()` function
- Requires adding URLs to allowed list in MT5 settings
- May need to enable "Allow WebRequest for listed URL" in Tools → Options → Expert Advisors

### **Alternative Approaches**
- If HTTP is problematic, consider:
  - File-based communication (EA writes files, backend reads)
  - Database polling (EA writes to shared DB)
  - WebSocket (if MT5 supports it)

### **Performance Considerations**
- Don't poll too frequently (5-10 seconds is reasonable)
- Batch multiple commands if possible
- Use async operations where available
- Minimize logging in production

---

## 🎯 **Success Criteria**

The EA is considered complete when:
1. ✅ Successfully connects to backend
2. ✅ Receives and executes commands correctly
3. ✅ Sends trade updates reliably
4. ✅ Handles errors gracefully
5. ✅ Maintains connection with heartbeat
6. ✅ Logs are clear and useful
7. ✅ Can run 24/7 without crashing

---

## 📞 **Next Steps**

1. **Review this specification**
2. **Decide on implementation approach:**
   - Create MQL5 code yourself
   - Use ChatGPT with this spec
   - Have me create it (I can help with structure)
3. **Test with backend API**
4. **Iterate based on results**

---

## 📌 **IMPORTANT NOTES**

### **Backend Endpoints Status**

✅ **Already Implemented:**
- `GET /api/ea/commands` - Get pending commands
- `POST /api/ea/heartbeat` - Send heartbeat
- EA Authentication via `X-EA-Token` header

⚠️ **Need to be Created:**
- `PATCH /api/ea/commands/{commandId}/status` - Update command execution status
- `POST /api/webhooks/mt5/trade-update` - Report trade events (optional but recommended)

**Recommendation:** Create these endpoints before implementing the EA, or implement them in parallel.

### **Alternative Approach (If endpoints not ready):**
- EA can still poll for commands and execute them
- Command status updates can be handled via heartbeat (include executed command IDs)
- Trade updates can be sent via heartbeat payload

---

## 🎯 **Quick Start Guide**

### **For ChatGPT/AI Code Generation:**

1. **Copy this entire specification**
2. **Provide to ChatGPT with prompt:**
   ```
   Create an MQL5 Expert Advisor based on this specification:
   [paste MT5-EA-SPECIFICATION.md content]
   ```

3. **Or use this prompt:**
   ```
   I need an MT5 Expert Advisor that:
   - Connects to backend API at http://localhost:5000
   - Authenticates using X-EA-Token header
   - Polls GET /api/ea/commands every 5 seconds
   - Executes BUY, SELL, CLOSE, MODIFY commands
   - Sends heartbeat to POST /api/ea/heartbeat every 30 seconds
   - Handles errors gracefully
   - Uses EA Token from input parameters
   ```

### **For Manual Development:**

1. Start with basic HTTP communication
2. Add authentication
3. Implement command polling
4. Add trade execution functions
5. Add error handling
6. Add logging
7. Test incrementally

---

*This specification can be used as a reference for creating the MT5 EA or shared with ChatGPT/other AI tools to generate the MQL5 code.*

