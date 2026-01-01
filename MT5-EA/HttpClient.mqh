//+------------------------------------------------------------------+
//| HttpClient.mqh - minimal HTTP client wrapper                     |
//+------------------------------------------------------------------+

#include "Logger.mqh"

class CHttpClient
{
private:
   string   m_baseUrl;
   string   m_eaToken;
   int      m_maxRetries;
   int      m_retryDelayMs;
   CLogger *m_logger;
   
public:
   CHttpClient(string baseUrl,
               string eaToken,
               int    maxRetries,
               int    retryDelayMs,
               CLogger *httpLogger)
   {
      m_baseUrl      = baseUrl;
      m_eaToken      = eaToken;
      m_maxRetries   = maxRetries;
      m_retryDelayMs = retryDelayMs;
      m_logger       = httpLogger;
   }
   
   //--- POST request: returns HTTP status code (0 if failed)
   int Post(string url,
            string extraHeaders,
            string body,
            string &response)
   {
      string fullUrl = url;
      int httpPos = StringFind(fullUrl, "http://");
      int httpsPos = StringFind(fullUrl, "https://");
      if(httpPos < 0 && httpsPos < 0)
      {
         if(StringLen(m_baseUrl) > 0)
            fullUrl = m_baseUrl + url;
         else
            fullUrl = url;
      }
      
      string headers = extraHeaders;
      // Ensure EA token header if not already in extraHeaders
      // Check for token header (case-insensitive)
      int tokenPos = StringFind(headers, "x-ea-token");
      if(tokenPos < 0)
         tokenPos = StringFind(headers, "X-EA-Token");
      if(tokenPos < 0)
         tokenPos = StringFind(headers, "X-Ea-Token");
      if(tokenPos < 0 && StringLen(m_eaToken) > 0)
         headers = "X-EA-Token: " + m_eaToken + "\r\n" + headers;
      
      uchar data[];
      int len = StringLen(body);                   // exact number of chars
      StringToCharArray(body, data, 0, len, CP_UTF8);
      ArrayResize(data, len);                      // ensure array size == length
      
      uchar result[];
      string resultHeaders;
      int    attempt = 0;
      int    status  = 0;
      
      // #region agent log
      datetime httpPostStart = TimeCurrent();
      if(m_logger != NULL)
      {
         string data_log = "{\"url\":\"" + fullUrl + "\"";
         data_log += ",\"attempt\":0";
         data_log += "}";
         m_logger.DebugTiming("HttpClient.mqh:Post", "WebRequest POST start", httpPostStart, "H4", data_log);
      }
      // #endregion
      
      while(attempt < m_maxRetries)
      {
         ResetLastError();
         datetime webReqStart = TimeCurrent();
         status = WebRequest("POST",
                             fullUrl,
                             headers,
                             3000,           // Reduced from 5000ms to 3000ms
                             data,
                             result,
                             resultHeaders);
         datetime webReqEnd = TimeCurrent();
         
         // #region agent log
         if(m_logger != NULL)
         {
            string reqData = "{\"url\":\"" + fullUrl + "\"";
            reqData += ",\"attempt\":" + IntegerToString(attempt);
            reqData += ",\"webReqStart\":" + IntegerToString((int)webReqStart);
            reqData += ",\"webReqEnd\":" + IntegerToString((int)webReqEnd);
            reqData += ",\"webReqDuration\":" + IntegerToString((int)(webReqEnd - webReqStart));
            reqData += ",\"status\":" + IntegerToString(status);
            reqData += "}";
            m_logger.DebugTiming("HttpClient.mqh:Post", "WebRequest POST completed", webReqEnd, "H4", reqData);
         }
         // #endregion
         
         if(status != -1)
            break;
         
         int lastError = GetLastError();
         if(m_logger != NULL)
         {
            string errorMsg = "WebRequest POST failed. URL: " + fullUrl;
            errorMsg += ", Error Code: " + IntegerToString(lastError);
            
            // Common error codes
            if(lastError == 4060)
               errorMsg += " (URL not allowed - add to MT5 WebRequest list)";
            else if(lastError == 4014)
               errorMsg += " (Invalid URL format)";
            else if(lastError == 4013)
               errorMsg += " (Invalid request)";
            
            m_logger.Error(errorMsg);
         }
         
         attempt++;
         if(attempt < m_maxRetries)
         {
            // #region agent log
            datetime sleepStart = TimeCurrent();
            if(m_logger != NULL)
            {
               string sleepData = "{\"retryDelayMs\":" + IntegerToString(m_retryDelayMs);
               sleepData += ",\"attempt\":" + IntegerToString(attempt);
               sleepData += "}";
               m_logger.DebugTiming("HttpClient.mqh:Post", "Sleep before retry", sleepStart, "H4", sleepData);
            }
            // #endregion
            Sleep(m_retryDelayMs);
            // #region agent log
            datetime sleepEnd = TimeCurrent();
            if(m_logger != NULL)
            {
               string sleepEndData = "{\"sleepDuration\":" + IntegerToString((int)(sleepEnd - sleepStart));
               sleepEndData += "}";
               m_logger.DebugTiming("HttpClient.mqh:Post", "Sleep after retry", sleepEnd, "H4", sleepEndData);
            }
            // #endregion
         }
      }
      
      datetime httpPostEnd = TimeCurrent();
      
      // #region agent log
      if(m_logger != NULL)
      {
         string totalData = "{\"url\":\"" + fullUrl + "\"";
         totalData += ",\"totalStart\":" + IntegerToString((int)httpPostStart);
         totalData += ",\"totalEnd\":" + IntegerToString((int)httpPostEnd);
         totalData += ",\"totalDuration\":" + IntegerToString((int)(httpPostEnd - httpPostStart));
         totalData += ",\"finalStatus\":" + IntegerToString(status);
         totalData += "}";
         m_logger.DebugTiming("HttpClient.mqh:Post", "HTTP POST total duration", httpPostEnd, "H4", totalData);
      }
      // #endregion
      
      if(status == -1)
      {
         int lastError = GetLastError();
         if(m_logger != NULL)
         {
            string errorMsg = "WebRequest POST failed after retries. URL: " + fullUrl;
            errorMsg += ", Error Code: " + IntegerToString(lastError);
            if(lastError == 4060)
               errorMsg += " (URL not allowed - add " + fullUrl + " to MT5 WebRequest allowed URLs)";
            m_logger.Error(errorMsg);
         }
         response = "";
         return lastError; // Return error code instead of 0
      }
      
      response = CharArrayToString(result, 0, -1, CP_UTF8);
      
      if(m_logger != NULL)
         m_logger.Debug("HTTP POST " + fullUrl +
                         " -> status " + IntegerToString(status));
      
      return status;
   }
   
   //--- GET request: returns HTTP status code (0 if failed)
   int Get(string url,
           string extraHeaders,
           string &response)
   {
      string fullUrl = url;
      int httpPos = StringFind(fullUrl, "http://");
      int httpsPos = StringFind(fullUrl, "https://");
      if(httpPos < 0 && httpsPos < 0)
      {
         if(StringLen(m_baseUrl) > 0)
            fullUrl = m_baseUrl + url;
         else
            fullUrl = url;
      }
      
      string headers = extraHeaders;
      // Check for token header (case-insensitive)
      int tokenPos = StringFind(headers, "x-ea-token");
      if(tokenPos < 0)
         tokenPos = StringFind(headers, "X-EA-Token");
      if(tokenPos < 0)
         tokenPos = StringFind(headers, "X-Ea-Token");
      if(tokenPos < 0 && StringLen(m_eaToken) > 0)
         headers = "X-EA-Token: " + m_eaToken + "\r\n" + headers;
      
      uchar empty[];     // no body for GET
      uchar result[];
      string resultHeaders;
      int    attempt = 0;
      int    status  = 0;
      
      // #region agent log
      datetime httpGetStart = TimeCurrent();
      if(m_logger != NULL)
      {
         string data = "{\"url\":\"" + fullUrl + "\"";
         data += ",\"attempt\":0";
         data += "}";
         m_logger.DebugTiming("HttpClient.mqh:Get", "WebRequest GET start", httpGetStart, "H4", data);
      }
      // #endregion
      
      while(attempt < m_maxRetries)
      {
         ResetLastError();
         datetime webReqStart = TimeCurrent();
         status = WebRequest("GET",
                             fullUrl,
                             headers,
                             3000,  // Reduced from 5000ms to 3000ms for faster polling
                             empty,
                             result,
                             resultHeaders);
         datetime webReqEnd = TimeCurrent();
         
         // #region agent log
         if(m_logger != NULL)
         {
            string reqData = "{\"url\":\"" + fullUrl + "\"";
            reqData += ",\"attempt\":" + IntegerToString(attempt);
            reqData += ",\"webReqStart\":" + IntegerToString((int)webReqStart);
            reqData += ",\"webReqEnd\":" + IntegerToString((int)webReqEnd);
            reqData += ",\"webReqDuration\":" + IntegerToString((int)(webReqEnd - webReqStart));
            reqData += ",\"status\":" + IntegerToString(status);
            reqData += "}";
            m_logger.DebugTiming("HttpClient.mqh:Get", "WebRequest GET completed", webReqEnd, "H4", reqData);
         }
         // #endregion
         
         if(status != -1)
            break;
         
         int lastError = GetLastError();
         if(m_logger != NULL)
         {
            string errorMsg = "WebRequest GET failed. URL: " + fullUrl;
            errorMsg += ", Error Code: " + IntegerToString(lastError);
            if(lastError == 4060)
               errorMsg += " (URL not allowed - add to MT5 WebRequest list)";
            m_logger.Error(errorMsg);
         }
         
         attempt++;
         if(attempt < m_maxRetries)
            Sleep(m_retryDelayMs);
      }
      
      if(status == -1)
      {
         int lastError = GetLastError();
         if(m_logger != NULL)
         {
            string errorMsg = "WebRequest GET failed after retries. URL: " + fullUrl;
            errorMsg += ", Error Code: " + IntegerToString(lastError);
            if(lastError == 4060)
               errorMsg += " (URL not allowed - add " + fullUrl + " to MT5 WebRequest allowed URLs)";
            m_logger.Error(errorMsg);
         }
         response = "";
         return lastError; // Return error code instead of 0
      }
      
      response = CharArrayToString(result, 0, -1, CP_UTF8);
      
      if(m_logger != NULL)
         m_logger.Debug("HTTP GET " + fullUrl +
                         " -> status " + IntegerToString(status));
      
      return status;
   }
   
   //--- PATCH request: returns HTTP status code (0 if failed)
   int Patch(string url,
             string extraHeaders,
             string body,
             string &response)
   {
      string fullUrl = url;
      int httpPos = StringFind(fullUrl, "http://");
      int httpsPos = StringFind(fullUrl, "https://");
      if(httpPos < 0 && httpsPos < 0)
      {
         if(StringLen(m_baseUrl) > 0)
            fullUrl = m_baseUrl + url;
         else
            fullUrl = url;
      }
      
      string headers = extraHeaders;
      // Check for token header (case-insensitive)
      int tokenPos = StringFind(headers, "x-ea-token");
      if(tokenPos < 0)
         tokenPos = StringFind(headers, "X-EA-Token");
      if(tokenPos < 0)
         tokenPos = StringFind(headers, "X-Ea-Token");
      if(tokenPos < 0 && StringLen(m_eaToken) > 0)
         headers = "X-EA-Token: " + m_eaToken + "\r\n" + headers;
      
      uchar data[];
      int len = StringLen(body);                   // exact number of chars
      StringToCharArray(body, data, 0, len, CP_UTF8);
      ArrayResize(data, len);                      // ensure array size == length
      
      uchar result[];
      string resultHeaders;
      int    attempt = 0;
      int    status  = 0;
      
      // #region agent log
      datetime httpPatchStart = TimeCurrent();
      if(m_logger != NULL)
      {
         string data_log = "{\"url\":\"" + fullUrl + "\"";
         data_log += ",\"attempt\":0";
         data_log += "}";
         m_logger.DebugTiming("HttpClient.mqh:Patch", "WebRequest PATCH start", httpPatchStart, "H1,H4", data_log);
      }
      // #endregion
      
      while(attempt < m_maxRetries)
      {
         ResetLastError();
         datetime webReqStart = TimeCurrent();
         status = WebRequest("PATCH",
                             fullUrl,
                             headers,
                             3000,  // Reduced from 5000ms to 3000ms for faster failure
                             data,
                             result,
                             resultHeaders);
         datetime webReqEnd = TimeCurrent();
         
         // #region agent log
         if(m_logger != NULL)
         {
            string reqData = "{\"url\":\"" + fullUrl + "\"";
            reqData += ",\"attempt\":" + IntegerToString(attempt);
            reqData += ",\"webReqStart\":" + IntegerToString((int)webReqStart);
            reqData += ",\"webReqEnd\":" + IntegerToString((int)webReqEnd);
            reqData += ",\"webReqDuration\":" + IntegerToString((int)(webReqEnd - webReqStart));
            reqData += ",\"status\":" + IntegerToString(status);
            reqData += "}";
            m_logger.DebugTiming("HttpClient.mqh:Patch", "WebRequest PATCH completed", webReqEnd, "H1,H4", reqData);
         }
         // #endregion
         
         if(status != -1)
            break;
         
         if(m_logger != NULL)
            m_logger.Error("WebRequest PATCH failed, err=" +
                            IntegerToString(GetLastError()));
         
         attempt++;
         if(attempt < m_maxRetries)
         {
            // #region agent log
            datetime sleepStart = TimeCurrent();
            if(m_logger != NULL)
            {
               string sleepData = "{\"retryDelayMs\":" + IntegerToString(m_retryDelayMs);
               sleepData += ",\"attempt\":" + IntegerToString(attempt);
               sleepData += "}";
               m_logger.DebugTiming("HttpClient.mqh:Patch", "Sleep before retry", sleepStart, "H1,H4", sleepData);
            }
            // #endregion
            Sleep(m_retryDelayMs);
            // #region agent log
            datetime sleepEnd = TimeCurrent();
            if(m_logger != NULL)
            {
               string sleepEndData = "{\"sleepDuration\":" + IntegerToString((int)(sleepEnd - sleepStart));
               sleepEndData += "}";
               m_logger.DebugTiming("HttpClient.mqh:Patch", "Sleep after retry", sleepEnd, "H1,H4", sleepEndData);
            }
            // #endregion
         }
      }
      
      datetime httpPatchEnd = TimeCurrent();
      
      // #region agent log
      if(m_logger != NULL)
      {
         string totalData = "{\"url\":\"" + fullUrl + "\"";
         totalData += ",\"totalStart\":" + IntegerToString((int)httpPatchStart);
         totalData += ",\"totalEnd\":" + IntegerToString((int)httpPatchEnd);
         totalData += ",\"totalDuration\":" + IntegerToString((int)(httpPatchEnd - httpPatchStart));
         totalData += ",\"finalStatus\":" + IntegerToString(status);
         totalData += "}";
         m_logger.DebugTiming("HttpClient.mqh:Patch", "HTTP PATCH total duration", httpPatchEnd, "H1,H4", totalData);
      }
      // #endregion
      
      if(status == -1)
      {
         response = "";
         return 0;
      }
      
      response = CharArrayToString(result, 0, -1, CP_UTF8);
      
      if(m_logger != NULL)
         m_logger.Debug("HTTP PATCH " + fullUrl +
                         " -> status " + IntegerToString(status));
      
      return status;
   }
};
//+------------------------------------------------------------------+
