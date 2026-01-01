//+------------------------------------------------------------------+
//| Logger.mqh - simple logger                                       |
//+------------------------------------------------------------------+

class CLogger
{
private:
   bool   m_enabled;
   string m_level;   // "INFO", "DEBUG", "ERROR"
   string m_logPath; // Debug log file path
   
   bool IsDebug()
   {
      return(m_level == "DEBUG");
   }
   
   string ToUpper(string str)
   {
      string result = str;
      int len = StringLen(str);
      for(int i = 0; i < len; i++)
      {
         ushort ch = (ushort)StringGetCharacter(str, i);
         if(ch >= 'a' && ch <= 'z')
            StringSetCharacter(result, i, (ushort)(ch - 32));
      }
      return result;
   }
   
   // Write debug log entry as NDJSON
   void WriteDebugLog(string location, string message, string dataJson = "", string hypothesisId = "")
   {
      // #region agent log
      int fileHandle = FileOpen("d:\\.cursor\\debug.log", FILE_WRITE | FILE_TXT | FILE_COMMON);
      if(fileHandle != INVALID_HANDLE)
      {
         datetime currentTime = TimeCurrent();
         long timestamp = (long)currentTime;
         
         string json = "{";
         json += "\"location\":\"" + location + "\"";
         json += ",\"message\":\"" + message + "\"";
         json += ",\"timestamp\":" + IntegerToString((int)timestamp);
         json += ",\"sessionId\":\"debug-session\"";
         if(StringLen(hypothesisId) > 0)
            json += ",\"hypothesisId\":\"" + hypothesisId + "\"";
         if(StringLen(dataJson) > 0)
            json += "," + dataJson;
         json += "}";
         
         FileSeek(fileHandle, 0, SEEK_END);
         FileWriteString(fileHandle, json + "\n");
         FileClose(fileHandle);
      }
      // #endregion
   }
   
public:
   CLogger(bool enabled=false, string level="INFO")
   {
      m_enabled = enabled;
      m_level   = ToUpper(level);
      m_logPath = "d:\\.cursor\\debug.log";
   }
   
   void SetConfig(bool enabled, string level)
   {
      m_enabled = enabled;
      m_level   = ToUpper(level);
   }
   
   void Info(string msg)
   {
      if(!m_enabled) return;
      Print("[INFO]  ", msg);
   }
   
   void Debug(string msg)
   {
      if(!m_enabled) return;
      if(IsDebug())
         Print("[DEBUG] ", msg);
   }
   
   void Error(string msg)
   {
      if(!m_enabled) return;
      Print("[ERROR] ", msg);
   }
   
   // Debug timing log
   void DebugTiming(string location, string message, datetime timestamp, string hypothesisId = "", string extraData = "")
   {
      string data = "\"timestampDatetime\":" + IntegerToString((int)timestamp);
      if(StringLen(extraData) > 0)
         data += ",\"extra\":" + extraData;
      WriteDebugLog(location, message, data, hypothesisId);
   }
};
//+------------------------------------------------------------------+

