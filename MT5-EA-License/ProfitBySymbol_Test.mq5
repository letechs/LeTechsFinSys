//+------------------------------------------------------------------+
//| ProfitBySymbol_Test.mq5                                          |
//| Test EA - Calculate and Display Total Profit by Symbol           |
//+------------------------------------------------------------------+
//| LeTechs Copy Trading - Futures Testing EA                        |
//+------------------------------------------------------------------+
#property copyright "LeTechs Finsys Technologies LLC"
#property link      "https://www.letechs.com"
#property version   "1.00"
#property description "Test EA: Calculate and display total profit by symbol on chart\n\nThis is a testing EA for futures functionality.\nDisplays total profit grouped by symbol."
#property strict

// Input parameters
input int UpdateIntervalSeconds = 5;  // How often to update profit display (seconds)
input bool ShowClosedPositions = true;  // Include closed positions in profit calculation
input color TextColor = clrWhite;  // Text color for display
input int FontSize = 10;  // Font size for display
input string FontName = "Arial";  // Font name

// Global variables
datetime g_lastUpdate = 0;
string g_objectPrefix = "ProfitBySymbol_";

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   Print("=== ProfitBySymbol Test EA Started ===");
   Print("This EA calculates total profit by symbol and displays on chart");
   
   // Clear any existing objects
   ClearChartObjects();
   
   // Initial update
   UpdateProfitDisplay();
   
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   Print("=== ProfitBySymbol Test EA Stopped ===");
   
   // Clean up chart objects
   ClearChartObjects();
}

//+------------------------------------------------------------------+
//| Expert tick function                                             |
//+------------------------------------------------------------------+
void OnTick()
{
   // Update at specified interval
   datetime currentTime = TimeCurrent();
   if(currentTime - g_lastUpdate >= UpdateIntervalSeconds)
   {
      UpdateProfitDisplay();
      g_lastUpdate = currentTime;
   }
}

//+------------------------------------------------------------------+
//| Timer function (backup if OnTick doesn't fire)                  |
//+------------------------------------------------------------------+
void OnTimer()
{
   UpdateProfitDisplay();
}

//+------------------------------------------------------------------+
//| Calculate and display profit by symbol                          |
//+------------------------------------------------------------------+
void UpdateProfitDisplay()
{
   // Clear previous display
   ClearChartObjects();
   
   // Calculate profit by symbol
   double profitBySymbol[];
   string symbols[];
   int symbolCount = 0;
   
   // Get all open positions
   if(ShowClosedPositions)
   {
      // Include closed positions from history
      CalculateProfitFromHistory(profitBySymbol, symbols, symbolCount);
   }
   else
   {
      // Only open positions
      CalculateProfitFromOpenPositions(profitBySymbol, symbols, symbolCount);
   }
   
   // Display results on chart
   DisplayProfitOnChart(profitBySymbol, symbols, symbolCount);
   
   // Print to log
   PrintProfitSummary(profitBySymbol, symbols, symbolCount);
}

//+------------------------------------------------------------------+
//| Calculate profit from open positions only                        |
//+------------------------------------------------------------------+
void CalculateProfitFromOpenPositions(double &profitArray[], string &symbolArray[], int &count)
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
         string symbol = PositionGetString(POSITION_SYMBOL);
         double profit = PositionGetDouble(POSITION_PROFIT);
         double swap = PositionGetDouble(POSITION_SWAP);
         double commission = PositionGetDouble(POSITION_COMMISSION);
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

//+------------------------------------------------------------------+
//| Calculate profit from history (open + closed positions)        |
//+------------------------------------------------------------------+
void CalculateProfitFromHistory(double &profitArray[], string &symbolArray[], int &count)
{
   count = 0;
   ArrayResize(profitArray, 0);
   ArrayResize(symbolArray, 0);
   
   // First, get open positions
   CalculateProfitFromOpenPositions(profitArray, symbolArray, count);
   
   // Then, get closed positions from history
   datetime startTime = 0;  // From beginning
   datetime endTime = TimeCurrent();
   
   // Select history for current account
   if(HistorySelect(startTime, endTime))
   {
      int totalDeals = HistoryDealsTotal();
      
      for(int i = 0; i < totalDeals; i++)
      {
         ulong ticket = HistoryDealGetTicket(i);
         if(ticket > 0)
         {
            string symbol = HistoryDealGetString(ticket, DEAL_SYMBOL);
            long dealType = HistoryDealGetInteger(ticket, DEAL_TYPE);
            
            // Only process position closing deals (DEAL_TYPE_BUY or DEAL_TYPE_SELL for closing)
            if(dealType == DEAL_TYPE_BUY || dealType == DEAL_TYPE_SELL)
            {
               double profit = HistoryDealGetDouble(ticket, DEAL_PROFIT);
               double swap = HistoryDealGetDouble(ticket, DEAL_SWAP);
               double commission = HistoryDealGetDouble(ticket, DEAL_COMMISSION);
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
//| Display profit on chart                                          |
//+------------------------------------------------------------------+
void DisplayProfitOnChart(double &profitArray[], string &symbolArray[], int count)
{
   if(count == 0)
   {
      // No positions - show message
      string objName = g_objectPrefix + "NoPositions";
      ObjectCreate(0, objName, OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(0, objName, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, objName, OBJPROP_XDISTANCE, 10);
      ObjectSetInteger(0, objName, OBJPROP_YDISTANCE, 30);
      ObjectSetInteger(0, objName, OBJPROP_COLOR, TextColor);
      ObjectSetInteger(0, objName, OBJPROP_FONTSIZE, FontSize);
      ObjectSetString(0, objName, OBJPROP_FONT, FontName);
      ObjectSetString(0, objName, OBJPROP_TEXT, "No positions found");
      return;
   }
   
   // Display header
   string headerName = g_objectPrefix + "Header";
   ObjectCreate(0, headerName, OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, headerName, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, headerName, OBJPROP_XDISTANCE, 10);
   ObjectSetInteger(0, headerName, OBJPROP_YDISTANCE, 10);
   ObjectSetInteger(0, headerName, OBJPROP_COLOR, TextColor);
   ObjectSetInteger(0, headerName, OBJPROP_FONTSIZE, FontSize + 2);
   ObjectSetString(0, headerName, OBJPROP_FONT, FontName);
   ObjectSetString(0, headerName, OBJPROP_TEXT, "=== Profit by Symbol ===");
   
   // Display each symbol's profit
   int yOffset = 35;
   double totalProfit = 0;
   
   for(int i = 0; i < count; i++)
   {
      string objName = g_objectPrefix + "Symbol_" + IntegerToString(i);
      ObjectCreate(0, objName, OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(0, objName, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, objName, OBJPROP_XDISTANCE, 10);
      ObjectSetInteger(0, objName, OBJPROP_YDISTANCE, yOffset);
      ObjectSetInteger(0, objName, OBJPROP_COLOR, profitArray[i] >= 0 ? clrLimeGreen : clrRed);
      ObjectSetInteger(0, objName, OBJPROP_FONTSIZE, FontSize);
      ObjectSetString(0, objName, OBJPROP_FONT, FontName);
      
      string profitText = StringFormat("%s: %s %.2f", 
                                       symbolArray[i], 
                                       AccountInfoString(ACCOUNT_CURRENCY),
                                       profitArray[i]);
      ObjectSetString(0, objName, OBJPROP_TEXT, profitText);
      
      totalProfit += profitArray[i];
      yOffset += 20;
   }
   
   // Display total
   string totalName = g_objectPrefix + "Total";
   ObjectCreate(0, totalName, OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, totalName, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, totalName, OBJPROP_XDISTANCE, 10);
   ObjectSetInteger(0, totalName, OBJPROP_YDISTANCE, yOffset + 5);
   ObjectSetInteger(0, totalName, OBJPROP_COLOR, totalProfit >= 0 ? clrLimeGreen : clrRed);
   ObjectSetInteger(0, totalName, OBJPROP_FONTSIZE, FontSize + 1);
   ObjectSetString(0, totalName, OBJPROP_FONT, FontName);
   ObjectSetString(0, totalName, OBJPROP_TEXT, StringFormat("TOTAL: %s %.2f", 
                                                           AccountInfoString(ACCOUNT_CURRENCY),
                                                           totalProfit));
   
   // Refresh chart
   ChartRedraw();
}

//+------------------------------------------------------------------+
//| Print profit summary to log                                      |
//+------------------------------------------------------------------+
void PrintProfitSummary(double &profitArray[], string &symbolArray[], int count)
{
   if(count == 0)
   {
      Print("No positions found");
      return;
   }
   
   Print("=== Profit by Symbol Summary ===");
   double totalProfit = 0;
   
   for(int i = 0; i < count; i++)
   {
      Print(StringFormat("%s: %s %.2f", 
                        symbolArray[i], 
                        AccountInfoString(ACCOUNT_CURRENCY),
                        profitArray[i]));
      totalProfit += profitArray[i];
   }
   
   Print(StringFormat("TOTAL: %s %.2f", 
                     AccountInfoString(ACCOUNT_CURRENCY),
                     totalProfit));
   Print("=================================");
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
   ChartRedraw();
}

//+------------------------------------------------------------------+

