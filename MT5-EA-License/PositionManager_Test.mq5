//+------------------------------------------------------------------+
//| PositionManager_Test.mq5                                         |
//| Test EA - Position Management with Auto-Close and SL/TP          |
//+------------------------------------------------------------------+
//| LeTechs Copy Trading - Futures Testing EA                        |
//+------------------------------------------------------------------+
#property copyright "LeTechs Finsys Technologies LLC"
#property link      "https://www.letechs.com"
#property version   "1.00"
#property description "Test EA: Position management with auto-close by profit and SL/TP management\n\nFeatures:\n- Show open trade profit by symbol\n- Auto-close when profit threshold reached\n- Calculate pip value automatically\n- Set average SL/TP to all positions"
#property strict

#include <Trade\Trade.mqh>
#include <Trade\PositionInfo.mqh>
#include <Trade\SymbolInfo.mqh>

CTrade trade;
CPositionInfo position;
CSymbolInfo symbolInfo;

//+------------------------------------------------------------------+
//| Input Parameters                                                 |
//+------------------------------------------------------------------+
// Display Settings
input int UpdateIntervalSeconds = 5;  // Update interval (seconds)
input color TextColor = clrWhite;  // Text color
input int FontSize = 10;  // Font size
input string FontName = "Arial";  // Font name

// Auto-Close Settings
input bool EnableAutoClose = false;  // Enable auto-close by profit
input double AutoCloseProfitAmount = 100.0;  // Auto-close profit threshold (account currency)
input bool AutoCloseBySymbol = true;  // Close all positions of symbol when threshold reached

// Account-Level Auto-Close Settings
input bool EnableAccountProfitClose = false;  // Enable account profit threshold auto-close
input double AccountProfitThreshold = 500.0;  // Close all positions when account profit reaches this (account currency)
input bool EnableAccountLossClose = false;  // Enable account loss threshold auto-close (Emergency Stop Loss)
input double AccountLossThreshold = 200.0;  // Close all positions when account loss reaches this amount (enter positive number, e.g., 200.0 means -200.0 loss)

// SL/TP Management Settings
input bool EnableSLManagement = false;  // Enable Stop Loss management
input bool EnableTPManagement = false;  // Enable Take Profit management

// Enum for SL/TP mode (defined separately, cannot have input modifier)
enum ENUM_SLTP_MODE
{
   MODE_POINTS,      // Set SL/TP by points
   MODE_AMOUNT       // Set SL/TP by amount (account currency)
};

input ENUM_SLTP_MODE SLTPMode = MODE_POINTS;  // SL/TP calculation mode

input double StopLossPoints = 50.0;  // Stop Loss (points)
input double TakeProfitPoints = 100.0;  // Take Profit (points)
input double StopLossAmount = 50.0;  // Stop Loss (account currency) - used if MODE_AMOUNT
input double TakeProfitAmount = 100.0;  // Take Profit (account currency) - used if MODE_AMOUNT

//+------------------------------------------------------------------+
//| Global Variables                                                 |
//+------------------------------------------------------------------+
datetime g_lastUpdate = 0;
string g_objectPrefix = "PosMgr_";
string g_accountCurrency = "";

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   Print("=== Position Manager Test EA Started ===");
   
   // Get account currency
   g_accountCurrency = AccountInfoString(ACCOUNT_CURRENCY);
   Print("Account Currency: ", g_accountCurrency);
   
   // Clear chart objects
   ClearChartObjects();
   
   // Initial update
   UpdateDisplay();
   
   // Set timer if OnTick doesn't fire
   EventSetTimer(UpdateIntervalSeconds);
   
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   Print("=== Position Manager Test EA Stopped ===");
   EventKillTimer();
   ClearChartObjects();
}

//+------------------------------------------------------------------+
//| Expert tick function                                             |
//+------------------------------------------------------------------+
void OnTick()
{
   datetime currentTime = TimeCurrent();
   if(currentTime - g_lastUpdate >= UpdateIntervalSeconds)
   {
      // Check auto-close (symbol-based)
      if(EnableAutoClose)
      {
         CheckAutoClose();
      }
      
      // Check account-level auto-close (profit threshold)
      if(EnableAccountProfitClose)
      {
         CheckAccountProfitClose();
      }
      
      // Check account-level auto-close (loss threshold - Emergency Stop Loss)
      if(EnableAccountLossClose)
      {
         CheckAccountLossClose();
      }
      
      // Check SL/TP management
      if(EnableSLManagement || EnableTPManagement)
      {
         UpdateSLTP();
      }
      
      // Update display
      UpdateDisplay();
      g_lastUpdate = currentTime;
   }
}

//+------------------------------------------------------------------+
//| Timer function                                                   |
//+------------------------------------------------------------------+
void OnTimer()
{
   OnTick();
}

//+------------------------------------------------------------------+
//| Calculate profit by symbol (OPEN positions only)                |
//+------------------------------------------------------------------+
void CalculateProfitBySymbol(double &profitArray[], string &symbolArray[], int &count)
{
   count = 0;
   ArrayResize(profitArray, 0);
   ArrayResize(symbolArray, 0);
   
   // Iterate through all open positions
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket > 0)
      {
         // Use PositionInfo class to get all position data (more reliable)
         if(position.SelectByTicket(ticket))
         {
            string symbol = position.Symbol();
            double profit = position.Profit();
            double swap = position.Swap();
            double commission = position.Commission();
            double totalProfit = profit + swap + commission;
         
         // Find or add symbol
         int symbolIndex = FindSymbolIndex(symbolArray, symbol, count);
         if(symbolIndex == -1)
         {
            // New symbol - add it
            ArrayResize(profitArray, count + 1);
            ArrayResize(symbolArray, count + 1);
            profitArray[count] = totalProfit;
            symbolArray[count] = symbol;
            count++;
         }
         else
         {
            // Existing symbol - add profit
            profitArray[symbolIndex] += totalProfit;
         }
         }
      }
   }
}

//+------------------------------------------------------------------+
//| Get position commission from deal history                        |
//+------------------------------------------------------------------+
double GetPositionCommission(ulong ticket, string symbol)
{
   double totalCommission = 0.0;
   
   // Try to get commission from deal history
   datetime openTime = (datetime)PositionGetInteger(POSITION_TIME);
   datetime currentTime = TimeCurrent();
   
   if(HistorySelect(openTime, currentTime))
   {
      int totalDeals = HistoryDealsTotal();
      for(int i = 0; i < totalDeals; i++)
      {
         ulong dealTicket = HistoryDealGetTicket(i);
         if(dealTicket > 0)
         {
            long dealPositionId = HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID);
            if(dealPositionId == ticket)
            {
               string dealSymbol = HistoryDealGetString(dealTicket, DEAL_SYMBOL);
               if(dealSymbol == symbol)
               {
                  double commission = HistoryDealGetDouble(dealTicket, DEAL_COMMISSION);
                  totalCommission += commission;
               }
            }
         }
      }
   }
   
   return totalCommission;
}

//+------------------------------------------------------------------+
//| Find symbol index in array                                       |
//+------------------------------------------------------------------+
int FindSymbolIndex(string &symbolArray[], string symbol, int arraySize)
{
   for(int i = 0; i < arraySize; i++)
   {
      if(symbolArray[i] == symbol)
         return i;
   }
   return -1;
}

//+------------------------------------------------------------------+
//| Calculate pip value for a symbol                                 |
//+------------------------------------------------------------------+
double CalculatePipValue(string symbol, double lotSize)
{
   if(!symbolInfo.Name(symbol))
   {
      Print("Error: Cannot get symbol info for ", symbol);
      return 0.0;
   }
   
   // Get symbol properties
   double contractSize = symbolInfo.ContractSize();
   double tickSize = symbolInfo.TickSize();
   double tickValue = symbolInfo.TickValue();
   int digits = (int)symbolInfo.Digits();
   
   // Calculate point value
   double point = symbolInfo.Point();
   double pointValue = 0.0;
   
   // For most symbols: point value = tick value * (point / tick size)
   if(tickSize > 0)
   {
      pointValue = tickValue * (point / tickSize);
   }
   else
   {
      pointValue = tickValue;
   }
   
   // Calculate pip value (1 pip = 10 points for 5-digit, 1 point for 3-digit)
   double pipSize = point;
   if(digits == 5 || digits == 3)
   {
      pipSize = point * 10;  // 1 pip = 10 points
   }
   
   double pipValue = pointValue * (pipSize / point) * lotSize;
   
   // Convert to account currency if needed
   string profitCurrency = symbolInfo.CurrencyProfit();
   if(profitCurrency != g_accountCurrency)
   {
      // Need to convert currency
      string baseCurrency = symbolInfo.CurrencyBase();
      string accountCurrency = g_accountCurrency;
      
      // Try to get conversion rate
      double conversionRate = GetCurrencyConversionRate(profitCurrency, accountCurrency);
      if(conversionRate > 0)
      {
         pipValue = pipValue * conversionRate;
      }
   }
   
   return pipValue;
}

//+------------------------------------------------------------------+
//| Get currency conversion rate                                    |
//+------------------------------------------------------------------+
double GetCurrencyConversionRate(string fromCurrency, string toCurrency)
{
   if(fromCurrency == toCurrency)
      return 1.0;
   
   // Try to find a direct conversion symbol
   string symbol1 = fromCurrency + toCurrency;
   string symbol2 = toCurrency + fromCurrency;
   
   if(SymbolSelect(symbol1, true))
   {
      double bid = SymbolInfoDouble(symbol1, SYMBOL_BID);
      if(bid > 0) return bid;
   }
   
   if(SymbolSelect(symbol2, true))
   {
      double bid = SymbolInfoDouble(symbol2, SYMBOL_BID);
      if(bid > 0) return 1.0 / bid;
   }
   
   // If USD is involved, try USD pairs
   if(fromCurrency == "USD")
   {
      string usdSymbol = "USD" + toCurrency;
      if(SymbolSelect(usdSymbol, true))
      {
         double bid = SymbolInfoDouble(usdSymbol, SYMBOL_BID);
         if(bid > 0) return bid;
      }
   }
   
   if(toCurrency == "USD")
   {
      string usdSymbol = fromCurrency + "USD";
      if(SymbolSelect(usdSymbol, true))
      {
         double bid = SymbolInfoDouble(usdSymbol, SYMBOL_BID);
         if(bid > 0) return 1.0 / bid;
      }
   }
   
   // Default: assume 1:1 if cannot convert (not ideal but safe)
   Print("Warning: Cannot convert ", fromCurrency, " to ", toCurrency, ". Using 1.0");
   return 1.0;
}

//+------------------------------------------------------------------+
//| Check and execute auto-close                                    |
//+------------------------------------------------------------------+
void CheckAutoClose()
{
   if(AutoCloseBySymbol)
   {
      // Mode 1: Close positions by symbol (only the symbol that reached threshold)
      double profitBySymbol[];
      string symbols[];
      int count = 0;
      
      CalculateProfitBySymbol(profitBySymbol, symbols, count);
      
      for(int i = 0; i < count; i++)
      {
         if(profitBySymbol[i] >= AutoCloseProfitAmount)
         {
            Print("Auto-close triggered for ", symbols[i], ": Profit = ", profitBySymbol[i], " ", g_accountCurrency);
            // Close all positions of this symbol
            CloseAllPositionsBySymbol(symbols[i]);
         }
      }
   }
   else
   {
      // Mode 2: Close ALL positions on account when total profit reaches threshold
      double totalProfit = 0.0;
      
      for(int i = PositionsTotal() - 1; i >= 0; i--)
      {
         ulong ticket = PositionGetTicket(i);
         if(ticket > 0)
         {
            if(position.SelectByTicket(ticket))
            {
               totalProfit += position.Profit() + position.Swap() + position.Commission();
            }
         }
      }
      
      if(totalProfit >= AutoCloseProfitAmount)
      {
         Print("Auto-close triggered for ALL positions: Total Profit = ", totalProfit, " ", g_accountCurrency);
         // Close all positions on the account
         CloseAllPositions();
      }
   }
}

//+------------------------------------------------------------------+
//| Close all positions by symbol                                    |
//+------------------------------------------------------------------+
void CloseAllPositionsBySymbol(string symbol)
{
   int closedCount = 0;
   
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket > 0)
      {
         string posSymbol = PositionGetString(POSITION_SYMBOL);
         if(posSymbol == symbol)
         {
            if(trade.PositionClose(ticket))
            {
               closedCount++;
               Print("Closed position: ", ticket, " (", symbol, ")");
            }
            else
            {
               Print("Failed to close position: ", ticket, " - Error: ", GetLastError());
            }
         }
      }
   }
   
   if(closedCount > 0)
   {
      Print("Auto-closed ", closedCount, " position(s) for symbol: ", symbol);
   }
}

//+------------------------------------------------------------------+
//| Close all positions on the account                               |
//+------------------------------------------------------------------+
void CloseAllPositions()
{
   int closedCount = 0;
   
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket > 0)
      {
         if(position.SelectByTicket(ticket))
         {
            string symbol = position.Symbol();
            if(trade.PositionClose(ticket))
            {
               closedCount++;
               Print("Closed position: ", ticket, " (", symbol, ")");
            }
            else
            {
               Print("Failed to close position: ", ticket, " - Error: ", GetLastError());
            }
         }
      }
   }
   
   if(closedCount > 0)
   {
      Print("Auto-closed ", closedCount, " position(s) on account");
   }
}

//+------------------------------------------------------------------+
//| Check account profit threshold and close all positions           |
//+------------------------------------------------------------------+
void CheckAccountProfitClose()
{
   double totalProfit = 0.0;
   
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket > 0)
      {
         if(position.SelectByTicket(ticket))
         {
            totalProfit += position.Profit() + position.Swap() + position.Commission();
         }
      }
   }
   
   if(totalProfit >= AccountProfitThreshold)
   {
      PrintFormat("Account profit threshold reached: %.2f %s >= %.2f %s. Closing all positions.", 
                  totalProfit, g_accountCurrency, AccountProfitThreshold, g_accountCurrency);
      CloseAllPositions();
   }
}

//+------------------------------------------------------------------+
//| Check account loss threshold and close all positions (Emergency Stop Loss) |
//+------------------------------------------------------------------+
void CheckAccountLossClose()
{
   double totalProfit = 0.0;
   
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket > 0)
      {
         if(position.SelectByTicket(ticket))
         {
            totalProfit += position.Profit() + position.Swap() + position.Commission();
         }
      }
   }
   
   // Convert positive input to negative internally (user enters 200.0, we use -200.0)
   double lossThreshold = -MathAbs(AccountLossThreshold);
   
   if(totalProfit <= lossThreshold)
   {
      PrintFormat("Account loss threshold reached: %.2f %s <= %.2f %s. Emergency closing all positions.", 
                  totalProfit, g_accountCurrency, lossThreshold, g_accountCurrency);
      CloseAllPositions();
   }
}

//+------------------------------------------------------------------+
//| Calculate break-even price for a symbol                          |
//| Break-even = weighted average open price where total profit = 0  |
//+------------------------------------------------------------------+
double CalculateBreakEvenPrice(string symbol)
{
   double totalVolume = 0.0;
   double weightedPrice = 0.0;
   double totalSwap = 0.0;
   double totalCommission = 0.0;
   ENUM_POSITION_TYPE firstType = WRONG_VALUE;
   bool hasMixedTypes = false;
   
   // First pass: collect data and check for mixed position types
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket > 0)
      {
         if(position.SelectByTicket(ticket))
         {
            if(position.Symbol() == symbol)
            {
               ENUM_POSITION_TYPE posType = (ENUM_POSITION_TYPE)position.PositionType();
               if(firstType == WRONG_VALUE)
               {
                  firstType = posType;
               }
               else if(firstType != posType)
               {
                  hasMixedTypes = true;
               }
            }
         }
      }
   }
   
   // Second pass: calculate weighted average
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket > 0)
      {
         if(position.SelectByTicket(ticket))
         {
            if(position.Symbol() == symbol)
            {
               ENUM_POSITION_TYPE posType = (ENUM_POSITION_TYPE)position.PositionType();
               double volume = position.Volume();
               double openPrice = position.PriceOpen();
               double swap = position.Swap();
               double commission = position.Commission();
               
               totalVolume += volume;
               weightedPrice += openPrice * volume;
               totalSwap += swap;
               totalCommission += commission;
            }
         }
      }
   }
   
   if(totalVolume <= 0)
      return 0.0;
   
   // Calculate weighted average open price (simple break-even)
   // Break-even = weighted average of entry prices
   // This is the price where if market reaches it, the average entry cost is recovered
   double breakEvenPrice = weightedPrice / totalVolume;
   
   // Optional: Adjust for swaps and commissions to get TRUE break-even (where profit = 0)
   // This makes break-even the price where total profit (including costs) = 0
   double totalCosts = totalSwap + totalCommission;
   
   PrintFormat("Break-even calculation for %s:", symbol);
   PrintFormat("  Positions: TotalVolume=%.2f, WeightedPriceSum=%.5f", totalVolume, weightedPrice);
   PrintFormat("  Weighted Average Price: %.5f", breakEvenPrice);
   PrintFormat("  Total Costs (Swap+Commission): %.2f", totalCosts);
   
   // Calculate TRUE break-even (accounting for costs)
   // For BUY: breakEven = weightedAvg + (costs / pointValue / totalVolume)
   // For SELL: breakEven = weightedAvg - (costs / pointValue / totalVolume)
   if(!hasMixedTypes && firstType != WRONG_VALUE && totalCosts != 0.0)
   {
      double tickSize = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_SIZE);
      double tickValue = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_VALUE);
      double point = SymbolInfoDouble(symbol, SYMBOL_POINT);
      
      if(tickSize > 0 && tickValue > 0 && point > 0)
      {
         // Point value per lot = tickValue * (point / tickSize)
         double pointValuePerLot = tickValue * (point / tickSize);
         double totalPointValue = pointValuePerLot * totalVolume;
         
         PrintFormat("  Point Value: PerLot=%.5f, Total=%.5f", pointValuePerLot, totalPointValue);
         
         if(totalPointValue > 0)
         {
            // Calculate price adjustment to cover costs
            // adjustment = costs / (pointValue per point * totalVolume)
            // This gives us how many points the price needs to move to cover costs
            double adjustment = totalCosts / totalPointValue;
            
            PrintFormat("  Cost Adjustment: %.5f points (%.2f / %.5f)", adjustment, totalCosts, totalPointValue);
            
            if(firstType == POSITION_TYPE_BUY)
            {
               // For BUY: negative costs mean we need price to go UP to break even
               breakEvenPrice += adjustment;
            }
            else if(firstType == POSITION_TYPE_SELL)
            {
               // For SELL: negative costs mean we need price to go DOWN to break even
               breakEvenPrice -= adjustment;
            }
         }
      }
   }
   
   PrintFormat("Final break-even price for %s: %.5f", symbol, breakEvenPrice);
   return breakEvenPrice;
}

//+------------------------------------------------------------------+
//| Update SL/TP for all positions based on break-even price         |
//+------------------------------------------------------------------+
void UpdateSLTP()
{
   // Group positions by symbol and calculate break-even for each
   string processedSymbols[];
   ArrayResize(processedSymbols, 0);
   
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket > 0)
      {
         if(position.SelectByTicket(ticket))
         {
            string symbol = position.Symbol();
            
            // Check if we already processed this symbol
            bool alreadyProcessed = false;
            for(int j = 0; j < ArraySize(processedSymbols); j++)
            {
               if(processedSymbols[j] == symbol)
               {
                  alreadyProcessed = true;
                  break;
               }
            }
            
            if(!alreadyProcessed)
            {
               // Add to processed list
               int size = ArraySize(processedSymbols);
               ArrayResize(processedSymbols, size + 1);
               processedSymbols[size] = symbol;
               
               // Calculate break-even price for this symbol
               double breakEvenPrice = CalculateBreakEvenPrice(symbol);
               
               if(breakEvenPrice > 0)
               {
                  PrintFormat("Break-even price for %s: %.5f", symbol, breakEvenPrice);
                  // Update all positions of this symbol
                  UpdateSLTPForSymbol(symbol, breakEvenPrice);
               }
               else
               {
                  PrintFormat("Warning: Could not calculate break-even price for %s", symbol);
               }
            }
         }
      }
   }
}

//+------------------------------------------------------------------+
//| Update SL/TP for all positions of a symbol based on break-even   |
//+------------------------------------------------------------------+
void UpdateSLTPForSymbol(string symbol, double breakEvenPrice)
{
   double point = SymbolInfoDouble(symbol, SYMBOL_POINT);
   int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
   double tickSize = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_SIZE);
   
   // Get position type (assuming all positions of same symbol have same type, or use first one)
   ENUM_POSITION_TYPE posType = WRONG_VALUE;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket > 0)
      {
         if(position.SelectByTicket(ticket))
         {
            if(position.Symbol() == symbol)
            {
               posType = (ENUM_POSITION_TYPE)position.PositionType();
               break;
            }
         }
      }
   }
   
   if(posType == WRONG_VALUE)
      return;
   
   // Calculate SL/TP based on break-even price
   double newSL = 0.0;
   double newTP = 0.0;
   bool needSL = EnableSLManagement;
   bool needTP = EnableTPManagement;
   
   if(SLTPMode == MODE_POINTS)
   {
      // Calculate SL/TP by points from break-even
      if(posType == POSITION_TYPE_BUY)
      {
         if(needSL) newSL = breakEvenPrice - (StopLossPoints * point);
         if(needTP) newTP = breakEvenPrice + (TakeProfitPoints * point);
      }
      else // SELL
      {
         if(needSL) newSL = breakEvenPrice + (StopLossPoints * point);
         if(needTP) newTP = breakEvenPrice - (TakeProfitPoints * point);
      }
   }
   else // MODE_AMOUNT
   {
      // Calculate SL/TP by amount from break-even
      // Get total volume for this symbol to calculate point value
      double totalVolume = 0.0;
      for(int i = PositionsTotal() - 1; i >= 0; i--)
      {
         ulong ticket = PositionGetTicket(i);
         if(ticket > 0)
         {
            if(position.SelectByTicket(ticket))
            {
               if(position.Symbol() == symbol)
               {
                  totalVolume += position.Volume();
               }
            }
         }
      }
      
      if(totalVolume > 0)
      {
         // Calculate point value for total volume (more accurate than pip value)
         double tickSize = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_SIZE);
         double tickValue = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_VALUE);
         
         if(tickSize > 0 && tickValue > 0 && point > 0)
         {
            // Point value per lot = tickValue * (point / tickSize)
            double pointValuePerLot = tickValue * (point / tickSize);
            double totalPointValue = pointValuePerLot * totalVolume;
            
            if(totalPointValue > 0)
            {
               // Calculate points distance needed for amount
               // Amount / pointValue = number of points
               double slPointsDistance = StopLossAmount / totalPointValue;
               double tpPointsDistance = TakeProfitAmount / totalPointValue;
               
               PrintFormat("SL/TP Calculation for %s:", symbol);
               PrintFormat("  Break-even price: %.5f", breakEvenPrice);
               PrintFormat("  Total Point Value: %.5f (for %.2f lots)", totalPointValue, totalVolume);
               PrintFormat("  SL Amount: %.2f USD -> Distance: %.2f points", StopLossAmount, slPointsDistance);
               PrintFormat("  TP Amount: %.2f USD -> Distance: %.2f points", TakeProfitAmount, tpPointsDistance);
               
               if(posType == POSITION_TYPE_BUY)
               {
                  if(needSL) newSL = breakEvenPrice - (slPointsDistance * point);
                  if(needTP) newTP = breakEvenPrice + (tpPointsDistance * point);
                  PrintFormat("  BUY: SL=%.5f (%.5f - %.5f), TP=%.5f (%.5f + %.5f)", 
                             newSL, breakEvenPrice, slPointsDistance * point,
                             newTP, breakEvenPrice, tpPointsDistance * point);
               }
               else // SELL
               {
                  if(needSL) newSL = breakEvenPrice + (slPointsDistance * point);
                  if(needTP) newTP = breakEvenPrice - (tpPointsDistance * point);
                  PrintFormat("  SELL: SL=%.5f (%.5f + %.5f), TP=%.5f (%.5f - %.5f)", 
                             newSL, breakEvenPrice, slPointsDistance * point,
                             newTP, breakEvenPrice, tpPointsDistance * point);
               }
            }
            else
            {
               Print("Error: Total point value is 0 for ", symbol);
            }
         }
         else
         {
            Print("Error: Invalid symbol info for point value calculation: ", symbol);
         }
      }
   }
   
   // Normalize prices
   if(tickSize > 0)
   {
      newSL = NormalizeDouble(MathFloor(newSL / tickSize) * tickSize, digits);
      newTP = NormalizeDouble(MathFloor(newTP / tickSize) * tickSize, digits);
   }
   
   // Apply SL/TP to all positions of this symbol
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket > 0)
      {
         if(position.SelectByTicket(ticket))
         {
            if(position.Symbol() == symbol)
            {
               double currentSL = position.StopLoss();
               double currentTP = position.TakeProfit();
               
               // Use current values if management is disabled, otherwise use calculated values
               double finalSL = EnableSLManagement ? newSL : currentSL;
               double finalTP = EnableTPManagement ? newTP : currentTP;
               
               // Only modify if different
               bool needModify = false;
               if(EnableSLManagement && MathAbs(finalSL - currentSL) > point)
                  needModify = true;
               if(EnableTPManagement && MathAbs(finalTP - currentTP) > point)
                  needModify = true;
               
               if(needModify)
               {
                  if(trade.PositionModify(ticket, finalSL, finalTP))
                  {
                     string slStatus = EnableSLManagement ? StringFormat("%.5f", finalSL) : "unchanged";
                     string tpStatus = EnableTPManagement ? StringFormat("%.5f", finalTP) : "unchanged";
                     PrintFormat("Updated SL/TP for %s (Ticket: %I64u) - Break-Even: %.5f, SL: %s, TP: %s", 
                                 symbol, ticket, breakEvenPrice, slStatus, tpStatus);
                  }
                  else
                  {
                     PrintFormat("Failed to modify SL/TP for %s (Ticket: %I64u) - Error: %d", 
                                 symbol, ticket, GetLastError());
                  }
               }
            }
         }
      }
   }
}

//+------------------------------------------------------------------+
//| Update display on chart                                          |
//+------------------------------------------------------------------+
void UpdateDisplay()
{
   ClearChartObjects();
   
   double profitBySymbol[];
   string symbols[];
   int count = 0;
   
   CalculateProfitBySymbol(profitBySymbol, symbols, count);
   
   if(count == 0)
   {
      DisplayNoPositions();
      return;
   }
   
   DisplayProfitSummary(profitBySymbol, symbols, count);
   DisplaySettings();
}

//+------------------------------------------------------------------+
//| Display "No Positions" message                                   |
//+------------------------------------------------------------------+
void DisplayNoPositions()
{
   string objName = g_objectPrefix + "NoPositions";
   ObjectCreate(0, objName, OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, objName, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, objName, OBJPROP_XDISTANCE, 10);
   ObjectSetInteger(0, objName, OBJPROP_YDISTANCE, 30);
   ObjectSetInteger(0, objName, OBJPROP_COLOR, TextColor);
   ObjectSetInteger(0, objName, OBJPROP_FONTSIZE, FontSize);
   ObjectSetString(0, objName, OBJPROP_FONT, FontName);
   ObjectSetString(0, objName, OBJPROP_TEXT, "No open positions");
   ChartRedraw();
}

//+------------------------------------------------------------------+
//| Display profit summary                                           |
//+------------------------------------------------------------------+
void DisplayProfitSummary(double &profitArray[], string &symbolArray[], int count)
{
   int yOffset = 10;
   
   // Header
   string headerName = g_objectPrefix + "Header";
   ObjectCreate(0, headerName, OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, headerName, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, headerName, OBJPROP_XDISTANCE, 10);
   ObjectSetInteger(0, headerName, OBJPROP_YDISTANCE, yOffset);
   ObjectSetInteger(0, headerName, OBJPROP_COLOR, TextColor);
   ObjectSetInteger(0, headerName, OBJPROP_FONTSIZE, FontSize + 2);
   ObjectSetString(0, headerName, OBJPROP_FONT, FontName);
   ObjectSetString(0, headerName, OBJPROP_TEXT, "=== Open Positions Profit by Symbol ===");
   yOffset += 25;
   
   // Display each symbol
   double totalProfit = 0.0;
   
   for(int i = 0; i < count; i++)
   {
      string objName = g_objectPrefix + "Symbol_" + IntegerToString(i);
      ObjectCreate(0, objName, OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(0, objName, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, objName, OBJPROP_XDISTANCE, 10);
      ObjectSetInteger(0, objName, OBJPROP_YDISTANCE, yOffset);
      
      color profitColor = profitArray[i] >= 0 ? clrLimeGreen : clrRed;
      if(EnableAutoClose && profitArray[i] >= AutoCloseProfitAmount)
      {
         profitColor = clrYellow;  // Highlight if near auto-close threshold
      }
      
      ObjectSetInteger(0, objName, OBJPROP_COLOR, profitColor);
      ObjectSetInteger(0, objName, OBJPROP_FONTSIZE, FontSize);
      ObjectSetString(0, objName, OBJPROP_FONT, FontName);
      
      string profitText = StringFormat("%s: %s %.2f", 
                                       symbolArray[i], 
                                       g_accountCurrency,
                                       profitArray[i]);
      ObjectSetString(0, objName, OBJPROP_TEXT, profitText);
      
      totalProfit += profitArray[i];
      yOffset += 20;
   }
   
   // Total
   string totalName = g_objectPrefix + "Total";
   ObjectCreate(0, totalName, OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, totalName, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, totalName, OBJPROP_XDISTANCE, 10);
   ObjectSetInteger(0, totalName, OBJPROP_YDISTANCE, yOffset + 5);
   ObjectSetInteger(0, totalName, OBJPROP_COLOR, totalProfit >= 0 ? clrLimeGreen : clrRed);
   ObjectSetInteger(0, totalName, OBJPROP_FONTSIZE, FontSize + 1);
   ObjectSetString(0, totalName, OBJPROP_FONT, FontName);
   ObjectSetString(0, totalName, OBJPROP_TEXT, StringFormat("TOTAL: %s %.2f", 
                                                           g_accountCurrency,
                                                           totalProfit));
   yOffset += 25;
}

//+------------------------------------------------------------------+
//| Display settings status                                          |
//+------------------------------------------------------------------+
void DisplaySettings()
{
   int yOffset = 200;
   
   string settingsName = g_objectPrefix + "Settings";
   ObjectCreate(0, settingsName, OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, settingsName, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, settingsName, OBJPROP_XDISTANCE, 10);
   ObjectSetInteger(0, settingsName, OBJPROP_YDISTANCE, yOffset);
   ObjectSetInteger(0, settingsName, OBJPROP_COLOR, clrGray);
   ObjectSetInteger(0, settingsName, OBJPROP_FONTSIZE, FontSize - 1);
   ObjectSetString(0, settingsName, OBJPROP_FONT, FontName);
   
   string settingsText = "Settings: ";
   
   // Auto-Close by Symbol
   if(EnableAutoClose)
      settingsText += StringFormat("Auto-Close ON (%.2f %s, %s) | ", 
                                   AutoCloseProfitAmount, g_accountCurrency,
                                   AutoCloseBySymbol ? "By Symbol" : "All Positions");
   else
      settingsText += "Auto-Close OFF | ";
   
   // Account Profit Threshold
   if(EnableAccountProfitClose)
      settingsText += StringFormat("Acc Profit: %.2f %s | ", AccountProfitThreshold, g_accountCurrency);
   
   // Account Loss Threshold (Emergency Stop Loss)
   if(EnableAccountLossClose)
      settingsText += StringFormat("Acc Loss: -%.2f %s | ", AccountLossThreshold, g_accountCurrency);
   
   // SL/TP Management
   string sltpStatus = "";
   if(EnableSLManagement || EnableTPManagement)
   {
      sltpStatus = "SL/TP: ";
      if(EnableSLManagement && EnableTPManagement)
         sltpStatus += "Both ON";
      else if(EnableSLManagement)
         sltpStatus += "SL ON";
      else if(EnableTPManagement)
         sltpStatus += "TP ON";
      sltpStatus += StringFormat(" (%s)", SLTPMode == MODE_POINTS ? "Points" : "Amount");
   }
   else
   {
      sltpStatus = "SL/TP: OFF";
   }
   settingsText += sltpStatus;
   
   ObjectSetString(0, settingsName, OBJPROP_TEXT, settingsText);
   
   ChartRedraw();
}

//+------------------------------------------------------------------+
//| Clear all chart objects                                          |
//+------------------------------------------------------------------+
void ClearChartObjects()
{
   int totalObjects = ObjectsTotal(0);
   for(int i = totalObjects - 1; i >= 0; i--)
   {
      string objName = ObjectName(0, i);
      if(StringFind(objName, g_objectPrefix) == 0)
      {
         ObjectDelete(0, objName);
      }
   }
}

//+------------------------------------------------------------------+

