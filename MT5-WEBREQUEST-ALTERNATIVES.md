# MT5 WebRequest - Alternative Solutions

## Problem: Can't Add `http://localhost:5000` to MT5

Some MT5 versions don't accept `localhost` in the allowed URLs list. Here are alternatives:

---

## Solution 1: Use 127.0.0.1 Instead

Instead of `localhost`, use the IP address:

### Steps:

1. **Open MT5 Options:**
   - Tools → Options → Expert Advisors

2. **Add URL:**
   - Click "Add"
   - Enter: `http://127.0.0.1:5000`
   - Click "OK"

3. **Update EA Input:**
   - Change "Backend API base URL" to: `http://127.0.0.1:5000`

4. **Restart MT5 and re-attach EA**

---

## Solution 2: Use Your Local IP Address

### Step 1: Find Your Local IP

**Windows:**
```bash
# Open Command Prompt (cmd)
ipconfig

# Look for "IPv4 Address" under your network adapter
# Example: 192.168.1.100
```

**Or PowerShell:**
```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -notlike "*Loopback*"} | Select-Object IPAddress
```

### Step 2: Add IP to MT5

1. **Open MT5 Options:**
   - Tools → Options → Expert Advisors

2. **Add URL:**
   - Click "Add"
   - Enter: `http://YOUR_IP:5000` (e.g., `http://192.168.1.100:5000`)
   - Click "OK"

3. **Update EA Input:**
   - Change "Backend API base URL" to your IP address

4. **Restart MT5 and re-attach EA**

---

## Solution 3: Check URL Format

Make sure the URL format is correct:

### ✅ Correct Formats:
```
http://127.0.0.1:5000
http://192.168.1.100:5000
http://localhost:5000
```

### ❌ Wrong Formats:
```
localhost:5000          (missing http://)
http://localhost:5000/  (trailing slash)
http://localhost        (missing port)
```

---

## Solution 4: Manual Configuration File

If MT5 UI doesn't work, you can edit the config file directly:

### Windows Location:
```
C:\Users\YOUR_USERNAME\AppData\Roaming\MetaQuotes\Terminal\YOUR_BROKER_ID\config\common.ini
```

### Add to File:
```ini
[WebRequest]
AllowWebRequest=1
WebRequestURLs=http://127.0.0.1:5000
```

**Or multiple URLs:**
```ini
WebRequestURLs=http://127.0.0.1:5000;http://192.168.1.100:5000
```

**Note:** Close MT5 before editing this file!

---

## Solution 5: Test Backend Accessibility

Before configuring MT5, verify your backend is accessible:

### Test 1: Browser
```
Open browser: http://localhost:5000
Should show some response (even if error)
```

### Test 2: Command Line
```bash
# Windows PowerShell
Invoke-WebRequest -Uri http://localhost:5000

# Or curl (if installed)
curl http://localhost:5000
```

### Test 3: Check Backend is Running
```bash
cd backend
npm run dev

# Should show: "Server running on port 5000"
```

---

## Solution 6: Use Different Port

If port 5000 is blocked, try a different port:

### Change Backend Port:

**In `backend/.env`:**
```env
PORT=3000
```

**Or in `backend/src/server.ts`:**
```typescript
const PORT = process.env.PORT || 3000;
```

### Then Add to MT5:
```
http://127.0.0.1:3000
```

---

## Troubleshooting Steps

### 1. Check MT5 Version
- Some older MT5 versions have bugs with WebRequest
- Update to latest MT5 version if possible

### 2. Check Admin Rights
- Run MT5 as Administrator
- Right-click MT5 → "Run as administrator"

### 3. Check Firewall
- Windows Firewall might be blocking
- Allow Node.js through firewall
- Or temporarily disable firewall for testing

### 4. Try Different URL Format
- Try without `http://`: `127.0.0.1:5000`
- Try with trailing slash: `http://127.0.0.1:5000/`
- Try wildcard: `http://127.0.0.1:*`

### 5. Check MT5 Logs
- View → Toolbox → Journal tab
- Look for WebRequest errors
- Check for permission errors

---

## Recommended Solution

**Best approach for most users:**

1. **Use 127.0.0.1 instead of localhost:**
   ```
   http://127.0.0.1:5000
   ```

2. **If that doesn't work, use your local IP:**
   ```
   http://192.168.1.100:5000  (your actual IP)
   ```

3. **Update EA input to match**

---

## Quick Test Script

Create a test file to verify backend is accessible:

**test-backend.ps1:**
```powershell
# Test backend accessibility
$url = "http://localhost:5000"
Write-Host "Testing: $url"

try {
    $response = Invoke-WebRequest -Uri $url -Method GET -TimeoutSec 5
    Write-Host "✅ Backend is accessible!" -ForegroundColor Green
    Write-Host "Status: $($response.StatusCode)"
} catch {
    Write-Host "❌ Backend is NOT accessible" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)"
    
    # Try with 127.0.0.1
    $url2 = "http://127.0.0.1:5000"
    Write-Host "`nTrying: $url2"
    try {
        $response2 = Invoke-WebRequest -Uri $url2 -Method GET -TimeoutSec 5
        Write-Host "✅ Backend accessible via 127.0.0.1!" -ForegroundColor Green
        Write-Host "Use this URL in MT5: $url2"
    } catch {
        Write-Host "❌ Backend not accessible via 127.0.0.1" -ForegroundColor Red
    }
}
```

Run: `.\test-backend.ps1`

---

## Summary

**If `localhost` doesn't work:**

1. ✅ Try `http://127.0.0.1:5000`
2. ✅ Try your local IP: `http://192.168.1.100:5000`
3. ✅ Edit config file manually
4. ✅ Check backend is running
5. ✅ Verify firewall settings

**Most common fix:** Use `127.0.0.1` instead of `localhost`!

