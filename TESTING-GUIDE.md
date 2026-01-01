# Testing Guide - Phase 1 & Phase 2

## Overview

This guide explains how to test Phase 1 (Backend API) and Phase 2 (EA License EA) implementations.

---

## Phase 1: Backend API Testing (✅ Can Test Without MT5)

### Prerequisites

1. Backend server running (`npm run dev` or `npm start`)
2. Database connected
3. At least one user in database with subscription tier

### Method 1: Using PowerShell Script (Windows)

```powershell
# Edit test-license-api.ps1 and update:
# - $testUserId = "YOUR_USER_ID_HERE"
# - $testAccounts = @("12345", "67890")

# Then run:
.\test-license-api.ps1
```

### Method 2: Using Bash Script (Linux/Mac)

```bash
# Edit test-license-api.sh and update:
# - USER_ID="YOUR_USER_ID_HERE"
# - ACCOUNTS='["12345", "67890"]'

# Then run:
chmod +x test-license-api.sh
./test-license-api.sh
```

### Method 3: Using Postman

1. **Create New Request:**
   - Method: `POST`
   - URL: `http://localhost:5000/api/license/validate`

2. **Headers:**
   - `Content-Type: application/json`

3. **Body (raw JSON):**
   ```json
   {
     "userId": "YOUR_USER_ID_HERE",
     "mt5Accounts": ["12345", "67890"]
   }
   ```

4. **Expected Response (Valid):**
   ```json
   {
     "success": true,
     "data": {
       "valid": true,
       "expiryDate": "2024-12-31T00:00:00.000Z",
       "allowedAccounts": ["12345", "67890"],
       "tier": "EA_LICENSE"
     }
   }
   ```

5. **Expected Response (Invalid):**
   ```json
   {
     "success": false,
     "data": {
       "valid": false,
       "allowedAccounts": [],
       "tier": "EA_LICENSE",
       "message": "User not found"
     }
   }
   ```

### Method 4: Using curl

```bash
curl -X POST http://localhost:5000/api/license/validate \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "YOUR_USER_ID_HERE",
    "mt5Accounts": ["12345", "67890"]
  }'
```

### Getting Test Data

**To get a User ID from MongoDB:**
```javascript
// Connect to MongoDB
use your_database_name

// Find a user
db.users.findOne()

// Get user ID
db.users.findOne({}, {_id: 1})
```

**To get MT5 Account Numbers:**
```javascript
// Find MT5 accounts for a user
db.mt5accounts.find({userId: ObjectId("USER_ID_HERE")}, {loginId: 1})
```

---

## Phase 2: EA License EA Testing (❌ Requires MT5)

### Why We Can't Test Without MT5

- EA is written in MQL5 (MetaTrader 5 language)
- Requires MT5 platform to compile and run
- Requires MT5 accounts to test copy trading
- Requires MT5 terminal to execute

### What We CAN Verify Without MT5

1. **Code Structure:**
   - ✅ Files are created correctly
   - ✅ Code syntax is correct (can check with MQL5 compiler)
   - ✅ Logic flow is correct

2. **Integration Points:**
   - ✅ License validation API call is correct
   - ✅ Request/response format matches Phase 1
   - ✅ Error handling is in place

3. **Code Review:**
   - ✅ License validation integrated
   - ✅ Local copy trading logic preserved
   - ✅ No breaking changes to existing features

### How to Test EA (When You Have MT5)

1. **Compile EA:**
   - Open MT5 MetaEditor
   - Open `CopyTradingEA_License.mq5`
   - Compile (F7)
   - Check for errors

2. **Configure EA:**
   - Set `LicenseApiUrl` to your backend URL
   - Set `UserId` to your user ID
   - Set `MT5AccountNumbers` to your account numbers
   - Set other copy trading settings

3. **Add API URL to MT5:**
   - Tools → Options → Expert Advisors
   - Check "Allow WebRequest for listed URL"
   - Add your backend URL

4. **Run EA:**
   - Attach to chart
   - Check Experts log for license validation messages
   - Verify copy trading works

---

## Recommended Approach

### Option 1: Test Phase 1 Now, Continue to Phase 3/4

**Pros:**
- ✅ Can verify backend API works
- ✅ Can continue development
- ✅ EA testing can be done later when MT5 is available

**Steps:**
1. Test Phase 1 API using scripts/Postman
2. Verify API responses are correct
3. Continue to Phase 3 (Testing & Validation) or Phase 4 (UI)

### Option 2: Code Review Only

**Pros:**
- ✅ Can verify code structure
- ✅ Can verify integration points
- ✅ Can identify potential issues

**Steps:**
1. Review Phase 1 code (already done)
2. Review Phase 2 code structure
3. Verify integration points match
4. Continue to Phase 3/4

---

## Quick Test Checklist

### Phase 1 Backend API ✅

- [ ] Backend server starts without errors
- [ ] License validation endpoint responds
- [ ] Valid license request returns success
- [ ] Invalid user ID returns error
- [ ] Missing fields return 400 error
- [ ] Expired subscription returns error
- [ ] Account validation works

### Phase 2 EA Code Structure ✅

- [ ] Files created in correct location
- [ ] License validation integrated
- [ ] Local copy trading logic preserved
- [ ] Error handling in place
- [ ] Offline mode implemented
- [ ] Code structure matches requirements

---

## Test Results Template

```
Phase 1 Backend API Testing:
- Test 1 (Valid License): [PASS/FAIL]
- Test 2 (Invalid User): [PASS/FAIL]
- Test 3 (Missing Fields): [PASS/FAIL]
- Test 4 (Expired License): [PASS/FAIL]

Phase 2 EA Code Review:
- Code Structure: [OK/ISSUES]
- Integration Points: [OK/ISSUES]
- Logic Flow: [OK/ISSUES]
```

---

## Recommendation

**Since EA requires MT5 to test, I recommend:**

1. **Test Phase 1 API now** (using scripts/Postman)
2. **Verify Phase 2 code structure** (code review)
3. **Continue to Phase 3/4** (can test EA later when MT5 is available)

**This way:**
- ✅ We verify backend works
- ✅ We continue development
- ✅ EA testing happens when MT5 is ready

---

## Next Steps

1. **Test Phase 1 API** using provided scripts
2. **Review Phase 2 code** structure
3. **Continue to Phase 3** (Testing & Validation) or **Phase 4** (UI Development)

---

**Note:** EA testing will require MT5 platform. Backend API testing can be done immediately.

