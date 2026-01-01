//+------------------------------------------------------------------+
//| LicenseHttpClient.mqh - Simple HTTP client for license validation |
//+------------------------------------------------------------------+
//| Purpose: Lightweight HTTP client for license validation API calls |
//+------------------------------------------------------------------+

class CLicenseHttpClient
{
private:
   string   m_baseUrl;
   int      m_timeoutMs;
   
public:
   CLicenseHttpClient(string baseUrl, int timeoutMs = 5000)
   {
      m_baseUrl = baseUrl;
      m_timeoutMs = timeoutMs;
   }
   
   //--- GET request: returns HTTP status code (0 if failed)
   int Get(string url, string &response)
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
      
      string headers = "";
      
      uchar data[];
      uchar result[];
      string resultHeaders;
      
      ResetLastError();
      int status = WebRequest("GET",
                              fullUrl,
                              headers,
                              m_timeoutMs,
                              data,
                              result,
                              resultHeaders);
      
      if(status == -1)
      {
         int lastError = GetLastError();
         Print("LicenseHttpClient: GET failed. URL: ", fullUrl, ", Error: ", lastError);
         if(lastError == 4060)
            Print("LicenseHttpClient: URL not allowed - add ", fullUrl, " to MT5 WebRequest allowed URLs");
         response = "";
         return 0;
      }
      
      response = CharArrayToString(result, 0, -1, CP_UTF8);
      return status;
   }
   
   //--- POST request: returns HTTP status code (0 if failed)
   int Post(string url, string body, string &response)
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
      
      string headers = "Content-Type: application/json\r\n";
      
      uchar data[];
      int len = StringLen(body);
      StringToCharArray(body, data, 0, len, CP_UTF8);
      ArrayResize(data, len);
      
      uchar result[];
      string resultHeaders;
      
      ResetLastError();
      int status = WebRequest("POST",
                              fullUrl,
                              headers,
                              m_timeoutMs,
                              data,
                              result,
                              resultHeaders);
      
      if(status == -1)
      {
         int lastError = GetLastError();
         Print("LicenseHttpClient: POST failed. URL: ", fullUrl, ", Error: ", lastError);
         if(lastError == 4060)
            Print("LicenseHttpClient: URL not allowed - add ", fullUrl, " to MT5 WebRequest allowed URLs");
         response = "";
         return 0;
      }
      
      response = CharArrayToString(result, 0, -1, CP_UTF8);
      return status;
   }
};

