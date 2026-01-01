# MT5 Copy Trading Expert Advisor

Complete MQL5 Expert Advisor for the MT5 Copy Trading system.

## 📁 Files

- `CopyTradingEA.mq5` - Main EA file
- `Config.mqh` - Configuration constants
- `HttpClient.mqh` - HTTP communication
- `CommandProcessor.mqh` - Command processing
- `TradeExecutor.mqh` - Trade execution
- `Logger.mqh` - Logging utility

## 🚀 Installation

1. **Copy files to MT5:**
   - Copy all files to: `MetaTrader 5/MQL5/Experts/CopyTradingEA/`

2. **Enable WebRequest in MT5:**
   - Open MT5 → Tools → Options → Expert Advisors
   - Check "Allow WebRequest for listed URL"
   - Add your backend URL (e.g., `http://localhost:5000`)

3. **Compile:**
   - Open MetaEditor
   - Open `CopyTradingEA.mq5`
   - Press F7 or click Compile
   - Fix any errors if needed

4. **Attach to Chart:**
   - Drag EA to any chart
   - Configure parameters:
     - `BackendURL`: Your backend URL (e.g., `http://localhost:5000`)
     - `EAToken`: EA Token from account settings
     - `CommandPollInterval`: 5 (seconds)
     - `HeartbeatInterval`: 30 (seconds)
   - Click OK

## ⚙️ Configuration

### Input Parameters:

- **BackendURL**: Backend API URL (default: `http://localhost:5000`)
- **EAToken**: EA Token from your account settings (REQUIRED)
- **CommandPollInterval**: How often to poll for commands (seconds, default: 5)
- **HeartbeatInterval**: How often to send heartbeat (seconds, default: 30)
- **MaxRetries**: Maximum retry attempts for failed requests (default: 3)
- **RetryDelay**: Delay between retries in milliseconds (default: 1000)
- **EnableLogging**: Enable/disable logging (default: true)
- **LogLevel**: Log level - INFO, DEBUG, or ERROR (default: INFO)

## 🔧 How It Works

### For Slave Accounts:

1. **Polls for Commands:**
   - Every 5 seconds, EA polls `GET /api/ea/commands`
   - Receives pending commands from backend

2. **Executes Commands:**
   - BUY: Opens buy order
   - SELL: Opens sell order
   - CLOSE: Closes order by ticket
   - MODIFY: Modifies SL/TP

3. **Reports Status:**
   - Updates command status: `PATCH /api/ea/commands/:id/status`
   - Reports trade events: `POST /api/webhooks/mt5/trade-update`

4. **Sends Heartbeat:**
   - Every 30 seconds sends account status

### For Master Accounts:

1. **Monitors Trades:**
   - EA should monitor open positions
   - When trade opens/closes, send webhook

2. **Sends Trade Updates:**
   - `POST /api/webhooks/mt5/trade-update` with eventType:
     - `ORDER_OPENED` - When trade opens
     - `ORDER_CLOSED` - When trade closes
     - `ORDER_MODIFIED` - When SL/TP modified

3. **Sends Heartbeat:**
   - Every 30 seconds sends account status

## 📝 Notes

### Important:

1. **EA Token:** Must be set correctly from account settings
2. **WebRequest:** Must be enabled in MT5 settings
3. **Network:** Backend must be accessible from MT5 terminal
4. **Symbols:** Make sure symbols exist and are tradeable

### Limitations:

- JSON parsing is simplified (may need enhancement for complex responses)
- Error handling is basic (can be improved)
- Does not handle pending orders yet (only market orders)

## 🐛 Troubleshooting

### EA Not Connecting:

1. Check EA Token is correct
2. Check BackendURL is accessible
3. Check WebRequest is enabled in MT5
4. Check firewall/antivirus settings

### Commands Not Executing:

1. Check EA logs (View → Experts tab)
2. Verify account has sufficient margin
3. Check symbol is tradeable
4. Verify lot size is within limits

### Trade Updates Not Sending:

1. Check network connection
2. Verify backend endpoint is correct
3. Check EA logs for errors

## 📚 API Endpoints Used

- `GET /api/ea/commands` - Get pending commands
- `PATCH /api/ea/commands/:id/status` - Update command status
- `POST /api/ea/heartbeat` - Send heartbeat
- `POST /api/webhooks/mt5/trade-update` - Report trade events

All endpoints require `X-EA-Token` header.

## 🔄 Next Steps

1. Test with demo account first
2. Monitor logs for errors
3. Verify commands are received and executed
4. Check backend logs for trade updates
5. Test with real account when ready

---

*For backend API documentation, see `MT5-EA-SPECIFICATION.md`*

