//+------------------------------------------------------------------+
//| LicenseValidator.mqh - License validation service for EA License tier |
//+------------------------------------------------------------------+
//| Purpose: Validates license via backend API and caches locally |
//+------------------------------------------------------------------+

#include "LicenseHttpClient.mqh"

// License cache structure
struct LicenseCache
{
   bool      valid;
   string    expiryDate;      // ISO date string
   string    lastUpdated;     // Last time subscription was updated by admin (ISO date string)
   string    allowedAccounts[]; // Array of allowed MT5 account numbers
   string    tier;            // "EA_LICENSE" or "FULL_ACCESS"
   datetime  lastCheckTime;   // Last time license was checked
   string    errorMessage;    // Error message if validation failed
   string    errorType;       // Error type: "INVALID_USER", "EXPIRED", "INACTIVE", "OTHER"
};

// Account configuration structure
struct AccountConfig
{
   string    loginId;
   string    role;            // "master", "slave", "standalone"
   string    masterLogin;    // Master login ID if slave
   string    accountName;
};

class CLicenseValidator
{
private:
   string            m_licenseApiUrl;
   string            m_userId;
   string            m_currentMt5Login;  // Current MT5 account login
   string            m_mt5Accounts[];     // Legacy: for backward compatibility
   CLicenseHttpClient *m_httpClient;
   LicenseCache      m_cache;
   bool              m_cacheLoaded;
   AccountConfig     m_accountConfigs[];  // Account configurations from backend
   
   // License cache file
   string GetCacheFileName()
   {
      return "license_cache.bin";
   }
   
   // Parse JSON response (simple parser for license validation response)
   bool ParseLicenseResponse(string jsonResponse, LicenseCache &cache)
   {
      // Simple JSON parsing (for MQL5)
      // Expected format: {"success":true,"data":{"valid":true,"expiryDate":"...","allowedAccounts":[...],"tier":"EA_LICENSE"}}
      
      cache.valid = false;
      ArrayResize(cache.allowedAccounts, 0);
      
      // Check if success
      if(StringFind(jsonResponse, "\"success\":true") < 0 && StringFind(jsonResponse, "\"success\": true") < 0)
      {
         // Try to extract error message
         int msgPos = StringFind(jsonResponse, "\"message\":");
         if(msgPos >= 0)
         {
            int start = StringFind(jsonResponse, "\"", msgPos + 10) + 1;
            int end = StringFind(jsonResponse, "\"", start);
            if(end > start)
               cache.errorMessage = StringSubstr(jsonResponse, start, end - start);
         }
         return false;
      }
      
      // Extract data object
      int dataPos = StringFind(jsonResponse, "\"data\":");
      if(dataPos < 0) return false;
      
      // Extract valid field
      int validPos = StringFind(jsonResponse, "\"valid\":", dataPos);
      if(validPos >= 0)
      {
         int truePos = StringFind(jsonResponse, "true", validPos);
         int falsePos = StringFind(jsonResponse, "false", validPos);
         if(truePos >= 0 && (falsePos < 0 || truePos < falsePos))
            cache.valid = true;
         else if(falsePos >= 0 && (truePos < 0 || falsePos < truePos))
            cache.valid = false; // Explicitly set to false if backend says so
      }
      
      // IMPORTANT: Continue parsing even if valid=false, so we can get expiry date and check if expired
      // Don't return false here - we need to parse expiry date even for invalid licenses
      
      // Extract expiryDate
      int expiryPos = StringFind(jsonResponse, "\"expiryDate\":", dataPos);
      if(expiryPos >= 0)
      {
         int start = StringFind(jsonResponse, "\"", expiryPos + 13) + 1;
         int end = StringFind(jsonResponse, "\"", start);
         if(end > start)
         {
            cache.expiryDate = StringSubstr(jsonResponse, start, end - start);
            // Convert ISO date to datetime
            // Format: "2024-12-31T00:00:00.000Z"
            string dateStr = StringSubstr(cache.expiryDate, 0, 19); // "2024-12-31T00:00:00"
            string parts[];
            StringSplit(dateStr, 'T', parts);
            if(ArraySize(parts) == 2)
            {
               string datePart = parts[0]; // "2024-12-31"
               string timePart = parts[1]; // "00:00:00"
               string dateParts[];
               string timeParts[];
               StringSplit(datePart, '-', dateParts);
               StringSplit(timePart, ':', timeParts);
               if(ArraySize(dateParts) == 3 && ArraySize(timeParts) == 3)
               {
                  int year = (int)StringToInteger(dateParts[0]);
                  int month = (int)StringToInteger(dateParts[1]);
                  int day = (int)StringToInteger(dateParts[2]);
                  int hour = (int)StringToInteger(timeParts[0]);
                  int minute = (int)StringToInteger(timeParts[1]);
                  int second = (int)StringToInteger(timeParts[2]);
                  m_cache.lastCheckTime = StringToTime(StringFormat("%04d.%02d.%02d %02d:%02d:%02d", year, month, day, hour, minute, second));
               }
            }
         }
      }
      
      // Extract tier
      int tierPos = StringFind(jsonResponse, "\"tier\":", dataPos);
      if(tierPos >= 0)
      {
         int start = StringFind(jsonResponse, "\"", tierPos + 7) + 1;
         int end = StringFind(jsonResponse, "\"", start);
         if(end > start)
            cache.tier = StringSubstr(jsonResponse, start, end - start);
      }
      
      // Extract allowedAccounts array
      int accountsPos = StringFind(jsonResponse, "\"allowedAccounts\":[", dataPos);
      if(accountsPos >= 0)
      {
         int arrayStart = StringFind(jsonResponse, "[", accountsPos) + 1;
         int arrayEnd = StringFind(jsonResponse, "]", arrayStart);
         if(arrayEnd > arrayStart)
         {
            string arrayContent = StringSubstr(jsonResponse, arrayStart, arrayEnd - arrayStart);
            string accounts[];
            StringSplit(arrayContent, ',', accounts);
            ArrayResize(cache.allowedAccounts, 0);
            for(int i = 0; i < ArraySize(accounts); i++)
            {
               string acc = accounts[i];
               // Trim whitespace (custom function - remove leading/trailing spaces)
               acc = TrimString(acc);
               // Remove quotes
               if(StringGetCharacter(acc, 0) == '"')
                  acc = StringSubstr(acc, 1);
               if(StringGetCharacter(acc, StringLen(acc) - 1) == '"')
                  acc = StringSubstr(acc, 0, StringLen(acc) - 1);
               if(StringLen(acc) > 0)
               {
                  int idx = ArraySize(cache.allowedAccounts);
                  ArrayResize(cache.allowedAccounts, idx + 1);
                  cache.allowedAccounts[idx] = acc;
               }
            }
         }
      }
      
      cache.lastCheckTime = TimeCurrent();
      return true;
   }
   
   // Parse license config response (includes accountConfig)
   bool ParseLicenseConfigResponse(string jsonResponse)
   {
      LicenseCache cache;
      ZeroMemory(cache);
      ArrayResize(cache.allowedAccounts, 0);
      ArrayResize(m_accountConfigs, 0);
      
      // Check if success first
      bool success = (StringFind(jsonResponse, "\"success\":true") >= 0 || StringFind(jsonResponse, "\"success\": true") >= 0);
      
      // Extract data object (may exist even if success=false)
      int dataPos = StringFind(jsonResponse, "\"data\":");
      
      // CRITICAL FIX: Even if success=false, we still need to parse accountConfig
      // The backend may return accountConfig even when valid=false (e.g., account not assigned)
      // So we continue parsing instead of returning early
      if(!success)
      {
         Print("LicenseValidator: [DEBUG] ParseLicenseConfigResponse: success=false in response, but continuing to parse accountConfig");
      }
      
      if(dataPos < 0)
      {
         Print("LicenseValidator: [DEBUG] ParseLicenseConfigResponse: No data object found");
         // Even if no data object, try to extract error info
         if(!success)
         {
            int messagePos = StringFind(jsonResponse, "\"message\":");
            if(messagePos < 0)
               messagePos = StringFind(jsonResponse, "\"error\":");
            
            if(messagePos >= 0)
            {
               int start = StringFind(jsonResponse, "\"", messagePos + 10) + 1;
               if(start <= 0) start = StringFind(jsonResponse, "\"", messagePos + 8) + 1;
               int end = StringFind(jsonResponse, "\"", start);
               if(end > start)
               {
                  cache.errorMessage = StringSubstr(jsonResponse, start, end - start);
                  cache.errorType = "OTHER";
                  m_cache = cache;
                  m_cacheLoaded = true;
               }
            }
         }
         return false;
      }
      
      // Extract valid field (even if false, we need to parse expiry)
      int validPos = StringFind(jsonResponse, "\"valid\":", dataPos);
      if(validPos >= 0)
      {
         int truePos = StringFind(jsonResponse, "true", validPos);
         int falsePos = StringFind(jsonResponse, "false", validPos);
         if(truePos >= 0 && (falsePos < 0 || truePos < falsePos))
            cache.valid = true;
         else if(falsePos >= 0 && (truePos < 0 || falsePos < truePos))
            cache.valid = false; // Explicitly set to false
      }
      
      Print("LicenseValidator: [DEBUG] ParseLicenseConfigResponse: valid=", cache.valid ? "true" : "false");
      
      // IMPORTANT: Continue parsing even if valid=false, so we can get expiry date
      // Extract expiryDate (CRITICAL - we need this even if valid=false)
      int expiryPos = StringFind(jsonResponse, "\"expiryDate\":", dataPos);
      if(expiryPos >= 0)
      {
         int start = StringFind(jsonResponse, "\"", expiryPos + 13) + 1;
         int end = StringFind(jsonResponse, "\"", start);
         if(end > start)
         {
            cache.expiryDate = StringSubstr(jsonResponse, start, end - start);
            Print("LicenseValidator: [DEBUG] ParseLicenseConfigResponse: expiryDate=", cache.expiryDate);
         }
      }
      
      // Extract lastUpdated
      int lastUpdatedPos = StringFind(jsonResponse, "\"lastUpdated\":", dataPos);
      if(lastUpdatedPos >= 0)
      {
         int start = StringFind(jsonResponse, "\"", lastUpdatedPos + 14) + 1;
         int end = StringFind(jsonResponse, "\"", start);
         if(end > start)
            cache.lastUpdated = StringSubstr(jsonResponse, start, end - start);
      }
      
      // Extract error message (if present in data object) - important for error type detection
      int messagePos = StringFind(jsonResponse, "\"message\":", dataPos);
      if(messagePos >= 0)
      {
         int start = StringFind(jsonResponse, "\"", messagePos + 10) + 1;
         int end = StringFind(jsonResponse, "\"", start);
         if(end > start)
         {
            cache.errorMessage = StringSubstr(jsonResponse, start, end - start);
            
            Print("LicenseValidator: [DEBUG] Extracted error message: '", cache.errorMessage, "'");
            
            // Determine error type based on message (case-insensitive check)
            // Convert message to lowercase for comparison
            string msgLower = "";
            for(int i = 0; i < StringLen(cache.errorMessage); i++)
            {
               int ch = StringGetCharacter(cache.errorMessage, i);
               if(ch >= 65 && ch <= 90) ch += 32; // Convert uppercase to lowercase
               msgLower += CharToString((uchar)ch);
            }
            
            Print("LicenseValidator: [DEBUG] Error message (lowercase): '", msgLower, "'");
            
            if(StringFind(msgLower, "user not found") >= 0 || StringFind(msgLower, "invalid userid") >= 0)
            {
               cache.errorType = "INVALID_USER";
               Print("LicenseValidator: [DEBUG] Detected INVALID_USER error");
            }
            else if(StringFind(msgLower, "expired") >= 0)
            {
               cache.errorType = "EXPIRED";
               Print("LicenseValidator: [DEBUG] Detected EXPIRED error");
            }
            else if(StringFind(msgLower, "inactive") >= 0)
            {
               cache.errorType = "INACTIVE";
               Print("LicenseValidator: [DEBUG] Detected INACTIVE error");
            }
            else
            {
               cache.errorType = "OTHER";
               Print("LicenseValidator: [DEBUG] Detected OTHER error (unknown message)");
            }
            
            Print("LicenseValidator: [DEBUG] Final error type: '", cache.errorType, "'");
         }
      }
      
      // Extract allowedAccounts (even if valid=false, for debugging)
      int accountsPos = StringFind(jsonResponse, "\"allowedAccounts\":[", dataPos);
      if(accountsPos >= 0)
      {
         int arrayStart = StringFind(jsonResponse, "[", accountsPos) + 1;
         int arrayEnd = StringFind(jsonResponse, "]", arrayStart);
         if(arrayEnd > arrayStart)
         {
            string arrayContent = StringSubstr(jsonResponse, arrayStart, arrayEnd - arrayStart);
            string accounts[];
            StringSplit(arrayContent, ',', accounts);
            ArrayResize(cache.allowedAccounts, 0);
            for(int i = 0; i < ArraySize(accounts); i++)
            {
               string acc = accounts[i];
               acc = TrimString(acc);
               if(StringGetCharacter(acc, 0) == '"')
                  acc = StringSubstr(acc, 1);
               if(StringGetCharacter(acc, StringLen(acc) - 1) == '"')
                  acc = StringSubstr(acc, 0, StringLen(acc) - 1);
               if(StringLen(acc) > 0)
               {
                  int idx = ArraySize(cache.allowedAccounts);
                  ArrayResize(cache.allowedAccounts, idx + 1);
                  cache.allowedAccounts[idx] = acc;
               }
            }
         }
      }
      
      // Extract tier
      int tierPos = StringFind(jsonResponse, "\"tier\":", dataPos);
      if(tierPos >= 0)
      {
         int start = StringFind(jsonResponse, "\"", tierPos + 7) + 1;
         int end = StringFind(jsonResponse, "\"", start);
         if(end > start)
            cache.tier = StringSubstr(jsonResponse, start, end - start);
      }
      
      // Extract accountConfig object
      // FIX: Find "accountConfig" first, then find the opening brace after it
      // This handles whitespace variations like "accountConfig" : { or "accountConfig": {
      int configPos = StringFind(jsonResponse, "\"accountConfig\"");
      Print("LicenseValidator: [DEBUG] Looking for accountConfig, initial position: ", configPos);
      if(configPos >= 0)
      {
         // Find the opening brace after "accountConfig"
         configPos = StringFind(jsonResponse, "{", configPos);
         Print("LicenseValidator: [DEBUG] Found opening brace at position: ", configPos);
         if(configPos < 0)
         {
            Print("LicenseValidator: [ERROR] Found 'accountConfig' but no opening brace after it!");
         }
      }
      else
      {
         Print("LicenseValidator: [ERROR] 'accountConfig' not found in response!");
         // Try to find a portion of the response for debugging
         int dataPos = StringFind(jsonResponse, "\"data\":");
         if(dataPos >= 0)
         {
            int dataEnd = StringFind(jsonResponse, "}", dataPos + 100);
            if(dataEnd > dataPos)
            {
               string dataSnippet = StringSubstr(jsonResponse, dataPos, MathMin(200, dataEnd - dataPos));
               Print("LicenseValidator: [DEBUG] Data section snippet: ", dataSnippet);
            }
         }
      }
      
      if(configPos >= 0)
      {
         // configPos now points to the opening brace, so objStart is right after it
         int objStart = configPos + 1;
         // Find the matching closing brace for the accountConfig object
         // Need to count braces to find the correct closing one
         int braceCount = 1;
         int objEnd = objStart;
         while(objEnd < StringLen(jsonResponse) && braceCount > 0)
         {
            int nextOpen = StringFind(jsonResponse, "{", objEnd);
            int nextClose = StringFind(jsonResponse, "}", objEnd);
            if(nextClose < 0) break;
            if(nextOpen >= 0 && nextOpen < nextClose)
            {
               braceCount++;
               objEnd = nextOpen + 1;
            }
            else
            {
               braceCount--;
               if(braceCount == 0)
               {
                  objEnd = nextClose;
                  break;
               }
               objEnd = nextClose + 1;
            }
         }
         
         if(objEnd > objStart)
         {
            string configContent = StringSubstr(jsonResponse, objStart, objEnd - objStart);
            PrintFormat("LicenseValidator: [DEBUG] accountConfig content length: %d", StringLen(configContent));
            
            // Check if accountConfig is empty
            if(StringLen(configContent) == 0 || StringTrimLeft(configContent) == "")
            {
               Print("LicenseValidator: [WARNING] accountConfig is empty object {}");
               Print("LicenseValidator: [WARNING] Backend did not return any account configurations!");
               Print("LicenseValidator: [WARNING] This may indicate:");
               Print("LicenseValidator: [WARNING]   1. Account not found in database");
               Print("LicenseValidator: [WARNING]   2. Account not assigned to user");
               Print("LicenseValidator: [WARNING]   3. Backend error in building accountConfig");
            }
            else
            {
               // Print first 200 chars of configContent for debugging
               string configPreview = StringSubstr(configContent, 0, MathMin(200, StringLen(configContent)));
               PrintFormat("LicenseValidator: [DEBUG] accountConfig content preview: %s", configPreview);
            }
            
            // Parse each account config entry
            // Format: "5930870":{"role":"master","accountName":"Natesan"},"40699457":{...}
            int entryStart = 0;
            int parsedCount = 0;
            
            while(entryStart < StringLen(configContent))
            {
               // Find loginId (quoted string key)
               int loginStart = StringFind(configContent, "\"", entryStart);
               if(loginStart < 0) break;
               loginStart++;
               int loginEnd = StringFind(configContent, "\"", loginStart);
               if(loginEnd < 0) break;
               
               string loginId = StringSubstr(configContent, loginStart, loginEnd - loginStart);
               
               // Find the opening brace for this account's object
               int accountObjStart = StringFind(configContent, "{", loginEnd);
               if(accountObjStart < 0) break;
               
               // Find the matching closing brace for this account's object
               int accountBraceCount = 1;
               int accountObjEnd = accountObjStart + 1;
               while(accountObjEnd < StringLen(configContent) && accountBraceCount > 0)
               {
                  int nextOpen = StringFind(configContent, "{", accountObjEnd);
                  int nextClose = StringFind(configContent, "}", accountObjEnd);
                  if(nextClose < 0) break;
                  if(nextOpen >= 0 && nextOpen < nextClose)
                  {
                     accountBraceCount++;
                     accountObjEnd = nextOpen + 1;
                  }
                  else
                  {
                     accountBraceCount--;
                     if(accountBraceCount == 0)
                     {
                        accountObjEnd = nextClose;
                        break;
                     }
                     accountObjEnd = nextClose + 1;
                  }
               }
               
               if(accountObjEnd <= accountObjStart) break;
               
               // Extract this account's object content
               string accountObjContent = StringSubstr(configContent, accountObjStart + 1, accountObjEnd - accountObjStart - 1);
               
               // Parse fields within this account object
               string role = "";
               string masterLogin = "";
               string accountName = "";
               
               // Find role
               int rolePos = StringFind(accountObjContent, "\"role\":\"");
               if(rolePos >= 0)
               {
                  int roleStart = rolePos + 8;
                  int roleEnd = StringFind(accountObjContent, "\"", roleStart);
                  if(roleEnd > roleStart)
                     role = StringSubstr(accountObjContent, roleStart, roleEnd - roleStart);
               }
               
               // Find masterLogin (if slave)
               int masterPos = StringFind(accountObjContent, "\"masterLogin\":\"");
               if(masterPos >= 0)
               {
                  int masterStart = masterPos + 15;
                  int masterEnd = StringFind(accountObjContent, "\"", masterStart);
                  if(masterEnd > masterStart)
                     masterLogin = StringSubstr(accountObjContent, masterStart, masterEnd - masterStart);
               }
               
               // Find accountName
               int namePos = StringFind(accountObjContent, "\"accountName\":\"");
               if(namePos >= 0)
               {
                  int nameStart = namePos + 16;
                  int nameEnd = StringFind(accountObjContent, "\"", nameStart);
                  if(nameEnd > nameStart)
                     accountName = StringSubstr(accountObjContent, nameStart, nameEnd - nameStart);
               }
               
               // Add to account configs array
               int idx = ArraySize(m_accountConfigs);
               ArrayResize(m_accountConfigs, idx + 1);
               m_accountConfigs[idx].loginId = loginId;
               m_accountConfigs[idx].role = role;
               m_accountConfigs[idx].masterLogin = masterLogin;
               m_accountConfigs[idx].accountName = accountName;
               
               parsedCount++;
               PrintFormat("LicenseValidator: [DEBUG] Parsed account config #%d: loginId='%s', role='%s', masterLogin='%s', accountName='%s'",
                          parsedCount, loginId, role, masterLogin, accountName);
               
               // Move to next entry (after the closing brace and comma if present)
               entryStart = accountObjEnd + 1;
               // Skip comma if present
               if(entryStart < StringLen(configContent) && StringGetCharacter(configContent, entryStart) == ',')
                  entryStart++;
            }
            
            PrintFormat("LicenseValidator: [DEBUG] Total accounts parsed: %d", parsedCount);
         }
      }
      
      // Update cache
      m_cache = cache;
      m_cacheLoaded = true;
      
      // CRITICAL FIX: Return success status, but accountConfig is parsed regardless
      // This allows accountConfig to be available even when success=false
      return success;
   }
   
   // Save cache to file
   void SaveCache()
   {
      int f = FileOpen(GetCacheFileName(), FILE_WRITE | FILE_BIN | FILE_COMMON);
      if(f == INVALID_HANDLE) return;
      
      FileWriteInteger(f, m_cache.valid ? 1 : 0);
      FileWriteString(f, m_cache.expiryDate);
      FileWriteString(f, m_cache.lastUpdated);  // Save lastUpdated timestamp
      FileWriteInteger(f, ArraySize(m_cache.allowedAccounts));
      for(int i = 0; i < ArraySize(m_cache.allowedAccounts); i++)
         FileWriteString(f, m_cache.allowedAccounts[i]);
      FileWriteString(f, m_cache.tier);
      FileWriteLong(f, (long)m_cache.lastCheckTime);
      FileWriteString(f, m_cache.errorMessage);
      FileWriteString(f, m_cache.errorType);  // Save error type
      
      FileClose(f);
   }
   
   // Load cache from file
   void LoadCache()
   {
      m_cacheLoaded = false;
      ZeroMemory(m_cache);
      
      int f = FileOpen(GetCacheFileName(), FILE_READ | FILE_BIN | FILE_COMMON);
      if(f == INVALID_HANDLE) return;
      
      m_cache.valid = (FileReadInteger(f) == 1);
      m_cache.expiryDate = FileReadString(f);
      m_cache.lastUpdated = FileReadString(f);  // Load lastUpdated timestamp
      int count = FileReadInteger(f);
      ArrayResize(m_cache.allowedAccounts, count);
      for(int i = 0; i < count; i++)
         m_cache.allowedAccounts[i] = FileReadString(f);
      m_cache.tier = FileReadString(f);
      m_cache.lastCheckTime = (datetime)FileReadLong(f);
      m_cache.errorMessage = FileReadString(f);
      
      // Try to read errorType (for backward compatibility, check if file has more data)
      if(!FileIsEnding(f))
         m_cache.errorType = FileReadString(f);
      else
         m_cache.errorType = "";  // Old cache file, no errorType
      
      FileClose(f);
      m_cacheLoaded = true;
   }
   
public:
   // New constructor: gets current MT5 login automatically
   CLicenseValidator(string licenseApiUrl, string userId)
   {
      m_licenseApiUrl = licenseApiUrl;
      m_userId = userId;
      long loginId = AccountInfoInteger(ACCOUNT_LOGIN);
      m_currentMt5Login = IntegerToString((int)loginId);  // Get current MT5 login
      ArrayResize(m_mt5Accounts, 0);  // Initialize empty array
      m_httpClient = new CLicenseHttpClient(m_licenseApiUrl, 5000);
      m_cacheLoaded = false;
      ZeroMemory(m_cache);
      ArrayResize(m_accountConfigs, 0);
      
      // Load cache on initialization
      LoadCache();
   }
   
   // Legacy constructor (for backward compatibility)
   CLicenseValidator(string licenseApiUrl, string userId, string &mt5Accounts[])
   {
      m_licenseApiUrl = licenseApiUrl;
      m_userId = userId;
      long loginId = AccountInfoInteger(ACCOUNT_LOGIN);
      m_currentMt5Login = IntegerToString((int)loginId);
      ArrayCopy(m_mt5Accounts, mt5Accounts);
      m_httpClient = new CLicenseHttpClient(m_licenseApiUrl, 5000);
      m_cacheLoaded = false;
      ZeroMemory(m_cache);
      ArrayResize(m_accountConfigs, 0);
      
      // Load cache on initialization
      LoadCache();
   }
   
   ~CLicenseValidator()
   {
      if(m_httpClient != NULL)
         delete m_httpClient;
   }
   
   // Get license configuration from backend (new method using config API)
   bool GetLicenseConfig(bool useCache = true)
   {
      // CRITICAL FIX: Always call backend API to get accountConfig
      // accountConfig is NOT cached (only license validity/expiry is cached)
      // Even if cache.valid=true, we need to fetch accountConfig from API
      // This ensures m_accountConfigs and g_masterLogin are always populated
      
      // Call config API
      string url = "/api/license/config?userId=" + m_userId + "&mt5Login=" + m_currentMt5Login;
      string response = "";
      
      // DEBUG: Log API call (no alert for production - too noisy)
      Print("==========================================");
      Print("LicenseValidator: [DEBUG] Making API call to backend");
      Print("LicenseValidator: [DEBUG] URL: ", url);
      Print("LicenseValidator: [DEBUG] UserId: ", m_userId);
      Print("LicenseValidator: [DEBUG] MT5Login: ", m_currentMt5Login);
      
      int status = m_httpClient.Get(url, response);
      
      Print("LicenseValidator: [DEBUG] API Response Status: ", status);
      Print("LicenseValidator: [DEBUG] API Response Length: ", StringLen(response));
      
      // Always print response (truncated if too long)
      if(StringLen(response) > 0)
      {
         if(StringLen(response) <= 1000)
            Print("LicenseValidator: [DEBUG] Full API Response: ", response);
         else
         {
            Print("LicenseValidator: [DEBUG] API Response (first 1000 chars): ", StringSubstr(response, 0, 1000));
            // Also try to find and print accountConfig section
            int accountConfigPos = StringFind(response, "\"accountConfig\"");
            if(accountConfigPos >= 0)
            {
               int accountConfigEnd = StringFind(response, "}", accountConfigPos + 200);
               if(accountConfigEnd > accountConfigPos)
               {
                  string accountConfigSnippet = StringSubstr(response, accountConfigPos, MathMin(500, accountConfigEnd - accountConfigPos + 1));
                  Print("LicenseValidator: [DEBUG] accountConfig section: ", accountConfigSnippet);
               }
            }
         }
      }
      Print("==========================================");
      
      if(status == 200)
      {
         // CRITICAL FIX: Parse response even if success=false
         // This ensures accountConfig is parsed even when valid=false
         bool parseResult = ParseLicenseConfigResponse(response);
         
         m_cache.lastCheckTime = TimeCurrent();
         SaveCache();
         
         // DEBUG: Log expiry status (regardless of parseResult)
         Print("LicenseValidator: [DEBUG] License config retrieved (parseResult=", parseResult ? "true" : "false", ")");
         Print("LicenseValidator: [DEBUG] Valid: ", m_cache.valid ? "true" : "false");
         Print("LicenseValidator: [DEBUG] ExpiryDate: ", m_cache.expiryDate);
         Print("LicenseValidator: [DEBUG] LastUpdated: ", m_cache.lastUpdated);
         Print("LicenseValidator: [DEBUG] ErrorMessage: ", m_cache.errorMessage);
         Print("LicenseValidator: [DEBUG] ErrorType: ", m_cache.errorType);
         Print("LicenseValidator: [DEBUG] IsExpired: ", IsExpired() ? "true" : "false");
         PrintFormat("LicenseValidator: [DEBUG] Account Configs parsed: %d", ArraySize(m_accountConfigs));
         for(int i = 0; i < ArraySize(m_accountConfigs); i++)
         {
            PrintFormat("LicenseValidator: [DEBUG] AccountConfig[%d]: loginId='%s', role='%s', masterLogin='%s', accountName='%s'",
                       i, m_accountConfigs[i].loginId, m_accountConfigs[i].role, m_accountConfigs[i].masterLogin, m_accountConfigs[i].accountName);
         }
         
         // Note: Alert for backend response removed - too noisy for production
         // Alerts are shown only for: initial status, expiry updates, and expiry detection
         
         // Return parseResult (true if success=true, false if success=false)
         // But accountConfig is now available regardless
         return parseResult;
      }
      else
      {
         Print("LicenseValidator: [DEBUG] Config API call failed. Status: ", status, ", Response: ", response);
         m_cache.errorMessage = "API call failed with status " + IntegerToString(status);
         
         // Use cache if available (offline mode)
         if(useCache && m_cacheLoaded && m_cache.valid)
         {
            Print("LicenseValidator: [DEBUG] Using cached license (offline mode)");
            return true;
         }
      }
      
      return false;
   }
   
   // Validate license via API (legacy method - kept for backward compatibility)
   bool ValidateLicense(bool useCache = true)
   {
      // Check cache first if enabled
      if(useCache && m_cacheLoaded && m_cache.valid)
      {
         // Check if cache is still valid (not expired)
         if(StringLen(m_cache.expiryDate) > 0)
         {
            datetime expiry = StringToTime(m_cache.expiryDate);
            if(expiry > 0 && TimeCurrent() < expiry)
            {
               // Cache is valid, check if accounts match
               bool accountsMatch = true;
               for(int i = 0; i < ArraySize(m_mt5Accounts); i++)
               {
                  bool found = false;
                  for(int j = 0; j < ArraySize(m_cache.allowedAccounts); j++)
                  {
                     if(m_mt5Accounts[i] == m_cache.allowedAccounts[j])
                     {
                        found = true;
                        break;
                     }
                  }
                  if(!found)
                  {
                     accountsMatch = false;
                     break;
                  }
               }
               if(accountsMatch)
               {
                  Print("LicenseValidator: Using cached license (valid)");
                  return true;
               }
            }
         }
      }
      
      // Call API
      // For new constructor, use current account; for legacy, use provided accounts
      string requestBody = "{";
      requestBody += "\"userId\":\"" + m_userId + "\",";
      requestBody += "\"mt5Accounts\":[";
      if(ArraySize(m_mt5Accounts) > 0)
      {
         // Legacy constructor - use provided accounts
         for(int i = 0; i < ArraySize(m_mt5Accounts); i++)
         {
            if(i > 0) requestBody += ",";
            requestBody += "\"" + m_mt5Accounts[i] + "\"";
         }
      }
      else
      {
         // New constructor - use current account only
         requestBody += "\"" + m_currentMt5Login + "\"";
      }
      requestBody += "]";
      requestBody += "}";
      
      string response = "";
      string url = "/api/license/validate";
      int status = m_httpClient.Post(url, requestBody, response);
      
      if(status != 200)
      {
         Print("LicenseValidator: API call failed. Status: ", status);
         // Use cached license if available (offline mode)
         if(m_cacheLoaded && m_cache.valid)
         {
            Print("LicenseValidator: Using cached license (offline mode)");
            return true;
         }
         return false;
      }
      
      // Parse response
      LicenseCache newCache;
      ZeroMemory(newCache);
      if(!ParseLicenseResponse(response, newCache))
      {
         Print("LicenseValidator: Failed to parse license response");
         // Use cached license if available (offline mode)
         if(m_cacheLoaded && m_cache.valid)
         {
            Print("LicenseValidator: Using cached license (offline mode)");
            return true;
         }
         return false;
      }
      
      // Update cache
      m_cache = newCache;
      SaveCache();
      m_cacheLoaded = true;
      
      return m_cache.valid;
   }
   
   // Get last updated timestamp (for polling)
   string GetLastUpdated()
   {
      return m_cache.lastUpdated;
   }
   
   // Check if subscription was updated (for polling)
   bool WasUpdated(string newLastUpdated)
   {
      if(StringLen(m_cache.lastUpdated) == 0) return true; // First time
      if(StringLen(newLastUpdated) == 0) return false;
      return (StringCompare(m_cache.lastUpdated, newLastUpdated) != 0);
   }
   
      // Get account configuration for current account
   AccountConfig GetCurrentAccountConfig()
   {
      AccountConfig config;
      ZeroMemory(config);
      config.loginId = m_currentMt5Login;
      config.role = "";
      config.masterLogin = "";
      config.accountName = "";
      
      // DEBUG: Log all account configs
      Print("LicenseValidator: [DEBUG] GetCurrentAccountConfig called");
      PrintFormat("LicenseValidator: [DEBUG] Current MT5 Login: '%s'", m_currentMt5Login);
      PrintFormat("LicenseValidator: [DEBUG] Total account configs: %d", ArraySize(m_accountConfigs));
      
      // Find config for current MT5 login
      for(int i = 0; i < ArraySize(m_accountConfigs); i++)
      {
         PrintFormat("LicenseValidator: [DEBUG] Config[%d]: loginId='%s', role='%s', masterLogin='%s', accountName='%s'", 
                     i, m_accountConfigs[i].loginId, m_accountConfigs[i].role, m_accountConfigs[i].masterLogin, m_accountConfigs[i].accountName);
         
         // Compare loginId strings (case-sensitive exact match)
         if(StringCompare(m_accountConfigs[i].loginId, m_currentMt5Login) == 0)
         {
            config = m_accountConfigs[i];
            Print("==========================================");
            PrintFormat("LicenseValidator: [SUCCESS] Account config FOUND for login '%s'", m_currentMt5Login);
            PrintFormat("LicenseValidator: [SUCCESS] Role: '%s'", config.role);
            PrintFormat("LicenseValidator: [SUCCESS] Master Login: '%s'", config.masterLogin);
            PrintFormat("LicenseValidator: [SUCCESS] Account Name: '%s'", config.accountName);
            Print("==========================================");
            return config;
         }
      }
      
      // Config not found - this is a critical error
      Print("==========================================");
      Print("LicenseValidator: [ERROR] Account config NOT FOUND for current login!");
      PrintFormat("LicenseValidator: [ERROR] Current MT5 Login: '%s'", m_currentMt5Login);
      PrintFormat("LicenseValidator: [ERROR] Total configs available: %d", ArraySize(m_accountConfigs));
      Print("LicenseValidator: [ERROR] Backend did not return config for this account!");
      Print("LicenseValidator: [ERROR] Check backend: accountType must be set and CopyLink must exist for slaves");
      Print("==========================================");
      
      return config;
   }
   
   // Check if license is expired
   bool IsExpired()
   {
      // Don't treat invalid users as expired
      if(StringLen(m_cache.errorType) > 0 && m_cache.errorType == "INVALID_USER")
         return false; // Invalid user is not an expiry issue
      
      // CRITICAL: Check expiry date FIRST - if expiry date exists and is in future, license is NOT expired
      // The valid flag might be false for other reasons (account not assigned, etc.)
      // But expiry date is the definitive check for expiration
      if(StringLen(m_cache.expiryDate) > 0)
      {
         // Parse ISO date string: "2024-12-31T00:00:00.000Z"
         string dateStr = StringSubstr(m_cache.expiryDate, 0, 19); // "2024-12-31T00:00:00"
         string parts[];
         StringSplit(dateStr, 'T', parts);
         if(ArraySize(parts) == 2)
         {
            string datePart = parts[0]; // "2024-12-31"
            string timePart = parts[1]; // "00:00:00"
            string dateParts[];
            string timeParts[];
            StringSplit(datePart, '-', dateParts);
            StringSplit(timePart, ':', timeParts);
            
            if(ArraySize(dateParts) == 3 && ArraySize(timeParts) == 3)
            {
               int year = (int)StringToInteger(dateParts[0]);
               int month = (int)StringToInteger(dateParts[1]);
               int day = (int)StringToInteger(dateParts[2]);
               int hour = (int)StringToInteger(timeParts[0]);
               int minute = (int)StringToInteger(timeParts[1]);
               int second = (int)StringToInteger(timeParts[2]);
               
               string mqlDateStr = StringFormat("%04d.%02d.%02d %02d:%02d:%02d", year, month, day, hour, minute, second);
               datetime expiry = StringToTime(mqlDateStr);
               
               if(expiry > 0)
               {
                  // Expiry date is valid - check if current time is past expiry
                  bool isExpired = TimeCurrent() >= expiry;
                  // If expiry date is in future, return false (NOT expired) regardless of valid flag
                  if(!isExpired) return false;
                  // Expiry date is in past - license is expired
                  return true;
               }
            }
         }
      }
      
      // No expiry date or failed to parse - use valid flag as fallback
      if(!m_cacheLoaded || !m_cache.valid) return true;
      return false; // No expiry = not expired
   }
   
   // Get license info
   LicenseCache GetLicenseInfo()
   {
      return m_cache;
   }
   
   // Check if account is allowed
   bool IsAccountAllowed(string accountNumber)
   {
      if(!m_cacheLoaded || !m_cache.valid) return false;
      
      for(int i = 0; i < ArraySize(m_cache.allowedAccounts); i++)
      {
         if(m_cache.allowedAccounts[i] == accountNumber)
            return true;
      }
      
      return false;
   }
};

