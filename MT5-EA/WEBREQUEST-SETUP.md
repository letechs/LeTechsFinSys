# How to Enable WebRequest in MT5

## 🔧 **Method 1: Through MT5 Settings (Recommended)**

### Step-by-Step:

1. **Open MT5 Terminal**

2. **Go to Settings:**
   - Click **Tools** → **Options** (or press `Ctrl+O`)

3. **Navigate to Expert Advisors Tab:**
   - Click on **"Expert Advisors"** in the left sidebar

4. **Enable WebRequest:**
   - ✅ Check **"Allow WebRequest for listed URL:"**
   - Click the **"Add"** button below

5. **Add Your URL:**
   - In the input field, type: `http://localhost:5000`
   - Click **"OK"** or **"Add"**
   - The URL should appear in the list below

6. **Save:**
   - Click **"OK"** to save settings

### ⚠️ **If "Add" Button Doesn't Work:**

Try these alternatives:

#### **Option A: Use IP Address Instead**
- Instead of `http://localhost:5000`
- Use: `http://127.0.0.1:5000`
- Sometimes MT5 prefers IP addresses

#### **Option B: Use Wildcard**
- Try: `http://localhost:*`
- Or: `http://127.0.0.1:*`
- This allows all ports on localhost

#### **Option C: Edit Config File Directly**
1. Close MT5 completely
2. Navigate to: `C:\Users\[YourUsername]\AppData\Roaming\MetaQuotes\Terminal\[TerminalID]\config`
3. Open `common.ini` file
4. Find `[Experts]` section
5. Add line: `WebRequestURL=http://localhost:5000`
6. Save and restart MT5

---

## 🔧 **Method 2: Use IP Address (127.0.0.1)**

If `localhost` doesn't work, use the IP address:

1. In MT5 settings, add: `http://127.0.0.1:5000`
2. Update your EA input parameter:
   - Change `BackendURL` from `http://localhost:5000` to `http://127.0.0.1:5000`

---

## 🔧 **Method 3: Use Full URL with Path**

Sometimes MT5 needs the full path:

1. Try adding: `http://localhost:5000/api`
2. Or: `http://127.0.0.1:5000/api`

---

## 🔧 **Method 4: Edit EA to Use IP**

If you can't add localhost, modify the EA:

1. Open `CopyTradingEA.mq5` in MetaEditor
2. Change the default input:
   ```mq5
   input string BackendURL = "http://127.0.0.1:5000";  // Use IP instead
   ```
3. Compile and use

---

## 🧪 **Test if WebRequest is Working**

After adding the URL:

1. **Compile your EA** (F7 in MetaEditor)
2. **Attach EA to chart**
3. **Check the Experts tab** (View → Toolbox → Experts)
4. **Look for errors:**
   - If you see: `"WebRequest: URL not allowed"` → URL not added correctly
   - If you see: `"HTTP POST ... -> status 200"` → ✅ Working!

---

## 🐛 **Common Issues & Solutions**

### Issue 1: "Add" button is grayed out
**Solution:** Make sure "Allow WebRequest for listed URL" checkbox is checked first

### Issue 2: URL gets removed after restart
**Solution:** 
- Make sure you click "OK" (not just "Apply")
- Check if you have write permissions to MT5 config folder

### Issue 3: Still getting "URL not allowed" error
**Solutions:**
- Try `http://127.0.0.1:5000` instead of `localhost`
- Try `http://localhost:*` (wildcard for all ports)
- Check if firewall is blocking MT5
- Restart MT5 after adding URL

### Issue 4: Can't find the setting
**Solution:**
- Make sure you're in **Expert Advisors** tab, not "Server" or "Charts"
- Look for "Allow WebRequest" checkbox near the bottom

---

## 📝 **Alternative: Test Without WebRequest**

If you absolutely can't add the URL, you can test the EA logic without actual HTTP calls:

1. Comment out WebRequest calls temporarily
2. Use mock responses for testing
3. Add URL later when deploying

---

## ✅ **Verification Checklist**

- [ ] MT5 is closed and reopened after adding URL
- [ ] URL is in the list (visible in settings)
- [ ] EA compiles without errors
- [ ] No "URL not allowed" errors in logs
- [ ] Backend is running on port 5000
- [ ] Firewall allows MT5 to connect

---

## 🆘 **Still Having Issues?**

If none of the above works:

1. **Check MT5 Version:**
   - Some older versions have WebRequest issues
   - Update to latest MT5 version

2. **Check Windows Firewall:**
   - Allow MT5 through firewall
   - Allow port 5000

3. **Try Different Port:**
   - Change backend to port 3000 or 8000
   - Add that URL instead

4. **Use Production URL:**
   - If testing locally doesn't work
   - Deploy backend to a server
   - Use that URL (e.g., `http://your-server.com`)

---

*Last updated: Based on MT5 build 3815+*

