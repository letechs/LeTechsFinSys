# EA Configuration Guide - User ID, MT5 Accounts & EA Token

## Overview

There are **two different EA systems**:

1. **EA License EA** (`MT5-EA-License/CopyTradingEA_License.mq5`)
   - Uses: **User ID + MT5 Account Numbers**
   - For: EA_LICENSE tier users
   - Validates via: `/api/license/validate`

2. **Full Access EA** (Existing EA)
   - Uses: **EA Token**
   - For: FULL_ACCESS tier users
   - Validates via: Existing heartbeat system

---

## 1. EA License EA Configuration

### EA Inputs Required:

1. **Backend API base URL**: `http://localhost:5000` (or your production URL)
2. **Your user ID from the platform**: `6936ec11ca04b1e8119db09d` (from your user account)
3. **Your MT5 account numbers**: `5930870,40890507,40699457` (comma-separated)

### How to Get These Values:

#### Step 1: Get Your User ID

**Option A: From Frontend**
1. Login to dashboard
2. Go to `/dashboard/subscription`
3. Check browser console or network tab
4. Or use the find-user script:

```bash
cd backend
npx ts-node src/scripts/find-user.ts hello@gmail.com
```

**Option B: From Database**
```javascript
// MongoDB
db.users.findOne({ email: "hello@gmail.com" }, { _id: 1 })
// Returns: { _id: ObjectId("6936ec11ca04b1e8119db09d") }
// Copy the string: "6936ec11ca04b1e8119db09d"
```

#### Step 2: Get Your MT5 Account Numbers

**Option A: From Frontend**
1. Login to dashboard
2. Go to `/dashboard/accounts`
3. See your MT5 accounts listed
4. Copy the Login ID values

**Option B: From Database**
```javascript
// MongoDB
db.mt5accounts.find({ userId: ObjectId("6936ec11ca04b1e8119db09d") }, { loginId: 1 })
// Returns: [{ loginId: "5930870" }, { loginId: "40890507" }, ...]
```

**Option C: From MT5 Terminal**
- Check your MT5 account login number in the terminal

### EA Configuration Example:

```
Backend API base URL: http://localhost:5000
Your user ID from the platform: 6936ec11ca04b1e8119db09d
Your MT5 account numbers: 5930870,40890507,40699457
```

---

## 2. How Backend Validates EA License

### Flow:

1. **EA sends request:**
   ```json
   POST /api/license/validate
   {
     "userId": "6936ec11ca04b1e8119db09d",
     "mt5Accounts": ["5930870", "40890507", "40699457"]
   }
   ```

2. **Backend checks:**
   - User exists and is active
   - User has EA_LICENSE tier
   - Subscription is not expired
   - **All provided MT5 account numbers belong to this user**

3. **Backend validates MT5 accounts:**
   ```javascript
   // Backend queries MT5Account collection
   const userAccounts = await MT5Account.find({
     userId: userId,
     status: 'active'
   }).select('loginId')
   
   // Checks if all provided accounts are in userAccounts
   ```

4. **Response:**
   ```json
   {
     "success": true,
     "data": {
       "valid": true,
       "tier": "EA_LICENSE",
       "expiryDate": "2024-12-31T00:00:00.000Z",
       "allowedAccounts": ["5930870", "40890507", "40699457"]
     }
   }
   ```

---

## 3. Linking Backend and Frontend EA

### The Connection:

**Frontend → Backend → EA**

1. **User adds MT5 accounts in Frontend:**
   - User goes to `/dashboard/accounts`
   - Adds MT5 account with Login ID
   - Account is saved to `MT5Account` collection with `userId`

2. **Backend stores the link:**
   ```javascript
   // MT5Account document
   {
     userId: ObjectId("6936ec11ca04b1e8119db09d"),
     loginId: "5930870",
     accountName: "My Account",
     // ... other fields
   }
   ```

3. **EA License EA validates:**
   - EA sends `userId` and `mt5Accounts` array
   - Backend checks if those accounts belong to that user
   - If yes → License valid ✅
   - If no → License invalid ❌

### Important:

- **MT5 accounts must be added in the frontend first**
- **EA can only use accounts that are linked to the user**
- **Backend automatically validates the link**

---

## 4. Full Access EA - EA Token System

### How Full Access EA Works:

**Full Access EA uses EA Token (different system):**

1. **User adds MT5 account in Frontend:**
   - Creates account with Login ID
   - Backend generates **EA Token** (UUID)
   - Token is stored in `MT5Account.eaToken`

2. **EA uses EA Token:**
   - EA sends heartbeat with `eaToken` in header
   - Backend validates token
   - Token links EA to specific MT5 account

3. **EA Token is per account:**
   - Each MT5 account has its own EA Token
   - Token is shown in frontend when viewing account
   - User copies token and pastes in EA

### EA Token Example:

```
EA Token: 550e8400-e29b-41d4-a716-446655440000
```

### Full Access EA Configuration:

```
EA Token: 550e8400-e29b-41d4-a716-446655440000
Backend URL: http://localhost:5000
```

---

## 5. Complete Setup Flow

### For EA License Tier:

1. **User Setup:**
   ```
   a. User registers/logs in
   b. Admin assigns EA_LICENSE tier
   c. User adds MT5 accounts in frontend
   d. User gets User ID from dashboard
   e. User gets MT5 account numbers from dashboard
   ```

2. **EA Configuration:**
   ```
   a. User downloads EA License EA
   b. Opens EA in MT5
   c. Configures:
      - Backend API URL
      - User ID
      - MT5 Account Numbers (comma-separated)
   d. EA validates license on startup
   ```

3. **Backend Validation:**
   ```
   a. EA sends userId + mt5Accounts
   b. Backend checks user tier
   c. Backend checks if accounts belong to user
   d. Backend returns validation result
   ```

### For Full Access Tier:

1. **User Setup:**
   ```
   a. User registers/logs in
   b. User has FULL_ACCESS tier (default)
   c. User adds MT5 accounts in frontend
   d. Backend generates EA Token for each account
   ```

2. **EA Configuration:**
   ```
   a. User uses existing Full Access EA
   b. Configures:
      - EA Token (from account page)
      - Backend URL
   c. EA sends heartbeat with token
   ```

---

## 6. Where MT5 Accounts Are Stored

### Database Structure:

**MT5Account Collection:**
```javascript
{
  _id: ObjectId("..."),
  userId: ObjectId("6936ec11ca04b1e8119db09d"),  // Links to User
  loginId: "5930870",                            // MT5 account number
  accountName: "My Account",
  eaToken: "550e8400-...",                       // For Full Access EA
  accountType: "slave",
  status: "active",
  // ... other fields
}
```

**User Collection:**
```javascript
{
  _id: ObjectId("6936ec11ca04b1e8119db09d"),
  email: "hello@gmail.com",
  subscriptionTier: "EA_LICENSE",
  subscriptionExpiry: ISODate("2024-12-31"),
  // ... other fields
}
```

### The Link:

- **User** → has many **MT5Accounts** (via `userId` field)
- **EA License EA** validates by checking if `loginId` belongs to `userId`
- **Full Access EA** uses `eaToken` to identify account

---

## 7. Quick Reference

### EA License EA:
```
Input: User ID + MT5 Account Numbers
Validation: Checks if accounts belong to user
API: POST /api/license/validate
```

### Full Access EA:
```
Input: EA Token
Validation: Token-based authentication
API: Existing heartbeat system
```

### Getting Values:

**User ID:**
- Dashboard → Subscription page
- Or: `npx ts-node src/scripts/find-user.ts email@example.com`

**MT5 Account Numbers:**
- Dashboard → Accounts page
- Or: Check MT5 terminal
- Or: Database query

**EA Token (Full Access):**
- Dashboard → Accounts page → View account → Copy EA Token

---

## 8. Troubleshooting

### "Invalid account numbers" Error:

**Problem:** EA License EA validation fails

**Solution:**
1. Check if MT5 accounts are added in frontend
2. Verify account numbers match exactly
3. Check if accounts are active
4. Verify user has EA_LICENSE tier

### "User not found" Error:

**Problem:** User ID is incorrect

**Solution:**
1. Get correct User ID from dashboard
2. Or use find-user script
3. Make sure User ID is 24-character hex string

### "Subscription expired" Error:

**Problem:** User subscription has expired

**Solution:**
1. Admin updates subscription expiry date
2. Or user renews subscription

---

## Summary

- **EA License EA** uses **User ID + MT5 Account Numbers**
- **Full Access EA** uses **EA Token**
- **MT5 accounts** are linked to users via `userId` in database
- **Backend validates** by checking if accounts belong to user
- **Frontend** is where users add MT5 accounts
- **EA** validates license on startup

