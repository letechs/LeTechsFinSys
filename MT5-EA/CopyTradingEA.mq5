//+------------------------------------------------------------------+
//|                                              CopyTradingEA.mq5 |
//|                        MT5 Copy Trading Expert Advisor          |
//|                                                                  |
//+------------------------------------------------------------------+
#property copyright "MT5 Copy Trading System"
#property version   "1.00"

#include "Config.mqh"
#include "HttpClient.mqh"
#include "Logger.mqh"

// Global functions for command execution tracking (called from CommandProcessor and TradeExecutor)
// Must be declared BEFORE includes so they're available to included files
void UpdateCommandExecutionStatus(string cmdType, string symbol, ulong ticket);
bool IsCommandExecuted(string commandId);
void MarkCommandExecuted(string commandId);

#include "CommandProcessor.mqh"
#include "TradeExecutor.mqh"

//--- Input parameters
input string BackendURL = "http://127.0.0.1:5000";  // Backend API URL (use IP if localhost doesn't work)
input string EAToken = "";                         // EA Token (from account settings)
input int    CommandPollInterval = 1;              // Command poll interval (seconds) - 1s for fastest execution
input int    HeartbeatInterval = 2;                 // Heartbeat interval (seconds) - 1-2s for real-time
input int    MaxRetries = 2;                       // Max retries for failed requests (reduced for faster failure)
input int    RetryDelay = 100;                     // Retry delay (milliseconds) - reduced from 1000ms
input bool   EnableLogging = true;                 // Enable logging
input string LogLevel = "INFO";                    // Log level: INFO, DEBUG, ERROR
input bool   ShowStatusPanel = true;               // Show status panel on chart
input string AccountRole = "auto";                 // For display only: master/slave/auto

//--- Global variables
CHttpClient* httpClient;
CCommandProcessor* commandProcessor;
CLogger* logger;

datetime lastCommandPoll = 0;
datetime lastHeartbeat = 0;
bool isInitialized = false;
string accountLogin;

// Status panel tracking
datetime lastPollAttempt = 0;
datetime lastPollSuccess = 0;
int      lastPollHttpCode = 0;
int      lastPollResponseLength = 0;
datetime lastHeartbeatAttempt = 0;
datetime lastHeartbeatSuccess = 0;
int      lastHeartbeatHttpCode = 0;
string   lastErrorMessage = "";

// Copy trading flow tracking (simplified - for status panel only)
datetime lastTradeSent = 0;           // Master: when trade was sent to backend
int      lastTradeCount = 0;          // Master: number of trades in last heartbeat
datetime lastCommandReceived = 0;    // Slave: when command was received from backend
int      lastCommandCount = 0;        // Slave: number of commands received
string   lastCommandType = "";        // Slave: last command type (BUY/SELL)
string   lastCommandSymbol = "";      // Slave: last command symbol
datetime lastCommandExecuted = 0;     // Slave: when command was executed (trade placed)
string   lastExecutedCommand = "";    // Slave: last executed command details

// Duplicate command prevention - track executed command IDs
#define MAX_EXECUTED_COMMANDS 1000
string executedCommandIds[MAX_EXECUTED_COMMANDS];
int executedCommandCount = 0;

// Implementation of UpdateCommandExecutionStatus (forward declared above)
void UpdateCommandExecutionStatus(string cmdType, string symbol, ulong ticket)
{
   lastCommandExecuted = TimeCurrent();
   lastExecutedCommand = cmdType + " " + symbol + " #" + IntegerToString((int)ticket);
}

// Duplicate command prevention functions (called from CommandProcessor)
bool IsCommandExecuted(string commandId)
{
   if(StringLen(commandId) == 0)
      return false;
   
   // Check if command ID is in executed list
   for(int i = 0; i < executedCommandCount; i++)
   {
      if(executedCommandIds[i] == commandId)
         return true;
   }
   return false;
}

void MarkCommandExecuted(string commandId)
{
   if(StringLen(commandId) == 0)
      return;
   
   // Check if already in list
   if(IsCommandExecuted(commandId))
      return;
   
   // Add to list (circular buffer - overwrite oldest if full)
   if(executedCommandCount >= MAX_EXECUTED_COMMANDS)
   {
      // Shift array left (remove oldest)
      for(int i = 0; i < MAX_EXECUTED_COMMANDS - 1; i++)
      {
         executedCommandIds[i] = executedCommandIds[i + 1];
      }
      executedCommandCount = MAX_EXECUTED_COMMANDS - 1;
   }
   
   executedCommandIds[executedCommandCount] = commandId;
   executedCommandCount++;
   
   if(logger != NULL)
   {
      // Command marked as executed
   }
}

// Initialize executedCommandIds from existing positions on startup
// This prevents duplicate trades when EA restarts
// NOTE: We don't mark commands as executed here because we don't know the actual command IDs.
// Instead, we rely on the backend to check for existing trades and prevent duplicates.
// This function is kept for logging/debugging purposes only.
void InitializeExecutedCommandsFromPositions()
{
   if(logger != NULL)
      logger.Info("Scanning existing positions on startup...");
   
   int totalPositions = PositionsTotal();
   int copiedPositionsCount = 0;
   
   for(int i = 0; i < totalPositions; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0)
         continue;
      
      if(!PositionSelectByTicket(ticket))
         continue;
      
      string comment = PositionGetString(POSITION_COMMENT);
      
      // Check if this is a copied position (has master ticket in comment)
      bool isCopiedPosition = false;
      long masterTicket = 0;
      
      // Try guaranteed format first: "COPY|MASTER_TICKET|XXXXX|"
      int masterTicketPos = StringFind(comment, "MASTER_TICKET|");
      if(masterTicketPos >= 0)
      {
         isCopiedPosition = true;
         masterTicketPos += StringLen("MASTER_TICKET|");
         string ticketStr = "";
         int j = masterTicketPos;
         while(j < StringLen(comment) && StringGetCharacter(comment, j) >= '0' && StringGetCharacter(comment, j) <= '9')
         {
            ticketStr += StringSubstr(comment, j, 1);
            j++;
         }
         if(StringLen(ticketStr) > 0)
            masterTicket = (long)StringToInteger(ticketStr);
      }
      // Fallback: Try backend format: "Ticket #YYYYY"
      else if(StringFind(comment, "Ticket #") >= 0 || StringFind(comment, "Copy from Master") >= 0)
      {
         isCopiedPosition = true;
         int ticketPos = StringFind(comment, "Ticket #");
         if(ticketPos >= 0)
         {
            ticketPos += StringLen("Ticket #");
            string ticketStr = "";
            int j = ticketPos;
            while(j < StringLen(comment) && StringGetCharacter(comment, j) >= '0' && StringGetCharacter(comment, j) <= '9')
            {
               ticketStr += StringSubstr(comment, j, 1);
               j++;
            }
            if(StringLen(ticketStr) > 0)
               masterTicket = (long)StringToInteger(ticketStr);
         }
      }
      
      if(isCopiedPosition)
      {
         copiedPositionsCount++;
         if(logger != NULL)
            logger.Info("Found copied position: Slave ticket " + IntegerToString((int)ticket) + 
                       (masterTicket > 0 ? " | Master ticket " + StringFormat("%lld", masterTicket) : " | Master ticket unknown") + 
                       " | Comment: " + comment);
      }
   }
   
   if(logger != NULL)
      logger.Info("Found " + IntegerToString(copiedPositionsCount) + " copied position(s) out of " + 
                 IntegerToString(totalPositions) + " total position(s)");
   
   // NOTE: We do NOT mark commands as executed here because:
   // 1. We don't know the actual command IDs (they're MongoDB ObjectIds from backend)
   // 2. The backend already checks for existing trades and prevents duplicates
   // 3. Marking fake command IDs would interfere with new command execution
}

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   // Initialize logger
   logger = new CLogger(EnableLogging, LogLevel);
   logger.Info("=== Copy Trading EA Initializing ===");
   
   // Validate EA Token
   if(StringLen(EAToken) == 0)
   {
      logger.Error("EA Token is required! Please set it in EA inputs.");
      return(INIT_PARAMETERS_INCORRECT);
   }
   
   // Get account login
   accountLogin = IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN));
   logger.Info("Account Login: " + accountLogin);
   
   // Initialize HTTP client
   httpClient = new CHttpClient(BackendURL, EAToken, MaxRetries, RetryDelay, logger);
   
   // Initialize command processor
   commandProcessor = new CCommandProcessor(httpClient, logger);
   commandProcessor.SetBackendInfo(BackendURL, EAToken);
   
   // Test backend connection (non-blocking - continue even if fails)
   if(!TestBackendConnection())
   {
      logger.Error("Backend connection test failed. EA will continue but may not work properly.");
      logger.Error("Please check: 1) Backend is running, 2) EA Token is correct, 3) URL is correct");
      // Don't fail initialization - allow EA to try again later
      // return(INIT_FAILED);
   }
   
   // CRITICAL: Initialize executedCommandIds from existing positions on startup
   // This prevents duplicate trades when EA restarts
   InitializeExecutedCommandsFromPositions();
   
   // Send initial heartbeat (this will also send existing positions to backend)
   SendHeartbeat();
   
   // Set up timer for periodic tasks
   EventSetTimer(1); // Check every second
   
   isInitialized = true;
   logger.Info("=== Copy Trading EA Initialized Successfully ===");
   
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   // Stop timer
   EventKillTimer();
   
   if(logger != NULL)
   {
      logger.Info("=== Copy Trading EA Shutting Down ===");
      logger.Info("Reason: " + IntegerToString(reason));
   }
   
   // Cleanup - delete in reverse order
   if(commandProcessor != NULL) 
   {
      delete commandProcessor;
      commandProcessor = NULL;
   }
   if(httpClient != NULL) 
   {
      delete httpClient;
      httpClient = NULL;
   }
   if(logger != NULL) 
   {
      delete logger;
      logger = NULL;
   }
}

//+------------------------------------------------------------------+
//| Expert tick function                                             |
//+------------------------------------------------------------------+
void OnTick()
{
   // OnTick is not used for polling - OnTimer handles it
   // This ensures commands are polled even when there are no price ticks
}

//+------------------------------------------------------------------+
//| Timer function                                                   |
//+------------------------------------------------------------------+
void OnTimer()
{
   // IMPORTANT: Use OnTimer instead of OnTick for reliable polling
   // OnTick only fires on price changes, which may be infrequent on higher timeframes
   // OnTimer fires every second, ensuring commands are polled consistently
   
   if(!isInitialized) return;
   
   datetime currentTime = TimeCurrent();
   
   // #region agent log
   if(logger != NULL)
   {
      string timerData = "{\"currentTime\":" + IntegerToString((int)currentTime);
      timerData += ",\"lastCommandPoll\":" + IntegerToString((int)lastCommandPoll);
      timerData += ",\"timeSinceLastPoll\":" + IntegerToString((int)(currentTime - lastCommandPoll));
      timerData += ",\"commandPollInterval\":" + IntegerToString(CommandPollInterval);
      timerData += "}";
      logger.DebugTiming("CopyTradingEA.mq5:OnTimer", "Timer tick - checking poll interval", currentTime, "H3", timerData);
   }
   // #endregion
   
   // Poll for commands and execute immediately (simplified - no queues)
   if(currentTime - lastCommandPoll >= CommandPollInterval)
   {
      // #region agent log
      if(logger != NULL)
         logger.DebugTiming("CopyTradingEA.mq5:OnTimer", "Starting PollCommands", currentTime, "H3", "");
      // #endregion
      PollCommands();
      lastCommandPoll = currentTime;
      // #region agent log
      if(logger != NULL)
         logger.DebugTiming("CopyTradingEA.mq5:OnTimer", "PollCommands completed, lastCommandPoll updated", currentTime, "H3", "");
      // #endregion
   }
   
   // Send heartbeat
   if(currentTime - lastHeartbeat >= HeartbeatInterval)
   {
      SendHeartbeat();
      lastHeartbeat = currentTime;
   }

   if(ShowStatusPanel)
      UpdateStatusPanel();
}

//+------------------------------------------------------------------+
//| Test backend connection                                          |
//+------------------------------------------------------------------+
bool TestBackendConnection()
{
   logger.Info("Testing backend connection...");
   
   string response = "";
   string url = "/api/ea/heartbeat";
   
   string headers = "Content-Type: application/json\r\n";
   
   string body = CreateHeartbeatBody();
   
   int result = httpClient.Post(url, headers, body, response);
   
   if(result == 200)
   {
      logger.Info("Backend connection successful. Response: " + response);
      return true;
   }
   else
   {
      string errorMsg = "Backend connection failed. HTTP Code: " + IntegerToString(result);
      if(result == 4060)
         errorMsg += " (URL NOT ALLOWED - Add " + BackendURL + " to MT5 WebRequest allowed URLs)";
      else if(result == 4014)
         errorMsg += " (Invalid URL format)";
      else if(result == 0)
         errorMsg += " (Connection failed - check backend is running)";
      errorMsg += " Response: " + response;
      logger.Error(errorMsg);
      return false;
   }
}

//+------------------------------------------------------------------+
//| Poll for pending commands                                         |
//+------------------------------------------------------------------+
void PollCommands()
{
   datetime pollStart = TimeCurrent();
   lastPollAttempt = pollStart;
   
   // #region agent log
   if(logger != NULL)
   {
      string pollData = "{\"pollStart\":" + IntegerToString((int)pollStart);
      pollData += ",\"lastCommandPoll\":" + IntegerToString((int)lastCommandPoll);
      pollData += "}";
      logger.DebugTiming("CopyTradingEA.mq5:PollCommands", "PollCommands entry", pollStart, "H1,H2,H3", pollData);
   }
   // #endregion
   
   string response = "";
   string url = "/api/ea/commands?limit=10";
   
   string headers = "";
   
   int result = httpClient.Get(url, headers, response);
   lastPollHttpCode = result;
   lastPollResponseLength = StringLen(response);
   
   if(result == 200)
   {
      lastPollSuccess = TimeCurrent();
      lastErrorMessage = "";
      
      // Track commands received (for slave account)
      // Check if response contains commands array with items
      // Response format: {"success":true,"commands":[{...},{...}]}
      int cmdCount = 0;
      int commandsArrayPos = StringFind(response, "\"commands\":[");
      if(commandsArrayPos >= 0)
      {
         // Check if array is not empty (has content after "[")
         int arrayStart = commandsArrayPos + 11; // After "commands":[
         int arrayEnd = StringFind(response, "]", arrayStart);
         if(arrayEnd > arrayStart)
         {
            string arrayContent = StringSubstr(response, arrayStart, arrayEnd - arrayStart);
            StringTrimLeft(arrayContent);
            StringTrimRight(arrayContent);
            
            // If array has content (not empty), count commands
            if(StringLen(arrayContent) > 0)
            {
               // Count commandType occurrences (each command has one)
               int searchPos = 0;
               while((searchPos = StringFind(response, "\"commandType\"", searchPos)) >= 0)
               {
                  cmdCount++;
                  searchPos += 13; // Move past "commandType"
               }
            }
         }
      }
      
      if(cmdCount > 0)
      {
         lastCommandReceived = TimeCurrent();
         lastCommandCount = cmdCount;
         // Extract first command details for display
         int cmdTypePos = StringFind(response, "\"commandType\":\"");
         if(cmdTypePos >= 0)
         {
            int cmdTypeStart = cmdTypePos + 15; // After "commandType":"
            int cmdTypeEnd = StringFind(response, "\"", cmdTypeStart);
            if(cmdTypeEnd > cmdTypeStart)
            {
               lastCommandType = StringSubstr(response, cmdTypeStart, cmdTypeEnd - cmdTypeStart);
            }
         }
         int symbolPos = StringFind(response, "\"symbol\":\"");
         if(symbolPos >= 0)
         {
            int symbolStart = symbolPos + 10; // After "symbol":"
            int symbolEnd = StringFind(response, "\"", symbolStart);
            if(symbolEnd > symbolStart)
            {
               lastCommandSymbol = StringSubstr(response, symbolStart, symbolEnd - symbolStart);
            }
         }
      }
      else
      {
         // Log when no commands found for debugging
         if(logger != NULL)
         {
            logger.Debug("No commands in response. Response: " + response);
         }
      }
      
      // #region agent log
      datetime processStart = TimeCurrent();
      if(logger != NULL)
         logger.DebugTiming("CopyTradingEA.mq5:PollCommands", "Starting ProcessCommands", processStart, "H1,H2", "");
      // #endregion
      
      // Execute commands immediately (simplified - no queues)
      commandProcessor.ProcessCommands(response);
      
      datetime processEnd = TimeCurrent();
      
      // #region agent log
      if(logger != NULL)
      {
         string processData = "{\"processStart\":" + IntegerToString((int)processStart);
         processData += ",\"processEnd\":" + IntegerToString((int)processEnd);
         processData += ",\"processDuration\":" + IntegerToString((int)(processEnd - processStart));
         processData += "}";
         logger.DebugTiming("CopyTradingEA.mq5:PollCommands", "ProcessCommands completed", processEnd, "H1,H2", processData);
      }
      // #endregion
   }
   else if(result != 0)
   {
      string errorMsg = "Failed to poll commands. HTTP Code: " + IntegerToString(result);
      if(result == 4060 || result == 1001 || result == 1003)
      {
         errorMsg += " (URL BLOCKED - Check: 1) URL in allowed list, 2) Restart MT5 after adding URL, 3) Backend running)";
         errorMsg += "\n   If URL is already in list, RESTART MT5 completely";
      }
      else if(result == 4014)
         errorMsg += " (Invalid URL format)";
      else if(result == 0)
         errorMsg += " (Connection failed - Backend not running)";
      else if(result == 401)
      {
         errorMsg += " (Authentication failed or Database unavailable)";
         errorMsg += "\n   FIX: 1) Check backend MongoDB connection";
         errorMsg += "\n        2) Verify EA Token is correct";
         errorMsg += "\n        3) Check backend logs for database errors";
      }
      errorMsg += " Response: " + response;
      logger.Error(errorMsg);
      lastErrorMessage = errorMsg;
   }
}

//+------------------------------------------------------------------+
//| Send heartbeat to backend                                         |
//+------------------------------------------------------------------+
void SendHeartbeat()
{
   lastHeartbeatAttempt = TimeCurrent();

   if(logger != NULL)
      logger.Debug("FLOW-0 EA SENDING HEARTBEAT...");
   
   string response = "";
   string url = "/api/ea/heartbeat";
   
   string headers = "Content-Type: application/json\r\n";
   
   string body = CreateHeartbeatBody();
   if(logger != NULL)
      logger.Debug("Heartbeat body: " + body);
   
   // Track trades being sent (ONLY for master account - determined by backend)
   // We can't determine master/slave in EA, so track for all accounts
   // The status panel will only show this for master accounts
   int currentTradeCount = PositionsTotal();
   if(currentTradeCount > 0)
   {
      lastTradeSent = TimeCurrent();
      lastTradeCount = currentTradeCount;
   }
   
   int result = httpClient.Post(url, headers, body, response);
   lastHeartbeatHttpCode = result;
   
   if(result == 200)
   {
      logger.Debug("Heartbeat sent successfully. Response: " + response);
      lastHeartbeatSuccess = TimeCurrent();
      lastErrorMessage = "";
   }
   else
   {
      string errorMsg = "Failed to send heartbeat. HTTP Code: " + IntegerToString(result);
      if(result == 4060 || result == 1001 || result == 1003)
      {
         errorMsg += " (URL BLOCKED)";
         errorMsg += "\n   FIX: 1) Verify URL '" + BackendURL + "' is in MT5 allowed list";
         errorMsg += "\n        2) RESTART MT5 completely (close all windows)";
         errorMsg += "\n        3) Verify backend is running on " + BackendURL;
         errorMsg += "\n        4) Reattach EA after restart";
      }
      else if(result == 4014)
         errorMsg += " (Invalid URL format - check BackendURL input)";
      else if(result == 0)
         errorMsg += " (Connection failed - Backend not running on " + BackendURL + ")";
      else if(result == 401)
      {
         errorMsg += " (Authentication failed or Database unavailable)";
         errorMsg += "\n   FIX: 1) Check backend MongoDB connection";
         errorMsg += "\n        2) Verify EA Token is correct";
         errorMsg += "\n        3) Check backend logs for database errors";
      }
      else
         errorMsg += " (Check backend server status)";
      errorMsg += " Response: " + response;
      logger.Error(errorMsg);
      lastErrorMessage = errorMsg;
   }
}

//+------------------------------------------------------------------+
//| Create heartbeat request body                                    |
//+------------------------------------------------------------------+
string CreateHeartbeatBody()
{
   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   double margin = AccountInfoDouble(ACCOUNT_MARGIN);
   double freeMargin = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
   double marginLevel = 0.0;
   
   // Calculate margin level (equity / margin * 100, or 0 if margin is 0)
   if(margin > 0.0)
      marginLevel = (equity / margin) * 100.0;
   
   // Build JSON body carefully to avoid parsing errors
   string body = "{";
   body += "\"balance\":" + DoubleToString(balance, 2);
   body += ",\"equity\":" + DoubleToString(equity, 2);
   body += ",\"margin\":" + DoubleToString(margin, 2);
   body += ",\"freeMargin\":" + DoubleToString(freeMargin, 2);
   body += ",\"marginLevel\":" + DoubleToString(marginLevel, 2);
   
   // Collect and format open trades
   body += ",\"openTrades\":[";
   string tradesJson = CollectOpenTrades();
   body += tradesJson;
   body += "]";
   
   body += "}";
   
   // Ensure no trailing whitespace or extra characters
   StringTrimLeft(body);
   StringTrimRight(body);
   
   return body;
}

//+------------------------------------------------------------------+
//| Collect all open positions and format as JSON array              |
//+------------------------------------------------------------------+
string CollectOpenTrades()
{
   string tradesJson = "";
   int totalPositions = PositionsTotal();
   
   if(logger != NULL)
      logger.Debug("Collecting open trades. Total positions: " + IntegerToString(totalPositions));
   
   if(totalPositions == 0)
   {
      // Return empty array
      return "";
   }
   
   // Iterate through all positions
   for(int i = 0; i < totalPositions; i++)
   {
      // Select position by index
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0)
      {
         if(logger != NULL)
            logger.Debug("Failed to get ticket for position index " + IntegerToString(i));
         continue;
      }
      
      // Get position properties
      string symbol = PositionGetString(POSITION_SYMBOL);
      long positionType = PositionGetInteger(POSITION_TYPE);
      double volume = PositionGetDouble(POSITION_VOLUME);
      double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
      double sl = PositionGetDouble(POSITION_SL);
      double tp = PositionGetDouble(POSITION_TP);
      
      // Convert position type to string (BUY or SELL)
      string typeStr = "";
      if(positionType == POSITION_TYPE_BUY)
         typeStr = "BUY";
      else if(positionType == POSITION_TYPE_SELL)
         typeStr = "SELL";
      else
      {
         if(logger != NULL)
            logger.Debug("Unknown position type: " + IntegerToString(positionType) + " for ticket " + IntegerToString(ticket));
         continue; // Skip unknown types
      }
      
      // Build trade JSON object
      if(StringLen(tradesJson) > 0)
         tradesJson += ","; // Add comma separator for multiple trades
      
      string comment = PositionGetString(POSITION_COMMENT);
      
      tradesJson += "{";
      tradesJson += "\"ticket\":" + IntegerToString(ticket);
      tradesJson += ",\"symbol\":\"" + symbol + "\"";
      tradesJson += ",\"type\":\"" + typeStr + "\"";
      tradesJson += ",\"volume\":" + DoubleToString(volume, 2);
      tradesJson += ",\"openPrice\":" + DoubleToString(openPrice, 5);
      
      // Add SL if set (not zero)
      if(sl > 0.0)
         tradesJson += ",\"sl\":" + DoubleToString(sl, 5);
      
      // Add TP if set (not zero)
      if(tp > 0.0)
         tradesJson += ",\"tp\":" + DoubleToString(tp, 5);
      
      // CRITICAL: Include comment in heartbeat so backend can check for existing trades
      if(StringLen(comment) > 0)
         tradesJson += ",\"comment\":\"" + comment + "\"";
      
      tradesJson += "}";
      
      if(logger != NULL)
         logger.Debug("Collected trade: Ticket=" + IntegerToString(ticket) + 
                     ", Symbol=" + symbol + 
                     ", Type=" + typeStr + 
                     ", Volume=" + DoubleToString(volume, 2));
   }
   
   return tradesJson;
}

//+------------------------------------------------------------------+

string FormatAgo(datetime ts)
{
   if(ts == 0)
      return "never";
   int seconds = (int)(TimeCurrent() - ts);
   if(seconds < 0) seconds = 0;
   return IntegerToString(seconds) + "s ago";
}

string Shorten(string text, int maxLen)
{
   if(StringLen(text) <= maxLen)
      return text;
   return StringSubstr(text, 0, maxLen - 3) + "...";
}

string DetermineRole()
{
   string role = AccountRole;
   StringToLower(role); // mutates role in-place
   if(role == "master" || role == "slave")
      return role;
   return "auto";
}

void UpdateStatusPanel()
{
   string role = DetermineRole();
   string status = "";
   status += "COPY TRADING STATUS (" + role + ")\n";
   status += "Login: " + accountLogin + "\n";
   status += "Heartbeat: " + FormatAgo(lastHeartbeatSuccess) + " (HTTP " + IntegerToString(lastHeartbeatHttpCode) + ")\n";
   status += "Poll: " + FormatAgo(lastPollSuccess) + " (HTTP " + IntegerToString(lastPollHttpCode) + ", " + IntegerToString(lastPollResponseLength) + " bytes)\n";
   
   // Master account: show trades sent (only if role is explicitly "master")
   // For "auto" or "slave", don't show trade sent (slave doesn't send trades)
   if(role == "master")
   {
      if(lastTradeSent > 0)
      {
         status += "Trade sent: " + FormatAgo(lastTradeSent) + " (" + IntegerToString(lastTradeCount) + " trade(s))\n";
      }
      else
      {
         status += "Trade sent: never\n";
      }
   }
   
   // Slave account: show commands received and executed (only if role is explicitly "slave" or "auto")
   // For "master", don't show command tracking
   if(role == "slave" || (role == "auto" && lastCommandReceived > 0))
   {
      if(lastCommandReceived > 0)
      {
         status += "Command received: " + FormatAgo(lastCommandReceived);
         if(lastCommandCount > 0)
            status += " (" + IntegerToString(lastCommandCount) + " cmd(s))";
         if(StringLen(lastCommandType) > 0 && StringLen(lastCommandSymbol) > 0)
            status += "\n  Last: " + lastCommandType + " " + lastCommandSymbol;
         status += "\n";
      }
      else
      {
         // Show last poll response size to help debug
         status += "Command received: never";
         if(lastPollResponseLength > 0)
            status += " (last poll: " + IntegerToString(lastPollResponseLength) + " bytes)";
         status += "\n";
      }
      
      if(lastCommandExecuted > 0)
      {
         status += "Command executed: " + FormatAgo(lastCommandExecuted);
         if(StringLen(lastExecutedCommand) > 0)
            status += "\n  Last: " + lastExecutedCommand;
         status += "\n";
      }
      else
      {
         status += "Command executed: never\n";
      }
   }
   
   status += "Last error: " + (StringLen(lastErrorMessage) > 0 ? Shorten(lastErrorMessage, 120) : "none");
   Comment(status);
}

