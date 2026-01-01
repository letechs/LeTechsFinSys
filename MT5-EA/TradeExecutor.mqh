//+------------------------------------------------------------------+
//| TradeExecutor.mqh - executes trades locally                      |
//+------------------------------------------------------------------+

#include <Trade\Trade.mqh>
#include "Logger.mqh"
#include "HttpClient.mqh"

class CTradeExecutor
{
private:
   CTrade      m_trade;
   CLogger     *m_logger;
   CHttpClient *m_http;
   string      m_backendUrl;
   string      m_eaToken;
   ulong       m_magicNumber;
   
   // Acknowledgment removed - causes blocking issues
   // Backend will mark commands as executed based on polling or timeout
   void AcknowledgeCommand(string commandId, bool success, ulong ticket = 0, string error = "")
   {
      // DISABLED: Acknowledgment causes 4-minute blocking issues
      // The backend can detect executed trades through polling or timeout
      if(m_logger != NULL)
         // Acknowledgment disabled
      return;
   }
   
public:
   CTradeExecutor(CLogger *tradeLogger)
   {
      m_logger = tradeLogger;
      m_http = NULL;
      m_backendUrl = "";
      m_eaToken = "";
      m_magicNumber = 123456; // Magic number for copied trades
      
      // Set trade parameters
      m_trade.SetExpertMagicNumber(m_magicNumber);
      m_trade.SetDeviationInPoints(10);
      m_trade.SetTypeFilling(ORDER_FILLING_FOK);
   }
   
   ~CTradeExecutor()
   {
      m_logger = NULL;
      m_http = NULL;
   }
   
   void SetBackendInfo(string backendUrl, string eaToken)
   {
      m_backendUrl = backendUrl;
      m_eaToken = eaToken;
   }
   
   void SetHttpClient(CHttpClient *httpClientPtr)
   {
      m_http = httpClientPtr;
   }
   
   void SetMagic(ulong magic)
   {
      m_magicNumber = magic;
      m_trade.SetExpertMagicNumber(magic);
   }
   
   //--- Execute BUY order
   bool ExecuteBuy(string symbol, double volume, double sl, double tp, string commandId = "", string tradeComment = "")
   {
      datetime executeStart = TimeCurrent();
      
      // #region agent log
      if(m_logger != NULL)
      {
         string data = "{\"commandId\":\"" + commandId + "\"";
         data += ",\"symbol\":\"" + symbol + "\"";
         data += ",\"volume\":" + DoubleToString(volume, 2);
         data += "}";
         m_logger.DebugTiming("TradeExecutor.mqh:ExecuteBuy", "ExecuteBuy entry", executeStart, "H1,H2", data);
      }
      // #endregion
      
      // Execute BUY (removed verbose log)
      
      // Normalize symbol
      if(StringLen(symbol) == 0)
         symbol = _Symbol;
      
      // Normalize volume
      double minVolume = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN);
      double maxVolume = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MAX);
      double stepVolume = SymbolInfoDouble(symbol, SYMBOL_VOLUME_STEP);
      
      volume = MathMax(minVolume, MathMin(maxVolume, MathFloor(volume / stepVolume) * stepVolume));
      
      // Use comment from command if provided, otherwise use default
      string finalComment = (StringLen(tradeComment) > 0) ? tradeComment : "Copy Trading EA";
      
      datetime tradeStart = TimeCurrent();
      // Execute trade - THIS IS A BLOCKING CALL
      bool result = m_trade.Buy(volume, symbol, 0.0, sl, tp, finalComment);
      datetime tradeEnd = TimeCurrent();
      
      // #region agent log
      if(m_logger != NULL)
      {
         string tradeData = "{\"commandId\":\"" + commandId + "\"";
         tradeData += ",\"tradeStart\":" + IntegerToString((int)tradeStart);
         tradeData += ",\"tradeEnd\":" + IntegerToString((int)tradeEnd);
         tradeData += ",\"tradeDuration\":" + IntegerToString((int)(tradeEnd - tradeStart));
         tradeData += ",\"result\":" + (result ? "true" : "false");
         tradeData += "}";
         m_logger.DebugTiming("TradeExecutor.mqh:ExecuteBuy", "ExecuteBuy trade completed", tradeEnd, "H1,H2", tradeData);
      }
      // #endregion
      
      if(result)
      {
         ulong ticket = m_trade.ResultOrder();
         if(m_logger != NULL)
            m_logger.Info("BUY: Position opened | Ticket: " + StringFormat("%lld", (long)ticket) + " | " + symbol + " | Vol: " + DoubleToString(volume, 2));
         
         // Update status panel
         UpdateCommandExecutionStatus("BUY", symbol, ticket);
         
         // Send acknowledgment immediately (fire-and-forget, non-blocking)
         if(StringLen(commandId) > 0)
         {
            AcknowledgeCommand(commandId, true, ticket);
         }
         
         return true;
      }
      else
      {
         int retcode = (int)m_trade.ResultRetcode();
         string errorMsg = "BUY failed: Retcode " + IntegerToString(retcode) + " - " + m_trade.ResultRetcodeDescription();
         if(m_logger != NULL)
            m_logger.Error(errorMsg);
         
         // Send acknowledgment immediately (fire-and-forget)
         if(StringLen(commandId) > 0)
            AcknowledgeCommand(commandId, false, 0, errorMsg);
         
         // #region agent log
         if(m_logger != NULL)
         {
            m_logger.DebugTiming("TradeExecutor.mqh:ExecuteBuy", "ExecuteBuy failed, ack queued", TimeCurrent(), "H1", "");
         }
         // #endregion
         
         return false;
      }
   }
   
   //--- Execute SELL order
   bool ExecuteSell(string symbol, double volume, double sl, double tp, string commandId = "", string tradeComment = "")
   {
      // Execute SELL (removed verbose log)
      
      // Normalize symbol
      if(StringLen(symbol) == 0)
         symbol = _Symbol;
      
      // Normalize volume
      double minVolume = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN);
      double maxVolume = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MAX);
      double stepVolume = SymbolInfoDouble(symbol, SYMBOL_VOLUME_STEP);
      
      volume = MathMax(minVolume, MathMin(maxVolume, MathFloor(volume / stepVolume) * stepVolume));
      
      // Use comment from command if provided, otherwise use default
      string finalComment = (StringLen(tradeComment) > 0) ? tradeComment : "Copy Trading EA";
      
      datetime tradeStart = TimeCurrent();
      // Execute trade - THIS IS A BLOCKING CALL
      bool result = m_trade.Sell(volume, symbol, 0.0, sl, tp, finalComment);
      datetime tradeEnd = TimeCurrent();
      
      // #region agent log
      if(m_logger != NULL)
      {
         string tradeData = "{\"commandId\":\"" + commandId + "\"";
         tradeData += ",\"tradeStart\":" + IntegerToString((int)tradeStart);
         tradeData += ",\"tradeEnd\":" + IntegerToString((int)tradeEnd);
         tradeData += ",\"tradeDuration\":" + IntegerToString((int)(tradeEnd - tradeStart));
         tradeData += ",\"result\":" + (result ? "true" : "false");
         tradeData += "}";
         m_logger.DebugTiming("TradeExecutor.mqh:ExecuteSell", "ExecuteSell trade completed", tradeEnd, "H1,H2", tradeData);
      }
      // #endregion
      
      if(result)
      {
         ulong ticket = m_trade.ResultOrder();
         if(m_logger != NULL)
            m_logger.Info("SELL: Position opened | Ticket: " + StringFormat("%lld", (long)ticket) + " | " + symbol + " | Vol: " + DoubleToString(volume, 2));
         
         // Update status panel
         UpdateCommandExecutionStatus("SELL", symbol, ticket);
         
         // Send acknowledgment immediately (fire-and-forget)
         if(StringLen(commandId) > 0)
            AcknowledgeCommand(commandId, true, ticket);
         
         return true;
      }
      else
      {
         int retcode = (int)m_trade.ResultRetcode();
         string errorMsg = "SELL failed: Retcode " + IntegerToString(retcode) + " - " + m_trade.ResultRetcodeDescription();
         if(m_logger != NULL)
            m_logger.Error(errorMsg);
         
         // Send acknowledgment immediately (fire-and-forget)
         if(StringLen(commandId) > 0)
            AcknowledgeCommand(commandId, false, 0, errorMsg);
         
         return false;
      }
   }
   
   //--- Close specific position by master ticket (found in comment)
   // CRITICAL FIX: Close by matching master ticket in comment, not by slave ticket
   bool ExecuteClose(ulong masterTicket, string commandId = "", string commandComment = "")
   {
      // Small delay to ensure position cache is fresh (fixes race conditions)
      Sleep(50);
      
      int total = PositionsTotal();
      bool closedAny = false;
      // CRITICAL: Use same format as comment creation (%lld for consistency)
      string masterTicketStr = StringFormat("%lld", (long)masterTicket);
      
      // Search all positions for one matching the master ticket in comment
      // CRITICAL FIX: Get ticket first, then select (required for hedging accounts)
      for(int i = total - 1; i >= 0; i--)
      {
         // Get ticket by index (MQL5 standard)
         ulong ticket = PositionGetTicket(i);
         if(ticket == 0)
            continue;
         
         // Select position by ticket (required to access position properties)
         if(!PositionSelectByTicket(ticket))
            continue;
         
         string posComment = PositionGetString(POSITION_COMMENT);
         // Normalize comment (remove leading/trailing spaces)
         StringTrimLeft(posComment);
         StringTrimRight(posComment);
         
         string symbol = PositionGetString(POSITION_SYMBOL);
         double volume = PositionGetDouble(POSITION_VOLUME);
         
         // Match master ticket in comment
         // Primary format: "COPY|MASTER_TICKET|YYYYY|..." (guaranteed format from BUY/SELL)
         // Fallback format: "Copy from Master #XXXXX Ticket #YYYYY" (backend format)
         bool matches = false;
         string matchReason = "";
         
         // Check for guaranteed format first (most reliable)
         string searchPattern = "MASTER_TICKET|" + masterTicketStr;
         int foundPos = StringFind(posComment, searchPattern);
         if(foundPos >= 0)
         {
            matches = true;
            matchReason = "MASTER_TICKET|" + masterTicketStr;
         }
         // Fallback 1: Check for backend format "Ticket #YYYYY"
         else
         {
            searchPattern = "Ticket #" + masterTicketStr;
            foundPos = StringFind(posComment, searchPattern);
            if(foundPos >= 0)
            {
               matches = true;
               matchReason = "Ticket #" + masterTicketStr;
            }
            // Fallback 2: Extract master ticket from comment and compare
            else
            {
               // Try to extract master ticket from "MASTER_TICKET|XXXXX" format
               int masterTicketPos = StringFind(posComment, "MASTER_TICKET|");
               if(masterTicketPos >= 0)
               {
                  masterTicketPos += StringLen("MASTER_TICKET|");
                  string extractedTicketStr = "";
                  int j = masterTicketPos;
                  while(j < StringLen(posComment) && StringGetCharacter(posComment, j) >= '0' && StringGetCharacter(posComment, j) <= '9')
                  {
                     extractedTicketStr += StringSubstr(posComment, j, 1);
                     j++;
                  }
                  if(StringLen(extractedTicketStr) > 0 && extractedTicketStr == masterTicketStr)
                  {
                     matches = true;
                     matchReason = "Extracted: " + extractedTicketStr;
                  }
               }
            }
         }
         
         // Only log if no match found (for debugging failures)
         // Removed verbose logging - only log on actual errors
         
         if(matches)
         {
            bool result = m_trade.PositionClose(ticket);
            
            if(result)
            {
               closedAny = true;
               if(m_logger != NULL)
                  m_logger.Info("CLOSE: Position closed | Slave: " + StringFormat("%lld", (long)ticket) + 
                               " | Master: " + masterTicketStr + " | " + symbol);
               
               // Update status panel
               UpdateCommandExecutionStatus("CLOSE", symbol, ticket);
               
               // Send acknowledgment immediately (fire-and-forget)
               if(StringLen(commandId) > 0)
                  AcknowledgeCommand(commandId, true, ticket);
               
               // Found and closed, can return
               return true;
            }
            else
            {
               int retcode = (int)m_trade.ResultRetcode();
               string errorMsg = "Close failed: Retcode " + IntegerToString(retcode) + " - " + m_trade.ResultRetcodeDescription();
               if(m_logger != NULL)
                  m_logger.Error("CLOSE FAILED: " + errorMsg);
               
               // Send acknowledgment immediately (fire-and-forget)
               if(StringLen(commandId) > 0)
                  AcknowledgeCommand(commandId, false, 0, errorMsg);
               
               return false;
            }
         }
      }
      
      // No position found matching master ticket
      string errorMsg = "No position found for master ticket " + masterTicketStr;
      if(m_logger != NULL)
         m_logger.Error("CLOSE ERROR: " + errorMsg);
      
      // Send acknowledgment immediately (fire-and-forget)
      if(StringLen(commandId) > 0)
         AcknowledgeCommand(commandId, false, 0, errorMsg);
      
      return false;
   }
   
   //--- Close all positions
   bool ExecuteCloseAll(string commandId = "")
   {
      if(m_logger != NULL)
         m_logger.Info("ExecuteCloseAll: Closing all positions");
      
      int closedCount = 0;
      int totalPositions = PositionsTotal();
      
      for(int i = totalPositions - 1; i >= 0; i--)
      {
         ulong ticket = PositionGetTicket(i);
         if(ticket > 0)
         {
            if(PositionSelectByTicket(ticket))
            {
               ulong posTicket = PositionGetInteger(POSITION_TICKET);
               if(m_trade.PositionClose(posTicket))
                  closedCount++;
            }
         }
      }
      
      if(m_logger != NULL)
         m_logger.Info("Closed " + IntegerToString(closedCount) + " position(s)");
      
      // Send acknowledgment immediately (fire-and-forget)
      if(StringLen(commandId) > 0)
         AcknowledgeCommand(commandId, closedCount > 0, 0, closedCount > 0 ? "" : "No positions to close");
      
      return closedCount > 0;
   }
   
   //--- Modify position SL/TP by master ticket (found in comment)
   // CRITICAL FIX: Find position by master ticket in comment, not by slave ticket
   bool ExecuteModify(ulong masterTicket, double newSl, double newTp, string commandId = "", string commandComment = "")
   {
      // Small delay to ensure position cache is fresh (fixes race conditions)
      Sleep(50);
      
      int total = PositionsTotal();
      bool modified = false;
      // CRITICAL: Use same format as comment creation (%lld for consistency)
      string masterTicketStr = StringFormat("%lld", (long)masterTicket);
      
      // Extract master ticket from comment if provided
      if(StringLen(commandComment) > 0 && masterTicket == 0)
      {
         // Comment format: "Copy from Master #XXXXX Ticket #YYYYY"
         int ticketPos = StringFind(commandComment, "Ticket #");
         if(ticketPos >= 0)
         {
            ticketPos += StringLen("Ticket #");
            string ticketStr = "";
            int i = ticketPos;
            while(i < StringLen(commandComment) && StringGetCharacter(commandComment, i) >= '0' && StringGetCharacter(commandComment, i) <= '9')
            {
               ticketStr += StringSubstr(commandComment, i, 1);
               i++;
            }
            if(StringLen(ticketStr) > 0)
               masterTicket = (ulong)StringToInteger(ticketStr);
            // CRITICAL: Use same format as comment creation (%lld for consistency)
            masterTicketStr = StringFormat("%lld", (long)masterTicket);
         }
      }
      
      // Search all positions for one matching the master ticket in comment
      // CRITICAL FIX: Get ticket first, then select (required for hedging accounts)
      for(int i = total - 1; i >= 0; i--)
      {
         // Get ticket by index (MQL5 standard)
         ulong ticket = PositionGetTicket(i);
         if(ticket == 0)
            continue;
         
         // Select position by ticket (required to access position properties)
         if(!PositionSelectByTicket(ticket))
            continue;
         
         string posComment = PositionGetString(POSITION_COMMENT);
         // Normalize comment (remove leading/trailing spaces)
         StringTrimLeft(posComment);
         StringTrimRight(posComment);
         
         string symbol = PositionGetString(POSITION_SYMBOL);
         
         // Match master ticket in comment
         // Primary format: "COPY|MASTER_TICKET|YYYYY|..." (guaranteed format from BUY/SELL)
         // Fallback format: "Copy from Master #XXXXX Ticket #YYYYY" (backend format)
         bool matches = false;
         string matchReason = "";
         
         // Check for guaranteed format first (most reliable)
         string searchPattern = "MASTER_TICKET|" + masterTicketStr;
         int foundPos = StringFind(posComment, searchPattern);
         if(foundPos >= 0)
         {
            matches = true;
            matchReason = "MASTER_TICKET|" + masterTicketStr;
         }
         // Fallback 1: Check for backend format "Ticket #YYYYY"
         else
         {
            searchPattern = "Ticket #" + masterTicketStr;
            foundPos = StringFind(posComment, searchPattern);
            if(foundPos >= 0)
            {
               matches = true;
               matchReason = "Ticket #" + masterTicketStr;
            }
            // Fallback 2: Extract master ticket from comment and compare
            else
            {
               // Try to extract master ticket from "MASTER_TICKET|XXXXX" format
               int masterTicketPos = StringFind(posComment, "MASTER_TICKET|");
               if(masterTicketPos >= 0)
               {
                  masterTicketPos += StringLen("MASTER_TICKET|");
                  string extractedTicketStr = "";
                  int j = masterTicketPos;
                  while(j < StringLen(posComment) && StringGetCharacter(posComment, j) >= '0' && StringGetCharacter(posComment, j) <= '9')
                  {
                     extractedTicketStr += StringSubstr(posComment, j, 1);
                     j++;
                  }
                  if(StringLen(extractedTicketStr) > 0 && extractedTicketStr == masterTicketStr)
                  {
                     matches = true;
                     matchReason = "Extracted: " + extractedTicketStr;
                  }
               }
            }
         }
         
         // Only log on actual errors (removed verbose logging)
         
         if(matches)
         {
            // CRITICAL FIX: Check if SL/TP already match current position values
            // This prevents infinite loops and unnecessary MT5 API calls
            // Use a small tolerance (5 points) for floating point comparison to handle rounding
            double currentSL = PositionGetDouble(POSITION_SL);
            double currentTP = PositionGetDouble(POSITION_TP);
            
            // Check if values already match (within 5 points tolerance for floating point comparison)
            // This handles rounding differences between backend and MT5
            // Use larger tolerance to avoid blocking valid modifications due to precision differences
            double tolerance = 5.0 * _Point; // 5 points tolerance (more lenient)
            double slDiff = MathAbs(currentSL - newSl);
            double tpDiff = MathAbs(currentTP - newTp);
            
            // For zero values, treat as "no SL/TP" and consider them equal
            bool slIsZero = (currentSL <= 0 && newSl <= 0);
            bool tpIsZero = (currentTP <= 0 && newTp <= 0);
            
            // Match if difference is within tolerance OR both are zero
            bool slMatches = slIsZero || slDiff < tolerance;
            bool tpMatches = tpIsZero || tpDiff < tolerance;
            
            if(slMatches && tpMatches)
            {
               // SL/TP already match - skip modification to prevent feedback loop
               if(m_logger != NULL)
                  m_logger.Info("MODIFY SKIPPED: SL/TP already in sync | Slave: " + StringFormat("%lld", (long)ticket) +
                              " | Master: " + masterTicketStr + " | Current SL=" + DoubleToString(currentSL, 5) + " TP=" + DoubleToString(currentTP, 5) +
                              " | Requested SL=" + DoubleToString(newSl, 5) + " TP=" + DoubleToString(newTp, 5) +
                              " | Diff SL=" + DoubleToString(slDiff, 5) + " TP=" + DoubleToString(tpDiff, 5));
               
               // Send acknowledgment immediately (fire-and-forget) - treat as success since already in sync
               if(StringLen(commandId) > 0)
                  AcknowledgeCommand(commandId, true, ticket);
               
               return true; // Return true (already in sync, no error)
            }
            
            bool result = m_trade.PositionModify(ticket, newSl, newTp);
            
            if(result)
            {
               modified = true;
               if(m_logger != NULL)
                  m_logger.Info("MODIFY: Position updated | Slave: " + StringFormat("%lld", (long)ticket) +
                              " | Master: " + masterTicketStr + " | SL=" + DoubleToString(newSl, 5) + " TP=" + DoubleToString(newTp, 5));
               
               // Send acknowledgment immediately (fire-and-forget)
               if(StringLen(commandId) > 0)
                  AcknowledgeCommand(commandId, true, ticket);
               
               return true;
            }
            else
            {
               int retcode = (int)m_trade.ResultRetcode();
               string errorMsg = "Modify failed: Retcode " + IntegerToString(retcode) + " - " + m_trade.ResultRetcodeDescription();
               if(m_logger != NULL)
                  m_logger.Error("MODIFY FAILED: " + errorMsg);
               
               // Send acknowledgment immediately (fire-and-forget)
               if(StringLen(commandId) > 0)
                  AcknowledgeCommand(commandId, false, 0, errorMsg);
               
               return false;
            }
         }
      }
      
      // No position found matching master ticket
      string errorMsg = "No position found for master ticket " + masterTicketStr;
      if(m_logger != NULL)
         m_logger.Error("MODIFY ERROR: " + errorMsg);
      
      // Send acknowledgment immediately (fire-and-forget)
      if(StringLen(commandId) > 0)
         AcknowledgeCommand(commandId, false, 0, errorMsg);
      
      return false;
   }
};
//+------------------------------------------------------------------+
