//+------------------------------------------------------------------+
//| CopyTradingEA_License.mq5                                        |
//| EA License Tier - Local Copy Trading with API License Validation |
//+------------------------------------------------------------------+
//| LeTechs Copy Trading - EA License Version                        |
//+------------------------------------------------------------------+
#property copyright "LeTechs Finsys Technologies LLC"
#property link      "https://www.letechs.com"
#property version   "2.13"
#property description "LeTechs Copy Trading EA License Version\n\nLocal copy trading with backend license validation.\n\nSupport: +971 544569987\n\nRisk Disclaimer: Trading financial instruments carries risk of loss. Past performance does not guarantee future results. Use at your own risk."
#property strict

#define EA_NAME_PREFIX      MQLInfoString(MQL_PROGRAM_NAME)
#define MAP_FILE            (EA_NAME_PREFIX + "_map.bin")
#define BLACK_FILE          (EA_NAME_PREFIX + "_black.bin")
#define SYMBOL_MAP_FILE     "symbol_map.csv"
#define SYMBOL_CACHE_FILE   (EA_NAME_PREFIX + "_symbol_cache.bin")

#include <Trade\Trade.mqh>
#include "LicenseValidator.mqh"

// -------------------------------------------------------------
//  MODE (MASTER / SLAVE)
// -------------------------------------------------------------
enum ENUM_MODE { MODE_MASTER, MODE_SLAVE };
// Mode is determined automatically from backend config
// This input is only used as FALLBACK if backend config is unavailable
input ENUM_MODE Mode = MODE_SLAVE;  // Fallback mode (used only if backend config fails)

CTrade trade;

// -----------------------------------------------------------------
// ---------------------  LICENSE VALIDATION SETTINGS  --------------
// -----------------------------------------------------------------
// Backend API URL for license validation
input string LicenseApiUrl = "http://127.0.0.1:5000";  // Backend API base URL
// User ID from your account (get from dashboard)
input string UserId = "";  // Your user ID from the platform

// Internal license validation settings (not user-configurable)
#define LICENSE_CHECK_DAILY_HOUR    0   // Check at 00:00 (midnight)
#define LICENSE_CHECK_POLL_INTERVAL 600  // Poll for updates every 10 minutes (600 seconds)

// License validator instance
CLicenseValidator *g_licenseValidator = NULL;
datetime g_lastLicenseCheck = 0;
datetime g_lastDailyCheck = 0;  // Last daily check timestamp
string g_lastUpdatedTimestamp = "";  // Last subscription update timestamp from backend

// Global variables for determined mode (set in OnInit, used in OnTimer)
ENUM_MODE g_determinedMode = MODE_SLAVE;
int g_determinedMasterLogin = 0;

// -----------------------------------------------------------------
// ---------------------  COMMERCIAL METADATA  ----------------------
// -----------------------------------------------------------------
const string COMPANY_BRAND        = "LeTechs Finsys Technologies LLC";
const string EA_NAME_VERSION      = "LeTechs Copy Trading EA License 2.13";
const string COMPANY_WEBSITE      = "https://www.letechs.com";
const string SUPPORT_CONTACT      = "+971 544569987";

const string RISK_DISCLAIMER =
  "Risk Disclaimer: Trading financial instruments carries risk of loss. Past performance is not indicative of future results.";

// -----------------------------------------------------------------
// ---------------------  CLIENT-VISIBLE TOGGLES  -------------------
// -----------------------------------------------------------------
input bool ShowSignatureOnChart = true;
input bool ShowAboutInExperts   = true;

// -----------------------------------------------------------------
// ---------------------  CORE COPY SETTINGS  -----------------------
// -----------------------------------------------------------------
// Master login is determined automatically from backend config
// This input is only used as FALLBACK if backend config is unavailable
input int clogin_master = 0;  // Fallback master login (used only if backend config fails)
int g_masterLogin = 0;  // Actual master login used (from backend config or fallback)
int g_fallbackMasterLogin = 0;  // Fallback if backend unavailable (will use current account for master)
input bool MirrorOnClose  = true;         // true = close local trade when master closes
input bool ReverseTrades  = false;        // true = invert trade direction on slave
input bool OpenHistoricalOnStart   = true;   // false = ignore/open nothing for existing master trades at startup
static bool UseMasterEquityFromProvider = true;

static int  BlacklistExpiryMinutes  = 0;
static int  OpenRetryBaseSeconds    = 3;
static int  MaxRetryAttempts        = 2;
static int  MaxInflightGuardSeconds = 30;

#define PROVIDER_PREFIX "prov:"
#define END_MARKER      0x7F7F7F7F
input bool CopySLTP = true;   // true = copy SL/TP, false = ignore completely

// -----------------------------------------------------------------
// -----------------------  LOT SIZING OPTIONS  ---------------------
// -----------------------------------------------------------------
enum LOT_MODE
{
   FIXED_LOT        = 0,
   SAME_AS_MASTER   = 1,
   BASED_ON_EQUITY  = 2,
   MULT_ON_EQUITY   = 3,
   MULT_ON_MASTER_LOT = 4
};

input LOT_MODE LotMode = SAME_AS_MASTER;
input double   FixedLot            = 0.01;
static double  EquityReference     = 1000.0;
input double   EquityMultiplier    = 1.0;
input double   MasterLotMultiplier = 1.0;
input bool     UseMinIfBelow       = true;

// ---------- mapping arrays (parallel) ----------
ulong map_providerTicket[];
ulong map_localPosTicket[];
ulong map_localOrder[];
ulong map_localDeal[];
int   map_openedAt[];
int   map_retryCount[];
int   map_openState[];
int   map_lastSeenTime[];

// blacklist arrays
ulong blacklist_providerTicket[];
int   blacklist_time[];

// ---------- symbol mapping structures ----------
string user_map_master[];
string user_map_local[];
string user_map_server[];

string cache_master[];
string cache_local[];

string alias_master[];
string alias_list[];

// ---------- utility ----------
string ProviderComment(ulong providerTicket)
{
   return(StringFormat("%s%I64u", PROVIDER_PREFIX, providerTicket));
}

string SnapshotFileNameForLogin(const int master_login)
{
   return(StringFormat("%s_master_%d.bin", EA_NAME_PREFIX, master_login));
}

// ---------------- safe string helpers ----------------
string TrimString(const string s)
{
   int len = StringLen(s);
   if(len == 0) return("");
   int start = 0;
   int end = len - 1;
   while(start <= end && StringGetCharacter(s, start) <= 32) start++;
   while(end >= start && StringGetCharacter(s, end) <= 32) end--;
   if(start == 0 && end == len - 1) return s;
   if(end < start) return("");
   return StringSubstr(s, start, end - start + 1);
}

string ToLowerString(const string s)
{
   int len = StringLen(s);
   if(len == 0) return(s);
   string out = "";
   for(int i=0;i<len;i++)
   {
      int ch = StringGetCharacter(s, i);
      if(ch >= 65 && ch <= 90) ch += 32;
      out += CharToString((uchar)ch);
   }
   return out;
}

string ToUpperString(const string s)
{
   int len = StringLen(s);
   if(len == 0) return(s);
   string out = "";
   for(int i=0;i<len;i++)
   {
      int ch = StringGetCharacter(s, i);
      if(ch >= 97 && ch <= 122) ch -= 32;
      out += CharToString((uchar)(ch & 0xFF));
   }
   return out;
}

int SplitString(const string src, const string delim, string &parts[])
{
   if(StringLen(delim) == 1)
      return StringSplit(src, StringGetCharacter(delim,0), parts);

   ArrayResize(parts,0);
   string work = src;
   int p = 0;
   while(true)
   {
      int pos = StringFind(work, delim);
      if(pos == -1)
      {
         string t = TrimString(work);
         if(StringLen(t) > 0)
         {
            ArrayResize(parts, p+1);
            parts[p] = t;
            p++;
         }
         break;
      }
      string before = TrimString(StringSubstr(work, 0, pos));
      if(StringLen(before) > 0)
      {
         ArrayResize(parts, p+1);
         parts[p] = before;
         p++;
      }
      work = StringSubstr(work, pos + StringLen(delim));
   }
   return ArraySize(parts);
}

// ----------------- mapping helpers ----------------
int FindMapIndex(ulong providerTicket)
{
   for(int i=0;i<ArraySize(map_providerTicket);++i)
      if(map_providerTicket[i] == providerTicket) return i;
   return -1;
}

int AddMap(ulong providerTicket)
{
   int idx = FindMapIndex(providerTicket);
   if(idx >= 0) return idx;
   int old = ArraySize(map_providerTicket);
   ArrayResize(map_providerTicket, old+1);
   ArrayResize(map_localPosTicket, old+1);
   ArrayResize(map_localOrder, old+1);
   ArrayResize(map_localDeal, old+1);
   ArrayResize(map_openedAt, old+1);
   ArrayResize(map_retryCount, old+1);
   ArrayResize(map_openState, old+1);
   ArrayResize(map_lastSeenTime, old+1);

   map_providerTicket[old] = providerTicket;
   map_localPosTicket[old] = 0;
   map_localOrder[old] = 0;
   map_localDeal[old] = 0;
   map_openedAt[old] = 0;
   map_retryCount[old] = 0;
   map_openState[old] = 0;
   map_lastSeenTime[old] = 0;
   return old;
}

void RemoveMapIndex(int idx)
{
   int n = ArraySize(map_providerTicket);
   if(idx < 0 || idx >= n) return;
   for(int i=idx;i<n-1;++i)
   {
      map_providerTicket[i] = map_providerTicket[i+1];
      map_localPosTicket[i] = map_localPosTicket[i+1];
      map_localOrder[i] = map_localOrder[i+1];
      map_localDeal[i] = map_localDeal[i+1];
      map_openedAt[i] = map_openedAt[i+1];
      map_retryCount[i] = map_retryCount[i+1];
      map_openState[i]  = map_openState[i+1];
      map_lastSeenTime[i]= map_lastSeenTime[i+1];
   }
   ArrayResize(map_providerTicket, n-1);
   ArrayResize(map_localPosTicket, n-1);
   ArrayResize(map_localOrder, n-1);
   ArrayResize(map_localDeal, n-1);
   ArrayResize(map_openedAt, n-1);
   ArrayResize(map_retryCount, n-1);
   ArrayResize(map_openState,  n-1);
   ArrayResize(map_lastSeenTime, n-1);
}

// ---------- blacklist helpers ----------
bool BlacklistHas(ulong providerTicket)
{
   int n = ArraySize(blacklist_providerTicket);
   if(n==0) return false;
   int now = (int)TimeCurrent();
   for(int i=n-1;i>=0;--i)
   {
      int added = blacklist_time[i];
      if(BlacklistExpiryMinutes > 0)
      {
         if(now - added > BlacklistExpiryMinutes*60)
         {
            for(int j=i;j<n-1;++j)
            {
               blacklist_providerTicket[j] = blacklist_providerTicket[j+1];
               blacklist_time[j] = blacklist_time[j+1];
            }
            ArrayResize(blacklist_providerTicket, n-1);
            ArrayResize(blacklist_time, n-1);
            n = ArraySize(blacklist_providerTicket);
            continue;
         }
      }
      if(blacklist_providerTicket[i] == providerTicket) return true;
   }
   return false;
}

void PersistBlacklist()
{
   int f = FileOpen(BLACK_FILE, FILE_WRITE|FILE_BIN|FILE_COMMON);
   if(f == INVALID_HANDLE) { Print("PersistBlacklist: FileOpen failed: ", GetLastError()); return; }
   int count = ArraySize(blacklist_providerTicket);
   FileWriteInteger(f, count);
   for(int i=0;i<count;++i)
   {
      FileWriteLong(f, (long)blacklist_providerTicket[i]);
      FileWriteInteger(f, blacklist_time[i]);
   }
   FileWriteInteger(f, END_MARKER);
   FileClose(f);
}

void BlacklistAdd(ulong providerTicket)
{
   if(BlacklistHas(providerTicket)) return;
   int n = ArraySize(blacklist_providerTicket);
   ArrayResize(blacklist_providerTicket, n+1);
   ArrayResize(blacklist_time, n+1);
   blacklist_providerTicket[n] = providerTicket;
   blacklist_time[n] = (int)TimeCurrent();
   PersistBlacklist();
   PrintFormat("BlacklistAdd: provider %I64u added at %d", providerTicket, TimeCurrent());
}

void BlacklistRemove(ulong providerTicket)
{
   int n = ArraySize(blacklist_providerTicket);
   for(int i=0;i<n;++i)
   {
      if(blacklist_providerTicket[i] == providerTicket)
      {
         for(int j=i;j<n-1;++j)
         {
            blacklist_providerTicket[j] = blacklist_providerTicket[j+1];
            blacklist_time[j] = blacklist_time[j+1];
         }
         ArrayResize(blacklist_providerTicket, n-1);
         ArrayResize(blacklist_time, n-1);
         PersistBlacklist();
         return;
      }
   }
}

// ---------- mapping persistence ----------
void PersistMappings()
{
   int f = FileOpen(MAP_FILE, FILE_WRITE|FILE_BIN|FILE_COMMON);
   if(f == INVALID_HANDLE) { Print("PersistMappings: FileOpen failed: ", GetLastError()); return; }
   int count = ArraySize(map_providerTicket);
   FileWriteInteger(f, count);
   for(int i=0;i<count;++i)
   {
      FileWriteLong(f, (long)map_providerTicket[i]);
      FileWriteLong(f, (long)map_localPosTicket[i]);
      FileWriteLong(f, (long)map_localOrder[i]);
      FileWriteLong(f, (long)map_localDeal[i]);
      FileWriteInteger(f, map_openedAt[i]);
      FileWriteInteger(f, map_retryCount[i]);
   }
   FileWriteInteger(f, END_MARKER);
   FileClose(f);
}

void LoadMappings()
{
   ArrayResize(map_providerTicket,0);
   ArrayResize(map_localPosTicket,0);
   ArrayResize(map_localOrder,0);
   ArrayResize(map_localDeal,0);
   ArrayResize(map_openedAt,0);
   ArrayResize(map_retryCount,0);
   ArrayResize(map_openState,0);
   ArrayResize(map_lastSeenTime,0);

   int f = FileOpen(MAP_FILE, FILE_READ|FILE_BIN|FILE_COMMON);
   if(f == INVALID_HANDLE) return;
   int count = FileReadInteger(f);
   if(count <= 0 || count > 100000) { FileClose(f); return; }
   ArrayResize(map_providerTicket, count);
   ArrayResize(map_localPosTicket, count);
   ArrayResize(map_localOrder, count);
   ArrayResize(map_localDeal, count);
   ArrayResize(map_openedAt, count);
   ArrayResize(map_retryCount, count);
   ArrayResize(map_openState, count);
   ArrayResize(map_lastSeenTime, count);
   for(int i=0;i<count;++i)
   {
      long t1 = FileReadLong(f);
      long t2 = FileReadLong(f);
      long t3 = FileReadLong(f);
      long t4 = FileReadLong(f);
      map_providerTicket[i] = (ulong)t1;
      map_localPosTicket[i] = (ulong)t2;
      map_localOrder[i] = (ulong)t3;
      map_localDeal[i] = (ulong)t4;
      map_openedAt[i] = FileReadInteger(f);
      map_retryCount[i] = FileReadInteger(f);
      map_openState[i]  = 0;
      map_lastSeenTime[i]= 0;
   }
   int em = FileReadInteger(f);
   if(em != END_MARKER) Print("LoadMappings: end marker missing");
   FileClose(f);
}

void LoadBlacklist()
{
   ArrayResize(blacklist_providerTicket,0);
   ArrayResize(blacklist_time,0);
   int f = FileOpen(BLACK_FILE, FILE_READ|FILE_BIN|FILE_COMMON);
   if(f == INVALID_HANDLE) return;
   int count = FileReadInteger(f);
   if(count <= 0 || count > 100000) { FileClose(f); return; }
   ArrayResize(blacklist_providerTicket, count);
   ArrayResize(blacklist_time, count);
   for(int i=0;i<count;++i)
   {
      long t = FileReadLong(f);
      blacklist_providerTicket[i] = (ulong)t;
      blacklist_time[i] = FileReadInteger(f);
   }
   int em = FileReadInteger(f);
   if(em != END_MARKER) Print("LoadBlacklist: end marker missing");
   FileClose(f);
}

ulong FindLocalPosByComment(string comment)
{
   for(int i=PositionsTotal()-1;i>=0;--i)
   {
      CPositionInfo p;
      if(p.SelectByIndex(i))
      {
         if(StringCompare(p.Comment(), comment) == 0) return p.Ticket();
      }
   }
   return 0;
}

ulong FindLocalPosByTicket(ulong ticket)
{
   for(int i=PositionsTotal()-1;i>=0;--i)
   {
      CPositionInfo p;
      if(p.SelectByIndex(i))
      {
         if(p.Ticket() == ticket) return p.Ticket();
      }
   }
   return 0;
}

bool OrderExistsByComment(const string comment)
{
   int total = OrdersTotal();
   for(int i = total - 1; i >= 0; --i)
   {
      ulong ticket = OrderGetTicket(i);
      if(ticket == 0) continue;
      if(OrderSelect(ticket))
      {
         string c = OrderGetString(ORDER_COMMENT);
         if(StringCompare(c, comment) == 0)
            return true;
      }
   }
   return false;
}

// ---------------- symbol mapping utilities ----------------
string NormalizeSymbol(const string s)
{
   if(StringLen(s) == 0) return "";
   string out = ToUpperString(TrimString(s));
   string tmp = "";
   for(int i=0;i<StringLen(out);++i)
   {
      int ch = StringGetCharacter(out,i);
      if(ch == '.' || ch == '_' || ch == '-' || ch == '#') continue;
      tmp += CharToString((uchar)(ch & 0xFF));
   }
   out = tmp;
   if(StringLen(out) >= 3 && StringSubstr(out,0,3) == "PRO") out = StringSubstr(out,3);
   if(StringLen(out) >= 3 && StringSubstr(out,StringLen(out)-3,3) == "ECN") out = StringSubstr(out,0,StringLen(out)-3);
   out = TrimString(out);
   return out;
}

void AddAliasEntry(const string masterSym, const string aliases)
{
   int idx = ArraySize(alias_master);
   ArrayResize(alias_master, idx+1);
   ArrayResize(alias_list, idx+1);
   alias_master[idx] = masterSym;
   alias_list[idx] = aliases;
}

void InitAliasTable()
{
   ArrayResize(alias_master,0);
   ArrayResize(alias_list,0);
   AddAliasEntry("EURUSD","EURUSD;EURUSD.ecn;EURUSD#;pro.EURUSD");
   AddAliasEntry("GBPUSD","GBPUSD;GBPUSD.ecn;GBPUSD#");
   AddAliasEntry("USDJPY","USDJPY;USDJPY.ecn;USDJPY#");
   AddAliasEntry("USDCAD","USDCAD;USDCAD.ecn;USDCAD#");
   AddAliasEntry("XAUUSD","GOLDUSD;XAUUSD.m;XAU");
   AddAliasEntry("XAGUSD","SILVER;SILVER#;SILVERUSD;XAGUSD.m;XAG");
   AddAliasEntry("WTI","USOIL;OIL;OILCASH;OIL_USD;OILCash#;OILCash;US Oil");
   AddAliasEntry("BRENT","BRENT_OIL;UKOIL;BRENTCash#;BRENTCash;UK Brent Oil");
   AddAliasEntry("OILCash#","US Oil");
   AddAliasEntry("US30","US30;US30.cash;DJI;DOW");
   AddAliasEntry("NAS100","NAS100;NASDAQ;NASDAQ100");
}

bool IsSymbolTradableForSide(const string symbol, int desiredSide)
{
   if(StringLen(symbol) == 0) return false;
   if(!SymbolSelect(symbol, true)) return false;
   long mode = (long)SymbolInfoInteger(symbol, SYMBOL_TRADE_MODE);
   if(mode == SYMBOL_TRADE_MODE_DISABLED) return false;
   if(mode == SYMBOL_TRADE_MODE_CLOSEONLY) return false;
   if(desiredSide == 0) return (mode == SYMBOL_TRADE_MODE_FULL || mode == SYMBOL_TRADE_MODE_LONGONLY || mode == SYMBOL_TRADE_MODE_SHORTONLY);
   if(desiredSide == POSITION_TYPE_BUY) return (mode == SYMBOL_TRADE_MODE_FULL || mode == SYMBOL_TRADE_MODE_LONGONLY);
   if(desiredSide == POSITION_TYPE_SELL) return (mode == SYMBOL_TRADE_MODE_FULL || mode == SYMBOL_TRADE_MODE_SHORTONLY);
   return false;
}

string TryCandidateVariants(const string candidate, int desiredSide)
{
   if(StringLen(candidate) == 0) return "";
   if(IsSymbolTradableForSide(candidate, desiredSide)) return candidate;
   string up = ToUpperString(candidate);
   if(StringCompare(up,candidate) != 0 && IsSymbolTradableForSide(up, desiredSide)) return up;
   string low = ToLowerString(candidate);
   if(StringCompare(low,candidate) != 0 && IsSymbolTradableForSide(low, desiredSide)) return low;
   string normCand = NormalizeSymbol(candidate);
   if(StringLen(normCand) > 0)
   {
      int totalSymbols = SymbolsTotal(true);
      for(int si=0; si<totalSymbols; ++si)
      {
         string sname = SymbolName(si, true);
         if(StringLen(sname) == 0) continue;
         if(StringCompare(NormalizeSymbol(sname), normCand) == 0)
         {
            if(IsSymbolTradableForSide(sname, desiredSide))
            {
               return sname;
            }
         }
      }
   }
   return "";
}

string FindLocalSymbolForMaster(const string masterSymbol, int desiredSide)
{
   string ms = TrimString(masterSymbol);
   if(StringLen(ms) == 0) return "";
   
   for(int ci=0; ci < ArraySize(cache_master); ++ci)
   {
      if(StringCompare(cache_master[ci], ms) == 0)
      {
         if(IsSymbolTradableForSide(cache_local[ci], desiredSide))
         {
            return cache_local[ci];
         }
      }
   }
   
   if(IsSymbolTradableForSide(ms, desiredSide))
   {
      int ci = ArraySize(cache_master);
      ArrayResize(cache_master, ci+1);
      ArrayResize(cache_local, ci+1);
      cache_master[ci] = ms;
      cache_local[ci] = ms;
      return ms;
   }
   
   for(int u=0; u < ArraySize(user_map_master); ++u)
   {
      if(StringCompare(ms, TrimString(user_map_master[u])) == 0)
      {
         string candidate = TrimString(user_map_local[u]);
         string serverConstraint = TrimString(user_map_server[u]);
         if(StringLen(serverConstraint) > 0)
         {
            string curServer = ToLowerString(TrimString(AccountInfoString(ACCOUNT_SERVER)));
            if(StringCompare(curServer, ToLowerString(serverConstraint)) != 0) continue;
         }
         string found = TryCandidateVariants(candidate, desiredSide);
         if(StringLen(found) > 0)
         {
            int ci = ArraySize(cache_master);
            ArrayResize(cache_master, ci+1);
            ArrayResize(cache_local, ci+1);
            cache_master[ci] = ms;
            cache_local[ci] = found;
            return found;
         }
      }
   }
   
   string normMaster = NormalizeSymbol(ms);
   for(int ai=0; ai < ArraySize(alias_master); ++ai)
   {
      if(StringCompare(NormalizeSymbol(alias_master[ai]), normMaster) == 0 || StringCompare(TrimString(alias_master[ai]), ms) == 0)
      {
         string parts[];
         SplitString(alias_list[ai], ";", parts);
         for(int p=0;p<ArraySize(parts);++p)
         {
            string cand = TrimString(parts[p]);
            string found = TryCandidateVariants(cand, desiredSide);
            if(StringLen(found) > 0)
            {
               int ci = ArraySize(cache_master);
               ArrayResize(cache_master, ci+1);
               ArrayResize(cache_local, ci+1);
               cache_master[ci] = ms;
               cache_local[ci] = found;
               return found;
            }
         }
      }
   }
   
   int totalSymbols = SymbolsTotal(true);
   for(int si = 0; si < totalSymbols; ++si)
   {
      string candidate = SymbolName(si, true);
      if(StringLen(candidate) == 0) continue;
      if(StringCompare(NormalizeSymbol(candidate), normMaster) == 0)
      {
         if(IsSymbolTradableForSide(candidate, desiredSide))
         {
            int ci = ArraySize(cache_master);
            ArrayResize(cache_master, ci+1);
            ArrayResize(cache_local, ci+1);
               cache_master[ci] = ms;
               cache_local[ci] = candidate;
               return candidate;
         }
      }
   }
   
   // Only log failures when symbol mapping fails (throttled to avoid spam)
   static datetime lastSymbolMapFailLog = 0;
   static string lastFailedSymbol = "";
   datetime now = TimeCurrent();
   if(StringCompare(ms, lastFailedSymbol) != 0 || (now - lastSymbolMapFailLog >= 300))  // Log once per 5 minutes per symbol
   {
      PrintFormat("SymbolMap: FAILED to map master symbol '%s' to a tradable local symbol", ms);
      lastFailedSymbol = ms;
      lastSymbolMapFailLog = now;
   }
   return "";
}

void LoadSymbolMapFile()
{
   ArrayResize(user_map_master,0);
   ArrayResize(user_map_local,0);
   ArrayResize(user_map_server,0);
   int f = FileOpen(SYMBOL_MAP_FILE, FILE_READ|FILE_TXT|FILE_COMMON);
   if(f == INVALID_HANDLE) { PrintFormat("SymbolMap: no %s file found (that's OK)", SYMBOL_MAP_FILE); return; }
   PrintFormat("SymbolMap: loading %s", SYMBOL_MAP_FILE);
   while(!FileIsEnding(f))
   {
      string line = FileReadString(f);
      line = TrimString(line);
      if(StringLen(line) == 0) continue;
      if(StringGetCharacter(line,0) == '#') continue;
      string parts[];
      SplitString(line, ",", parts);
      if(ArraySize(parts) >= 2)
      {
         string master = TrimString(parts[0]);
         string local  = TrimString(parts[1]);
         string server = "";
         if(ArraySize(parts) >= 3) server = ToLowerString(TrimString(parts[2]));
         int idx = ArraySize(user_map_master);
         ArrayResize(user_map_master, idx+1);
         ArrayResize(user_map_local, idx+1);
         ArrayResize(user_map_server, idx+1);
         user_map_master[idx] = master;
         user_map_local[idx]  = local;
         user_map_server[idx] = server;
      }
   }
   FileClose(f);
}

void PersistSymbolCache()
{
   int f = FileOpen(SYMBOL_CACHE_FILE, FILE_WRITE|FILE_BIN|FILE_COMMON);
   if(f == INVALID_HANDLE) { Print("PersistSymbolCache: FileOpen failed: ", GetLastError()); return; }
   int count = ArraySize(cache_master);
   FileWriteInteger(f, count);
   for(int i=0;i<count;++i)
   {
      FileWriteInteger(f, StringLen(cache_master[i]));
      FileWriteString(f, cache_master[i]);
      FileWriteInteger(f, StringLen(cache_local[i]));
      FileWriteString(f, cache_local[i]);
   }
   FileWriteInteger(f, END_MARKER);
   FileClose(f);
}

void LoadSymbolCache()
{
   ArrayResize(cache_master,0);
   ArrayResize(cache_local,0);
   int f = FileOpen(SYMBOL_CACHE_FILE, FILE_READ|FILE_BIN|FILE_COMMON);
   if(f == INVALID_HANDLE) { return; }
   int count = FileReadInteger(f);
   if(count < 0 || count > 100000) { FileClose(f); return; }
   ArrayResize(cache_master, count);
   ArrayResize(cache_local, count);
   for(int i=0;i<count;++i)
   {
      int l1 = FileReadInteger(f);
      cache_master[i] = FileReadString(f, l1);
      int l2 = FileReadInteger(f);
      cache_local[i]  = FileReadString(f, l2);
   }
   int em = FileReadInteger(f);
   if(em != END_MARKER) Print("LoadSymbolCache: end marker missing");
   FileClose(f);
}

bool ReadProviderSnapshotStrict(
   const string snapshot_file,
   ulong  &outTickets[],
   string &outSymbols[],
   double &outVolumes[],
   int    &outTypes[],
   double &outSL[],
   double &outTP[],
   double &outMasterEquity,
   double &outOpenPrice[]
)
{
   ArrayResize(outTickets,0);
   ArrayResize(outSymbols,0);
   ArrayResize(outVolumes,0);
   ArrayResize(outTypes,0);
   ArrayResize(outSL,0);
   ArrayResize(outTP,0);
   ArrayResize(outOpenPrice,0);
   outMasterEquity = 0.0;

   if(StringLen(snapshot_file) == 0) return false;
   int f = FileOpen(snapshot_file, FILE_READ|FILE_BIN|FILE_COMMON);
   if(f == INVALID_HANDLE) return false;

   int version = FileReadInteger(f);
   if(version >= 3)
   {
      FileReadLong(f);
      outMasterEquity = FileReadDouble(f);
   }
   else if(version == 2)
   {
      outMasterEquity = FileReadDouble(f);
   }
   else
   {
      FileClose(f);
      return false;
   }

   int total = FileReadInteger(f);
   if(total < 0 || total > 10000) { FileClose(f); return false; }

   ArrayResize(outTickets, total);
   ArrayResize(outSymbols, total);
   ArrayResize(outVolumes, total);
   ArrayResize(outTypes, total);
   ArrayResize(outSL, total);
   ArrayResize(outTP, total);
   ArrayResize(outOpenPrice, total);

   for(int r=0;r<total;++r)
   {
      long t = FileReadLong(f);
      int len = FileReadInteger(f);
      string sym = FileReadString(f, len);
      double vol = FileReadDouble(f);
      int ptype  = FileReadInteger(f);
      double price = FileReadDouble(f);
      double sl   = FileReadDouble(f);
      double tp   = FileReadDouble(f);

      outTickets[r]   = (ulong)t;
      outSymbols[r]   = sym;
      outVolumes[r]   = vol;
      outTypes[r]     = ptype;
      outOpenPrice[r] = price;
      outSL[r]        = sl;
      outTP[r]        = tp;
   }

   int endm = FileReadInteger(f);
   FileClose(f);

   if(endm != END_MARKER)
   {
      ArrayResize(outTickets,0);
      ArrayResize(outSymbols,0);
      ArrayResize(outVolumes,0);
      ArrayResize(outTypes,0);
      ArrayResize(outSL,0);
      ArrayResize(outTP,0);
      ArrayResize(outOpenPrice,0);
      Print("ReadProviderSnapshotStrict: END_MARKER missing, skipping cycle");
      return false;
   }
   return true;
}

void HandleStartupHistoricalBlacklist()
{
   if(OpenHistoricalOnStart) return;
   int masterLoginToUse = g_masterLogin > 0 ? g_masterLogin : (clogin_master > 0 ? clogin_master : (int)AccountInfoInteger(ACCOUNT_LOGIN));
   string snapshot = SnapshotFileNameForLogin(masterLoginToUse);
   ulong provTickets[]; string provSymbols[]; double provVolumes[]; int provTypes[]; double provSL[]; double provTP[]; double masterEquity = 0.0; double provOpenPrice[];
   bool ok = ReadProviderSnapshotStrict(snapshot, provTickets, provSymbols, provVolumes, provTypes, provSL, provTP, masterEquity, provOpenPrice);
   if(!ok) return;
   int pc = ArraySize(provTickets);
   if(pc==0) return;
   Print("Startup: OpenHistoricalOnStart=FALSE -> blacklisting current provider tickets to avoid historical opens");
   for(int i=0;i<pc;i++) BlacklistAdd(provTickets[i]);
}

double NormalizeLotToStep(double lot, const string &symbol)
{
   double minLot = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN);
   double maxLot = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MAX);
   double step   = SymbolInfoDouble(symbol, SYMBOL_VOLUME_STEP);
   if(minLot <= 0 || step <= 0) return(lot);
   if(lot < minLot)
   {
      if(UseMinIfBelow) lot = minLot;
      else return 0.0;
   }
   if(lot > maxLot) lot = maxLot;
   double steps = MathFloor((lot - minLot) / step + 0.0000001);
   double normalized = minLot + steps * step;
   if(normalized < minLot) normalized = minLot;
   if(normalized > maxLot) normalized = maxLot;
   int digits = 0;
   double tmp = step;
   while(tmp < 1.0 && digits < 8) { tmp *= 10.0; digits++; }
   return NormalizeDouble(normalized, digits);
}

double CalculateLotSize(ulong providerTicket, double providerVolume, const string &symbol, double masterEquity)
{
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   double rawLot = providerVolume;

   switch(LotMode)
   {
      case FIXED_LOT:
         rawLot = FixedLot;
         break;
      case SAME_AS_MASTER:
         rawLot = providerVolume;
         break;
      case BASED_ON_EQUITY:
      {
         double eqRef = EquityReference;
         if(UseMasterEquityFromProvider && masterEquity > 0.0) eqRef = masterEquity;
         if(eqRef <= 0.0) eqRef = 1.0;
         rawLot = providerVolume * (equity / eqRef);
         break;
      }
      case MULT_ON_EQUITY:
      {
         double eqRef = EquityReference;
         if(UseMasterEquityFromProvider && masterEquity > 0.0) eqRef = masterEquity;
         if(eqRef <= 0.0) eqRef = 1.0;
         rawLot = providerVolume * EquityMultiplier * (equity / eqRef);
         break;
      }
      case MULT_ON_MASTER_LOT:
         rawLot = providerVolume * MasterLotMultiplier;
         break;
      default:
         rawLot = providerVolume;
   }

   double finalLot = NormalizeLotToStep(rawLot, symbol);
   return finalLot;
}

bool ModifyPositionSLTPByTicket(const ulong pos_ticket, const string symbol, const double newSL, const double newTP)
{
   MqlTradeRequest req;
   MqlTradeResult  res;
   ZeroMemory(req);
   ZeroMemory(res);
   req.action   = TRADE_ACTION_SLTP;
   req.position = pos_ticket;
   req.symbol   = symbol;
   req.sl       = newSL;
   req.tp       = newTP;
   if(!OrderSend(req, res)) return false;
   return (res.retcode == TRADE_RETCODE_DONE);
}

void SyncSLTPForMappedPosition(const ulong providerTicket, const ulong localPosTicket, const int masterIndex, const double &provSL[], const double &provTP[])
{
   CPositionInfo pos;
   bool found = false;
   string expectedComment = ProviderComment(providerTicket);
   for(int i = PositionsTotal() - 1; i >= 0; --i)
   {
      if(pos.SelectByIndex(i))
      {
         if(pos.Comment() == expectedComment)
         {
            found = true;
            break;
         }
      }
   }
   if(!found) return;
   string localSym = pos.Symbol();
   int digits = (int)SymbolInfoInteger(localSym, SYMBOL_DIGITS);
   double point = SymbolInfoDouble(localSym, SYMBOL_POINT);
   double masterSL_raw = provSL[masterIndex];
   double masterTP_raw = provTP[masterIndex];
   if(masterSL_raw <= 0.0 && masterTP_raw <= 0.0) return;
   double localSL = pos.StopLoss();
   double localTP = pos.TakeProfit();
   double newSL = 0.0;
   double newTP = 0.0;
   if(!ReverseTrades)
   {
      newSL = (masterSL_raw > 0.0 ? NormalizeDouble(masterSL_raw, digits) : 0.0);
      newTP = (masterTP_raw > 0.0 ? NormalizeDouble(masterTP_raw, digits) : 0.0);
   }
   else
   {
      double entry = pos.PriceOpen();
      double dSL = (masterSL_raw > 0.0 ? fabs(masterSL_raw - provTP[masterIndex]) : 0.0);
      double dTP = (masterTP_raw > 0.0 ? fabs(provTP[masterIndex] - masterSL_raw) : 0.0);
      if(dSL <= 0.0 && masterSL_raw > 0.0) dSL = fabs(entry - masterSL_raw);
      if(dTP <= 0.0 && masterTP_raw > 0.0) dTP = fabs(masterTP_raw - entry);
      if(pos.PositionType() == POSITION_TYPE_BUY)
      {
         newSL = (dSL > 0.0 ? NormalizeDouble(entry - dSL, digits) : 0.0);
         newTP = (dTP > 0.0 ? NormalizeDouble(entry + dTP, digits) : 0.0);
      }
      else
      {
         newSL = (dSL > 0.0 ? NormalizeDouble(entry + dSL, digits) : 0.0);
         newTP = (dTP > 0.0 ? NormalizeDouble(entry - dTP, digits) : 0.0);
      }
   }
   bool needUpdate = false;
   if((newSL == 0.0 && localSL != 0.0) || (newSL != 0.0 && fabs(localSL - newSL) > 5 * point)) needUpdate = true;
   if((newTP == 0.0 && localTP != 0.0) || (newTP != 0.0 && fabs(localTP - newTP) > 5 * point)) needUpdate = true;
   if(!needUpdate) return;
   ulong realPosTicket = pos.Ticket();
   if(ModifyPositionSLTPByTicket(realPosTicket, localSym, newSL, newTP))
   {
      PrintFormat("SLTP SYNC OK | provider=%I64u local=%I64u %s SL=%.5f TP=%.5f", providerTicket, realPosTicket, localSym, newSL, newTP);
   }
   else
   {
      PrintFormat("SLTP SYNC FAIL | provider=%I64u local=%I64u %s", providerTicket, realPosTicket, localSym);
   }
}

void SlaveSyncCycle()
{
   static int cycleCount = 0;
   static bool firstCall = true;
   cycleCount++;
   
   if(firstCall || cycleCount % 500 == 0)  // Reduced from 100 to 500 cycles
   {
      Print("==========================================");
      PrintFormat("SlaveSyncCycle: [DEBUG] Called - Cycle #%d", cycleCount);
      PrintFormat("SlaveSyncCycle: [DEBUG] g_determinedMode=%s", EnumToString(g_determinedMode));
      PrintFormat("SlaveSyncCycle: [DEBUG] g_masterLogin=%d", g_masterLogin);
      PrintFormat("SlaveSyncCycle: [DEBUG] clogin_master=%d", clogin_master);
      PrintFormat("SlaveSyncCycle: [DEBUG] Current Login=%d", AccountInfoInteger(ACCOUNT_LOGIN));
      Print("==========================================");
      firstCall = false;
   }
   
   // Check license before operations
   if(g_licenseValidator != NULL)
   {
      if(g_licenseValidator.IsExpired())
      {
         Print("License expired. Stopping copy trading operations.");
         return;
      }
   }
   
   // CRITICAL: Use ONLY g_masterLogin from backend - NO FALLBACK to clogin_master
   // This ensures snapshot file name consistency and prevents reading wrong file
   int masterLoginToUse = g_masterLogin;
   
   if(cycleCount <= 3)
   {
      PrintFormat("SlaveSyncCycle: [DEBUG] masterLoginToUse=%d (g_masterLogin=%d)", 
                  masterLoginToUse, g_masterLogin);
   }
   
   if(masterLoginToUse <= 0)
   {
      // CRITICAL ERROR: No master login from backend - slave cannot copy trades
      // Throttle error messages - only log once per minute to avoid flooding
      static datetime lastErrorLog = 0;
      datetime now = TimeCurrent();
      if(now - lastErrorLog >= 60) // Log once per minute
      {
         Print("==========================================");
         Print("SlaveSyncCycle: [CRITICAL ERROR] No master login from backend!");
         Print("SlaveSyncCycle: [CRITICAL ERROR] Slave cannot copy trades without master login.");
         PrintFormat("SlaveSyncCycle: [CRITICAL ERROR] g_masterLogin=%d, Current Login=%d", 
                     g_masterLogin, AccountInfoInteger(ACCOUNT_LOGIN));
         Print("SlaveSyncCycle: [CRITICAL ERROR] Backend must return accountConfig with masterLogin for slave account");
         Print("SlaveSyncCycle: [CRITICAL ERROR] Check:");
         Print("SlaveSyncCycle: [CRITICAL ERROR]   1. Account accountType is set to 'slave' in database");
         Print("SlaveSyncCycle: [CRITICAL ERROR]   2. CopyLink exists linking slave to master");
         Print("SlaveSyncCycle: [CRITICAL ERROR]   3. Backend API returns slave config in accountConfig");
         Print("SlaveSyncCycle: [CRITICAL ERROR] This error will be logged once per minute");
         Print("==========================================");
         lastErrorLog = now;
      }
      return;
   }
   
   // Match original code: use clogin_master directly (or g_masterLogin if set from backend)
   string snapshot = SnapshotFileNameForLogin(masterLoginToUse);
   
   ulong  provTickets[];
   string provSymbols[];
   double provVolumes[];
   int    provTypes[];
   double provSL[];
   double provTP[];
   double provOpenPrice[];
   double masterEquity = 0.0;

   bool ok = ReadProviderSnapshotStrict(snapshot, provTickets, provSymbols, provVolumes, provTypes, provSL, provTP, masterEquity, provOpenPrice);
   if(!ok)
   {
      // DEBUG: Log when snapshot read fails (throttled to once per minute)
      static datetime lastErrorLog = 0;
      if(TimeCurrent() - lastErrorLog > 60) // Log once per minute to avoid spam
      {
         Print("==========================================");
         PrintFormat("SlaveSyncCycle: [DEBUG] Failed to read snapshot from master login %d", masterLoginToUse);
         PrintFormat("SlaveSyncCycle: [DEBUG] Snapshot file: %s", snapshot);
         Print("SlaveSyncCycle: [DEBUG] Make sure master EA is running and writing snapshots");
         Print("SlaveSyncCycle: [DEBUG] Check if file exists in MT5 Files/Common folder");
         Print("==========================================");
         lastErrorLog = TimeCurrent();
      }
      return; // skip this cycle if snapshot is incomplete
   }
   
   // DEBUG: Log when snapshot is successfully read (only when position count changes)
   static int lastProvCount = -1;
   int provCount = ArraySize(provTickets);
   if(provCount != lastProvCount)  // Only log when count changes, not every 100 cycles
   {
      Print("==========================================");
      PrintFormat("SlaveSyncCycle: [DEBUG] Snapshot read successfully");
      PrintFormat("SlaveSyncCycle: [DEBUG] Master positions: %d", provCount);
      PrintFormat("SlaveSyncCycle: [DEBUG] Master login: %d", masterLoginToUse);
      if(provCount > 0)
      {
         PrintFormat("SlaveSyncCycle: [DEBUG] First position: ticket=%I64u, symbol=%s, volume=%.2f", 
                     provTickets[0], provSymbols[0], provVolumes[0]);
      }
      Print("==========================================");
      lastProvCount = provCount;
   }

   int now = (int)TimeCurrent();
   
   // OPTIMIZATION: Track if mappings changed to persist only once at end
   bool mappingsChanged = false;

   for(int k=0;k<provCount;++k)
   {
      int midxSeen = FindMapIndex(provTickets[k]);
      if(midxSeen >= 0) map_lastSeenTime[midxSeen] = now;
   }

   for(int mi = ArraySize(map_providerTicket)-1; mi >= 0; --mi)
   {
      ulong pt = map_providerTicket[mi];
      bool providerStillHas = false;
      for(int k=0;k<provCount;++k)
         if(provTickets[k] == pt) { providerStillHas = true; break; }

      bool localExists = false;
      if(map_localPosTicket[mi] != 0 && FindLocalPosByTicket(map_localPosTicket[mi]) != 0)
         localExists = true;
      else
      {
         ulong b = FindLocalPosByComment(ProviderComment(pt));
         if(b != 0) { map_localPosTicket[mi] = b; localExists = true; }
      }

      if(localExists)
      {
         if(!providerStillHas)
         {
            // Snapshot read succeeded - if position missing, it's a real close - close immediately
            if(MirrorOnClose)
            {
               if(trade.PositionClose((long)map_localPosTicket[mi]))
               {
                  RemoveMapIndex(mi);
                  mappingsChanged = true;  // Mark for batch persistence
               }
            }
            else
            {
               RemoveMapIndex(mi);
               mappingsChanged = true;  // Mark for batch persistence
            }
         }
      }
      else
      {
         if(providerStillHas)
         {
            BlacklistAdd(pt);
            RemoveMapIndex(mi);
            mappingsChanged = true;  // Mark for batch persistence
         }
         else
         {
            RemoveMapIndex(mi);
            mappingsChanged = true;  // Mark for batch persistence
         }
      }
   }

   if(CopySLTP)
   {
      for(int mi=0; mi<ArraySize(map_providerTicket); ++mi)
      {
         ulong pt = map_providerTicket[mi];
         int masterIndex = -1;
         for(int k=0;k<provCount;++k)
            if(provTickets[k] == pt) { masterIndex = k; break; }
         if(masterIndex < 0) continue;
         if(map_localPosTicket[mi] == 0) continue;
         SyncSLTPForMappedPosition(pt, map_localPosTicket[mi], masterIndex, provSL, provTP);
      }
   }

   for(int i=0;i<provCount;++i)
   {
      ulong  pt         = provTickets[i];
      string masterSym  = provSymbols[i];
      string pcomment   = ProviderComment(pt);
      int    providerSide = provTypes[i];

      if(BlacklistHas(pt))
      {
         continue;
      }

      int midx = FindMapIndex(pt);
      if(midx < 0) midx = AddMap(pt);

      bool localExists = false;
      if(map_localPosTicket[midx] != 0 && FindLocalPosByTicket(map_localPosTicket[midx]) != 0)
         localExists = true;
      else
      {
         ulong b = FindLocalPosByComment(pcomment);
         if(b != 0) { map_localPosTicket[midx] = b; localExists = true; }
         else if(OrderExistsByComment(pcomment))
         {
            map_openState[midx] = 1;
            localExists = true;
         }
      }

      if(localExists)
      {
         map_retryCount[midx] = 0;
         continue;
      }

      if(map_openState[midx] == 1 && map_openedAt[midx] != 0 && now - map_openedAt[midx] <= MaxInflightGuardSeconds)
         continue;

      if(map_retryCount[midx] >= MaxRetryAttempts)
         continue;

      map_openedAt[midx] = now;
      map_retryCount[midx]++;
      map_openState[midx] = 1;
      mappingsChanged = true;  // Mark for batch persistence instead of immediate persist

      string localSym = FindLocalSymbolForMaster(masterSym, providerSide);
      if(localSym == "")
      {
         // Throttle symbol mapping errors - only log once per minute
         static datetime lastSymbolErrorLog = 0;
         datetime now = TimeCurrent();
         if(now - lastSymbolErrorLog >= 60)
         {
            PrintFormat("SlaveSyncCycle: [DEBUG] Failed to map master symbol '%s' to local symbol", masterSym);
            lastSymbolErrorLog = now;
         }
         map_openState[midx] = 0;
         continue;
      }

      double vol = CalculateLotSize(pt, provVolumes[i], localSym, masterEquity);
      if(vol <= 0.0)
      {
         // Throttle lot size errors - only log once per minute
         static datetime lastLotErrorLog = 0;
         datetime now = TimeCurrent();
         if(now - lastLotErrorLog >= 60)
         {
            PrintFormat("SlaveSyncCycle: [DEBUG] Calculated lot size is 0 for position %I64u, skipping", pt);
            lastLotErrorLog = now;
         }
         map_openState[midx] = 0;
         continue;
      }

      int slaveSide = providerSide;
      if(ReverseTrades)
         slaveSide = (providerSide == POSITION_TYPE_BUY ? POSITION_TYPE_SELL : POSITION_TYPE_BUY);

      int digits = (int)SymbolInfoInteger(localSym, SYMBOL_DIGITS);
      double openSL = 0.0;
      double openTP = 0.0;

      if(CopySLTP && provOpenPrice[i] > 0)
      {
         double dSL = (provSL[i] > 0 ? fabs(provOpenPrice[i] - provSL[i]) : 0.0);
         double dTP = (provTP[i] > 0 ? fabs(provTP[i] - provOpenPrice[i]) : 0.0);
         double entryPrice = (slaveSide == POSITION_TYPE_BUY ? SymbolInfoDouble(localSym, SYMBOL_ASK) : SymbolInfoDouble(localSym, SYMBOL_BID));
         if(slaveSide == POSITION_TYPE_BUY)
         {
            openSL = (dSL > 0 ? NormalizeDouble(entryPrice - dSL, digits) : 0.0);
            openTP = (dTP > 0 ? NormalizeDouble(entryPrice + dTP, digits) : 0.0);
         }
         else
         {
            openSL = (dSL > 0 ? NormalizeDouble(entryPrice + dSL, digits) : 0.0);
            openTP = (dTP > 0 ? NormalizeDouble(entryPrice - dTP, digits) : 0.0);
         }
      }

      bool opened = false;
      if(slaveSide == POSITION_TYPE_BUY)
         opened = trade.Buy(vol, localSym, 0, openSL, openTP, pcomment);
      else
         opened = trade.Sell(vol, localSym, 0, openSL, openTP, pcomment);

      if(opened)
      {
      }
      else
      {
         static datetime lastTradeErrorLog = 0;
         datetime now = TimeCurrent();
         if(now - lastTradeErrorLog >= 60)  // Log once per minute
         {
            PrintFormat("SlaveSyncCycle: [ERROR] Trade open failed! Ticket: %I64u, Error: %d, Retcode: %d", 
                        pt, GetLastError(), trade.ResultRetcode());
            lastTradeErrorLog = now;
         }
         map_openState[midx] = 0;
      }
   }
   
   // OPTIMIZATION: Persist mappings only once at end of cycle if changed
   if(mappingsChanged)
   {
      PersistMappings();
   }
}

void MasterWriteSnapshot()
{
   int login_id = (int)AccountInfoInteger(ACCOUNT_LOGIN);
   string final_snapshot = SnapshotFileNameForLogin(login_id);
   string temp_snapshot  = final_snapshot + ".tmp";
   
   // DEBUG: Log snapshot writing (when position count changes)
   static int lastPosCount = -1;
   int currentPosCount = PositionsTotal();
   if(currentPosCount != lastPosCount)
   {
      PrintFormat("MasterWriteSnapshot: Writing snapshot for login %d, positions: %d", login_id, currentPosCount);
      lastPosCount = currentPosCount;
   }

   int f = FileOpen(temp_snapshot, FILE_WRITE|FILE_BIN|FILE_COMMON);
   if(f == INVALID_HANDLE) { Print("MasterWriteSnapshot: FileOpen failed ", GetLastError()); return; }

   int version = 3;
   double master_equity = AccountInfoDouble(ACCOUNT_EQUITY);

   FileWriteInteger(f, version);
   FileWriteLong(f, (long)login_id);
   FileWriteDouble(f, master_equity);

   int total = PositionsTotal();
   FileWriteInteger(f, total);

   for(int i=total-1;i>=0;--i)
   {
      CPositionInfo p;
      if(p.SelectByIndex(i))
      {
         ulong ticket = p.Ticket();
         string sym = p.Symbol();
         FileWriteLong(f, (long)ticket);
         FileWriteInteger(f, StringLen(sym));
         FileWriteString(f, sym);
         FileWriteDouble(f, p.Volume());
         FileWriteInteger(f, (int)p.PositionType());
         FileWriteDouble(f, p.PriceOpen());
         FileWriteDouble(f, p.StopLoss());
         FileWriteDouble(f, p.TakeProfit());
      }
   }
   FileWriteInteger(f, END_MARKER);
   FileClose(f);

   FileDelete(final_snapshot, FILE_COMMON);
   if(!FileMove(temp_snapshot, FILE_COMMON, final_snapshot, FILE_COMMON))
      Print("MasterWriteSnapshot: FileMove failed: ", GetLastError());
}

void PrintAbout()
{
   Print("------------------------------------------------------------");
   PrintFormat("EA: %s", EA_NAME_VERSION);
   PrintFormat("Company: %s", COMPANY_BRAND);
   PrintFormat("Website: %s", COMPANY_WEBSITE);
   PrintFormat("Support: %s", SUPPORT_CONTACT);
   PrintFormat("%s", RISK_DISCLAIMER);
   Print("------------------------------------------------------------");
}

void ShowSignature()
{
   if(!ShowSignatureOnChart) { Comment(""); return; }
   string lines = StringFormat("%s\n%s\nSupport: %s", EA_NAME_VERSION, COMPANY_WEBSITE, SUPPORT_CONTACT);
   Comment(lines);
}

// Check license periodically (automatic - daily at 00:00 + polling every 10 min)
void CheckLicensePeriodic()
{
   if(g_licenseValidator == NULL) return;
   
   datetime now = TimeCurrent();
   MqlDateTime dt;
   TimeToStruct(now, dt);
   
   bool shouldCheckDaily = false;
   bool shouldCheckPoll = false;
   
   // Daily check at 00:00 (midnight)
   if(dt.hour == LICENSE_CHECK_DAILY_HOUR && dt.min == 0 && dt.sec < 5)
   {
      // Check if we already checked today
      if(g_lastDailyCheck == 0)
      {
         shouldCheckDaily = true;
         g_lastDailyCheck = now;
      }
      else
      {
         // Compare dates (year, month, day only)
         MqlDateTime lastDt;
         TimeToStruct(g_lastDailyCheck, lastDt);
         
         if(dt.year != lastDt.year || dt.mon != lastDt.mon || dt.day != lastDt.day)
         {
            shouldCheckDaily = true;
            g_lastDailyCheck = now;
         }
      }
   }
   
   // Polling check every 10 minutes (to detect admin updates)
   if((now - g_lastLicenseCheck) >= LICENSE_CHECK_POLL_INTERVAL)
   {
      shouldCheckPoll = true;
   }
   
   // Perform daily check
   if(shouldCheckDaily)
   {
      Print("LicenseValidator: Daily license check (00:00)...");
      bool valid = g_licenseValidator.GetLicenseConfig(false); // Force API call
      g_lastLicenseCheck = now;
      
      if(valid)
      {
         LicenseCache info = g_licenseValidator.GetLicenseInfo();
         g_lastUpdatedTimestamp = info.lastUpdated;
         Print("LicenseValidator: Daily license check successful.");
      }
      else
      {
         Print("LicenseValidator: Daily license check failed. Using cached license if available.");
      }
   }
   // Perform polling check (for admin updates)
   else if(shouldCheckPoll)
   {
      Print("LicenseValidator: Polling for subscription updates...");
      
      // Always call API to check for updates (don't use cache)
      LicenseCache currentInfo = g_licenseValidator.GetLicenseInfo();
      string oldLastUpdated = currentInfo.lastUpdated;
      string oldExpiryDate = currentInfo.expiryDate;
      bool oldValid = currentInfo.valid;
      
      Print("LicenseValidator: [DEBUG] Before polling - Valid: ", oldValid ? "true" : "false", ", Expiry: ", oldExpiryDate, ", LastUpdated: ", oldLastUpdated);
      
      bool valid = g_licenseValidator.GetLicenseConfig(false); // Force API call to get latest data
      g_lastLicenseCheck = now;
      
      if(valid)
      {
         LicenseCache newInfo = g_licenseValidator.GetLicenseInfo();
         
         Print("LicenseValidator: [DEBUG] After polling - Valid: ", newInfo.valid ? "true" : "false", ", Expiry: ", newInfo.expiryDate, ", LastUpdated: ", newInfo.lastUpdated);
         
         // Check if subscription was updated by comparing lastUpdated timestamps
         if(StringLen(oldLastUpdated) == 0 || StringCompare(oldLastUpdated, newInfo.lastUpdated) != 0)
         {
            Print("==========================================");
            Print("LicenseValidator: Subscription updated detected! Refreshing license...");
            PrintFormat("LicenseValidator: Old lastUpdated: %s", oldLastUpdated);
            PrintFormat("LicenseValidator: New lastUpdated: %s", newInfo.lastUpdated);
            PrintFormat("LicenseValidator: Old expiryDate: %s", oldExpiryDate);
            PrintFormat("LicenseValidator: New expiryDate: %s", newInfo.expiryDate);
            PrintFormat("LicenseValidator: Old valid: %s", oldValid ? "true" : "false");
            PrintFormat("LicenseValidator: New valid: %s", newInfo.valid ? "true" : "false");
            Print("==========================================");
            
            // Show alert when expiry is updated (only if expiry date changed)
            if(StringCompare(oldExpiryDate, newInfo.expiryDate) != 0)
            {
               Alert("License Expiry Updated! Old: " + oldExpiryDate + " → New: " + newInfo.expiryDate);
            }
            else
            {
               // Expiry didn't change, but subscription was updated (maybe tier or other fields)
               Alert("License Updated! Expiry: " + newInfo.expiryDate + " | Valid: " + (newInfo.valid ? "Yes" : "No"));
            }
            
            g_lastUpdatedTimestamp = newInfo.lastUpdated;
            
            // Check if license is now expired
            if(g_licenseValidator.IsExpired())
            {
               Print("==========================================");
               Print("LicenseValidator: WARNING - License is now EXPIRED!");
               Print("LicenseValidator: Expiry Date: ", newInfo.expiryDate);
               Print("LicenseValidator: EA will be removed on next timer cycle.");
               Print("==========================================");
               Alert("License Expired! EA will stop. Expiry: " + newInfo.expiryDate);
            }
         }
         else
         {
            Print("LicenseValidator: No subscription updates detected.");
         }
      }
      else
      {
         Print("LicenseValidator: Polling API call failed. Will retry on next poll.");
      }
   }
}

int OnInit()
{
   // Clear marker for OnInit logs - makes it easy to find in log
   Print("==========================================");
   Print("==========================================");
   Print("========== EA INITIALIZATION START ========");
   Print("==========================================");
   Print("==========================================");
   
   // Initialize license validator (automatic - gets current MT5 login)
   if(StringLen(UserId) > 0)
   {
      long currentLogin = AccountInfoInteger(ACCOUNT_LOGIN);
      PrintFormat("LicenseValidator: Initializing for User ID: %s, MT5 Login: %d", UserId, currentLogin);
      
      g_licenseValidator = new CLicenseValidator(LicenseApiUrl, UserId);
      
      Print("LicenseValidator: Getting license configuration on startup...");
      bool valid = g_licenseValidator.GetLicenseConfig(false); // Force API call on startup
      g_lastLicenseCheck = TimeCurrent();
      g_lastDailyCheck = 0; // Will check at next midnight
      
      if(!valid)
      {
         Print("LicenseValidator: License configuration failed on startup!");
         LicenseCache info = g_licenseValidator.GetLicenseInfo();
         
         // DEBUG: Log all info for debugging
         Print("==========================================");
         Print("LicenseValidator: [DEBUG] ErrorType: '", info.errorType, "'");
         Print("LicenseValidator: [DEBUG] ErrorMessage: '", info.errorMessage, "'");
         Print("LicenseValidator: [DEBUG] Valid: ", info.valid ? "true" : "false");
         Print("LicenseValidator: [DEBUG] ExpiryDate: '", info.expiryDate, "'");
         Print("LicenseValidator: [DEBUG] ErrorType length: ", StringLen(info.errorType));
         Print("==========================================");
         
         // Check error type to show appropriate message
         if(StringLen(info.errorType) > 0)
         {
            if(info.errorType == "INVALID_USER")
            {
               Print("==========================================");
               Print("LicenseValidator: INVALID USER ID!");
               Print("LicenseValidator: The provided User ID does not exist in the system.");
               if(StringLen(info.errorMessage) > 0)
                  PrintFormat("LicenseValidator: Error: %s", info.errorMessage);
               Print("LicenseValidator: Please check your User ID in EA inputs.");
               Print("LicenseValidator: EA will be removed from chart.");
               Print("==========================================");
               Alert("Invalid User ID! Please check your User ID. EA Stopped.");
               ExpertRemove();
               return(INIT_FAILED);
            }
            else if(info.errorType == "EXPIRED")
            {
               Print("==========================================");
               Print("LicenseValidator: License is EXPIRED on startup!");
               PrintFormat("LicenseValidator: Expiry Date: %s", info.expiryDate);
               Print("LicenseValidator: EA will be removed from chart.");
               Print("==========================================");
               Alert("License Expired on Startup! Expiry: " + info.expiryDate);
               ExpertRemove();
               return(INIT_FAILED);
            }
            else if(info.errorType == "INACTIVE")
            {
               Print("==========================================");
               Print("LicenseValidator: User account is INACTIVE!");
               if(StringLen(info.errorMessage) > 0)
                  PrintFormat("LicenseValidator: Error: %s", info.errorMessage);
               Print("LicenseValidator: EA will be removed from chart.");
               Print("==========================================");
               Alert("User account is inactive! EA Stopped.");
               ExpertRemove();
               return(INIT_FAILED);
            }
         }
         
         // Generic error handling
         if(StringLen(info.errorMessage) > 0)
            Print("LicenseValidator: Error: ", info.errorMessage);
         
         // If errorType was detected and handled above, we should have already returned
         // If we reach here, errorType was not detected or was empty
         
         // Check if license is expired (only if not invalid user)
         if(StringLen(info.errorType) == 0)
         {
            Print("LicenseValidator: [DEBUG] No errorType detected, checking if expired...");
            if(g_licenseValidator.IsExpired())
            {
               Print("==========================================");
               Print("LicenseValidator: License is EXPIRED on startup!");
               PrintFormat("LicenseValidator: Expiry Date: %s", info.expiryDate);
               Print("LicenseValidator: EA will be removed from chart.");
               Print("==========================================");
               Alert("License Expired on Startup! Expiry: " + info.expiryDate);
               ExpertRemove();
               return(INIT_FAILED);
            }
            
            // Check if we have cached license (offline mode)
            if(info.valid)
            {
               Print("LicenseValidator: Using cached license (offline mode). EA will continue.");
               Print("LicenseValidator: Will retry API call periodically.");
            }
            else
            {
               Print("LicenseValidator: No valid license found. EA will not function.");
               Alert("License validation failed! Please check your User ID and backend connection. EA Stopped.");
               ExpertRemove();
               return(INIT_FAILED);
            }
         }
         else
         {
            // ErrorType was detected but not handled above - this shouldn't happen
            Print("LicenseValidator: [WARNING] ErrorType detected but not handled: ", info.errorType);
            Alert("License validation failed! Error: " + info.errorType + ". EA Stopped.");
            ExpertRemove();
            return(INIT_FAILED);
         }
      }
      else
      {
         Print("LicenseValidator: License configuration retrieved successfully!");
         LicenseCache info = g_licenseValidator.GetLicenseInfo();
         PrintFormat("LicenseValidator: Tier: %s, Expiry: %s", info.tier, info.expiryDate);
         if(StringLen(info.lastUpdated) > 0)
            PrintFormat("LicenseValidator: Last Updated: %s", info.lastUpdated);
         
         // Show initial license status alert on startup
         string expiryDisplay = (StringLen(info.expiryDate) > 0) ? info.expiryDate : "No expiry";
         Alert("License Valid - Expiry: " + expiryDisplay + " | Tier: " + info.tier);
         
         // Even if valid=true, check if expired
         if(g_licenseValidator.IsExpired())
         {
            Print("==========================================");
            Print("LicenseValidator: License is EXPIRED on startup!");
            PrintFormat("LicenseValidator: Expiry Date: %s", info.expiryDate);
            Print("LicenseValidator: EA will be removed from chart.");
            Print("==========================================");
            Alert("License Expired on Startup! Expiry: " + info.expiryDate);
            ExpertRemove();
            return(INIT_FAILED);
         }
         
         // Get account configuration
         AccountConfig accConfig = g_licenseValidator.GetCurrentAccountConfig();
         if(StringLen(accConfig.role) > 0)
         {
            PrintFormat("LicenseValidator: Account Role: %s", accConfig.role);
            if(accConfig.role == "slave" && StringLen(accConfig.masterLogin) > 0)
               PrintFormat("LicenseValidator: Master Login: %s", accConfig.masterLogin);
         }
         
         // Store lastUpdated for polling
         g_lastUpdatedTimestamp = info.lastUpdated;
      }
   }
   else
   {
      Print("LicenseValidator: UserId not configured. License validation skipped.");
      Print("LicenseValidator: Configure UserId in EA inputs to enable license validation.");
      ExpertRemove();
      return(INIT_FAILED);
   }
   
   long login_id = (long)AccountInfoInteger(ACCOUNT_LOGIN);
   
   // Determine mode from account configuration (if available)
   // Start with input values as fallback
   ENUM_MODE determinedMode = Mode; // Use input as fallback
   int determinedMasterLogin = clogin_master; // Use input as fallback
   
   Print("==========================================");
   Print("OnInit: [DEBUG] Mode determination starting");
   PrintFormat("OnInit: [DEBUG] Initial values - Mode=%s, clogin_master=%d", EnumToString(Mode), clogin_master);
   PrintFormat("OnInit: [DEBUG] g_licenseValidator=%s", g_licenseValidator != NULL ? "available" : "NULL");
   Print("==========================================");
   
   // Try to get mode from backend config
   if(g_licenseValidator != NULL)
   {
      AccountConfig accConfig = g_licenseValidator.GetCurrentAccountConfig();
      
      // DEBUG: Log account config details
      Print("==========================================");
      Print("LicenseValidator: [DEBUG] Account Configuration Check");
      PrintFormat("LicenseValidator: [DEBUG] Current MT5 Login: %d", login_id);
      PrintFormat("LicenseValidator: [DEBUG] Account Role: '%s'", accConfig.role);
      PrintFormat("LicenseValidator: [DEBUG] Master Login: '%s'", accConfig.masterLogin);
      PrintFormat("LicenseValidator: [DEBUG] Account Name: '%s'", accConfig.accountName);
      PrintFormat("LicenseValidator: [DEBUG] LoginId: '%s'", accConfig.loginId);
      Print("==========================================");
      
      if(StringLen(accConfig.role) > 0)
      {
         PrintFormat("OnInit: [DEBUG] Backend returned role: '%s'", accConfig.role);
         if(accConfig.role == "master")
         {
            determinedMode = MODE_MASTER;
            determinedMasterLogin = (int)login_id; // Master is this account
            PrintFormat("LicenseValidator: Account configured as MASTER (from backend)");
            PrintFormat("OnInit: [DEBUG] Set determinedMode=MODE_MASTER, determinedMasterLogin=%d", determinedMasterLogin);
         }
         else if(accConfig.role == "slave")
         {
            determinedMode = MODE_SLAVE;
            PrintFormat("OnInit: [DEBUG] Backend returned SLAVE role");
            PrintFormat("OnInit: [DEBUG] accConfig.masterLogin='%s' (length=%d)", accConfig.masterLogin, StringLen(accConfig.masterLogin));
            
            if(StringLen(accConfig.masterLogin) > 0)
            {
               determinedMasterLogin = (int)StringToInteger(accConfig.masterLogin);
               PrintFormat("LicenseValidator: Account configured as SLAVE (from backend), Master: %d", determinedMasterLogin);
               PrintFormat("OnInit: [DEBUG] Set determinedMasterLogin=%d from backend", determinedMasterLogin);
            }
            else
            {
               Print("==========================================");
               Print("LicenseValidator: [WARNING] Slave account but no master login in config.");
               PrintFormat("LicenseValidator: [WARNING] Using fallback master login from input: %d", clogin_master);
               Print("==========================================");
               if(clogin_master > 0)
               {
                  determinedMasterLogin = clogin_master;
                  PrintFormat("OnInit: [DEBUG] Set determinedMasterLogin=%d from input fallback", determinedMasterLogin);
               }
               else
               {
                  Print("==========================================");
                  Print("LicenseValidator: [ERROR] No master login available!");
                  Print("LicenseValidator: [ERROR] Backend config missing master login AND input clogin_master=0");
                  Print("LicenseValidator: [ERROR] EA may not function correctly.");
                  Print("==========================================");
               }
            }
         }
         else
         {
            PrintFormat("LicenseValidator: Account role: %s (using input mode as fallback)", accConfig.role);
            PrintFormat("OnInit: [DEBUG] Unknown role '%s', keeping input values", accConfig.role);
         }
      }
      else
      {
         Print("==========================================");
         Print("LicenseValidator: [WARNING] No account role from backend");
         PrintFormat("LicenseValidator: [WARNING] Using input Mode=%s, Master Login=%d", EnumToString(Mode), clogin_master);
         Print("==========================================");
      }
   }
   else
   {
      Print("==========================================");
      Print("LicenseValidator: [WARNING] License validator not available");
      PrintFormat("LicenseValidator: [WARNING] Using input Mode=%s, Master Login=%d", EnumToString(Mode), clogin_master);
      Print("==========================================");
   }
   
   Print("==========================================");
   PrintFormat("OnInit: [DEBUG] Final determined values:");
   PrintFormat("OnInit: [DEBUG] determinedMode=%s", EnumToString(determinedMode));
   PrintFormat("OnInit: [DEBUG] determinedMasterLogin=%d", determinedMasterLogin);
   Print("==========================================");
   
   // Validate master login if in master mode
   if(determinedMode == MODE_MASTER)
   {
      if(login_id != determinedMasterLogin)
      {
         Print("MASTER login mismatch expected ", determinedMasterLogin, " got ", login_id);
         ExpertRemove();
         return(INIT_FAILED);
      }
   }
   
   PrintFormat("%s initialized. Mode=%s Login=%d Server=%s", EA_NAME_VERSION, EnumToString(determinedMode), login_id, AccountInfoString(ACCOUNT_SERVER));
   
   // Store determined mode and master login globally
   g_determinedMode = determinedMode;
   g_determinedMasterLogin = determinedMasterLogin;
   
   // CRITICAL: Always set g_masterLogin - use backend config if available, otherwise use input fallback
   // This matches original code behavior where clogin_master was used directly
   Print("==========================================");
   Print("OnInit: [DEBUG] Setting g_masterLogin");
   PrintFormat("OnInit: [DEBUG] determinedMasterLogin=%d", determinedMasterLogin);
   PrintFormat("OnInit: [DEBUG] clogin_master=%d", clogin_master);
   PrintFormat("OnInit: [DEBUG] determinedMode=%s", EnumToString(determinedMode));
   PrintFormat("OnInit: [DEBUG] login_id=%d", login_id);
   
   if(determinedMasterLogin > 0)
   {
      g_masterLogin = determinedMasterLogin;  // Use backend config
      PrintFormat("OnInit: [DEBUG] Using backend config: g_masterLogin=%d", g_masterLogin);
   }
   else if(determinedMode == MODE_MASTER)
   {
      g_masterLogin = (int)login_id;  // Master is this account
      PrintFormat("OnInit: [DEBUG] Using current login (master): g_masterLogin=%d", g_masterLogin);
   }
   else if(determinedMode == MODE_SLAVE)
   {
      // SLAVE mode - MUST have master login from backend
      if(determinedMasterLogin > 0)
      {
         g_masterLogin = determinedMasterLogin;
         PrintFormat("OnInit: [DEBUG] SLAVE mode - Using backend config: g_masterLogin=%d", g_masterLogin);
      }
      else
      {
         Print("==========================================");
         Print("OnInit: [CRITICAL ERROR] SLAVE mode but master login is NOT set from backend!");
         PrintFormat("OnInit: [CRITICAL ERROR] Backend returned: determinedMasterLogin=%d", determinedMasterLogin);
         Print("OnInit: [CRITICAL ERROR] Backend must return accountConfig with masterLogin for slave account");
         Print("OnInit: [CRITICAL ERROR] Check:");
         Print("OnInit: [CRITICAL ERROR]   1. Account accountType is set to 'slave' in database");
         Print("OnInit: [CRITICAL ERROR]   2. CopyLink exists linking slave to master");
         Print("OnInit: [CRITICAL ERROR]   3. Backend API returns slave config in accountConfig");
         Print("OnInit: [CRITICAL ERROR] EA will not function correctly without master login!");
         Print("==========================================");
         g_masterLogin = 0; // Will cause error in SlaveSyncCycle
      }
   }
   else
   {
      g_masterLogin = clogin_master;  // Standalone or unknown mode - use input
      PrintFormat("OnInit: [DEBUG] Using input fallback: g_masterLogin=%d", g_masterLogin);
   }
   
   // DEBUG: Log mode and master login for troubleshooting
   Print("==========================================");
   PrintFormat("EA Configuration: Mode=%s", EnumToString(determinedMode));
   PrintFormat("EA Configuration: Current Login=%d", login_id);
   PrintFormat("EA Configuration: Master Login=%d (from %s)", g_masterLogin, determinedMasterLogin > 0 ? "backend" : "input");
   PrintFormat("EA Configuration: Input Mode=%s, Input clogin_master=%d", EnumToString(Mode), clogin_master);
   if(determinedMode == MODE_MASTER)
      Print("EA Configuration: This account is MASTER - will write snapshots");
   else if(determinedMode == MODE_SLAVE)
      PrintFormat("EA Configuration: This account is SLAVE - will read snapshots from master login %d", g_masterLogin);
   Print("==========================================");
   
   // DEBUG: Log mode and master login for troubleshooting
   Print("==========================================");
   PrintFormat("EA Configuration: Mode=%s", EnumToString(determinedMode));
   PrintFormat("EA Configuration: Current Login=%d", login_id);
   PrintFormat("EA Configuration: Master Login=%d", g_masterLogin);
   if(determinedMode == MODE_MASTER)
      Print("EA Configuration: This account is MASTER - will write snapshots");
   else if(determinedMode == MODE_SLAVE)
      PrintFormat("EA Configuration: This account is SLAVE - will read snapshots from master login %d", g_masterLogin);
   Print("==========================================");
   
   ShowSignature();
   if(ShowAboutInExperts) PrintAbout();
   
   InitAliasTable();
   LoadSymbolMapFile();
   LoadSymbolCache();
   
   if(g_determinedMode == MODE_SLAVE)
   {
      LoadMappings();
      LoadBlacklist();
      HandleStartupHistoricalBlacklist();
   }
   
   EventSetTimer(1);
   
   // Clear marker for OnInit logs - makes it easy to find in log
   Print("==========================================");
   Print("==========================================");
   Print("========== EA INITIALIZATION END ==========");
   Print("==========================================");
   Print("==========================================");
   
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   PersistSymbolCache();
   if(g_determinedMode == MODE_SLAVE) { PersistMappings(); PersistBlacklist(); }
   if(g_licenseValidator != NULL)
   {
      delete g_licenseValidator;
      g_licenseValidator = NULL;
   }
   Comment("");
}

void OnTimer()
{
   static int timerCount = 0;
   static bool firstTimer = true;
   static datetime lastTimerLog = 0;
   timerCount++;
   
   // Reduced logging frequency - only first call and every 5 minutes
   if(firstTimer || (TimeCurrent() - lastTimerLog > 300))  // Changed from 60 to 300 seconds
   {
      Print("==========================================");
      PrintFormat("OnTimer: [DEBUG] Timer cycle #%d", timerCount);
      PrintFormat("OnTimer: [DEBUG] g_determinedMode=%s", EnumToString(g_determinedMode));
      PrintFormat("OnTimer: [DEBUG] g_masterLogin=%d", g_masterLogin);
      PrintFormat("OnTimer: [DEBUG] Mode input=%s", EnumToString(Mode));
      PrintFormat("OnTimer: [DEBUG] clogin_master input=%d", clogin_master);
      if(g_determinedMode == MODE_MASTER)
         Print("OnTimer: [DEBUG] Will call MasterWriteSnapshot()");
      else
         Print("OnTimer: [DEBUG] Will call SlaveSyncCycle()");
      Print("==========================================");
      firstTimer = false;
      lastTimerLog = TimeCurrent();
   }
   
   // Check license status first - stop EA if invalid or expired
   if(g_licenseValidator != NULL)
   {
      LicenseCache info = g_licenseValidator.GetLicenseInfo();
      
      // Check for invalid user first
      if(StringLen(info.errorType) > 0 && info.errorType == "INVALID_USER")
      {
         Print("==========================================");
         Print("LicenseValidator: INVALID USER ID!");
         Print("LicenseValidator: The provided User ID does not exist in the system.");
         Print("LicenseValidator: Please check your User ID in EA inputs.");
         Print("LicenseValidator: EA will be removed from chart.");
         Print("==========================================");
         Alert("Invalid User ID! Please check your User ID. EA Stopped.");
         Comment("INVALID USER ID!\nPlease check your User ID\nEA Stopped");
         ExpertRemove();
         return;
      }
      
      // Check if expired
      if(g_licenseValidator.IsExpired())
      {
         string expiryMsg = "LICENSE EXPIRED! Expiry Date: " + info.expiryDate;
         Print("==========================================");
         Print("LicenseValidator: " + expiryMsg);
         Print("LicenseValidator: EA will be removed from chart.");
         Print("==========================================");
         
         // Show alert on chart
         Alert("License Expired! EA Stopped. Expiry: " + info.expiryDate);
         Comment("LICENSE EXPIRED!\nExpiry: " + info.expiryDate + "\nEA Stopped");
         
         // Remove EA from chart
         ExpertRemove();
         return;
      }
      
      // Check if account is not in allowed accounts list (account removed/changed)
      // Skip this check if errorType is INVALID_USER (already handled above)
      if(!info.valid && (StringLen(info.errorType) == 0 || info.errorType != "INVALID_USER"))
      {
         long currentLogin = AccountInfoInteger(ACCOUNT_LOGIN);
         Print("==========================================");
         Print("LicenseValidator: ACCOUNT NOT IN ALLOWED ACCOUNTS LIST!");
         PrintFormat("LicenseValidator: Current MT5 Login: %d", currentLogin);
         Print("LicenseValidator: This account is no longer in your allowed accounts list.");
         Print("LicenseValidator: The account may have been removed or changed in the backend.");
         Print("LicenseValidator: Please check your account configuration in the dashboard.");
         Print("LicenseValidator: EA will be removed from chart.");
         Print("==========================================");
         Alert("Account not in allowed accounts list! EA Stopped. Please check your account configuration.");
         Comment("ACCOUNT NOT ALLOWED!\nAccount removed/changed\nEA Stopped");
         
         // Remove EA from chart
         ExpertRemove();
         return;
      }
   }
   
   // Periodic license check
   CheckLicensePeriodic();
   
   if(g_determinedMode == MODE_MASTER) MasterWriteSnapshot();
   else SlaveSyncCycle();
}

