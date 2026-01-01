# Quick Reference - EA Configuration Values

## For Your Current Setup (hello@gmail.com)

### EA License EA Configuration:

```
Backend API base URL: http://localhost:5000
Your user ID from the platform: 6936ec11ca04b1e8119db09d
Your MT5 account numbers: 5930870,40890507,40699457
```

---

## How to Get These Values

### 1. User ID

**From Script:**
```bash
cd backend
npx ts-node src/scripts/find-user.ts hello@gmail.com
```

**Output:**
```
User ID: 6936ec11ca04b1e8119db09d
```

**From Frontend:**
- Login to dashboard
- Go to `/dashboard/subscription`
- Check browser console or network requests
- User ID is in the API response

**From Database:**
```javascript
db.users.findOne({ email: "hello@gmail.com" }, { _id: 1 })
// Copy the _id value (24 characters)
```

---

### 2. MT5 Account Numbers

**From Script:**
```bash
cd backend
npx ts-node src/scripts/find-user.ts hello@gmail.com
```

**Output:**
```
MT5 Accounts:
  1. Login ID: 5930870
  2. Login ID: 40890507
  3. Login ID: 40699457
```

**Format for EA:**
```
5930870,40890507,40699457
```
(Comma-separated, no spaces)

**From Frontend:**
- Login to dashboard
- Go to `/dashboard/accounts`
- See Login ID for each account
- Copy all Login IDs, comma-separated

**From Database:**
```javascript
db.mt5accounts.find(
  { userId: ObjectId("6936ec11ca04b1e8119db09d") },
  { loginId: 1 }
)
// Returns: [{ loginId: "5930870" }, ...]
```

---

## Where MT5 Accounts Are Configured

### In Backend:

**MT5Account Collection:**
```javascript
{
  userId: ObjectId("6936ec11ca04b1e8119db09d"),  // Links to User
  loginId: "5930870",                            // MT5 account number
  accountName: "Natesan",
  accountType: "master",
  status: "active"
}
```

**How it works:**
1. User adds MT5 account in frontend (`/dashboard/accounts`)
2. Frontend sends account to backend
3. Backend saves to `MT5Account` collection with `userId`
4. EA License EA sends `userId` + `mt5Accounts` array
5. Backend checks if those `loginId` values belong to that `userId`

---

## Full Access EA - EA Token

### How EA Token Works:

**For Full Access EA (existing system):**

1. **User adds MT5 account in frontend**
2. **Backend generates EA Token** (UUID)
3. **Token stored in database:**
   ```javascript
   {
     userId: ObjectId("6936ec11ca04b1e8119db09d"),
     loginId: "5930870",
     eaToken: "550e8400-e29b-41d4-a716-446655440000",  // Generated UUID
     // ... other fields
   }
   ```

4. **User gets EA Token from frontend:**
   - Go to `/dashboard/accounts`
   - Click on account
   - Copy EA Token

5. **EA uses EA Token:**
   - EA sends heartbeat with `eaToken` in header
   - Backend validates token
   - Token identifies which account the EA is running on

---

## Complete Flow

### EA License EA Flow:

```
1. User Setup:
   ├─ User registers → Gets User ID
   ├─ Admin assigns EA_LICENSE tier
   └─ User adds MT5 accounts in frontend

2. EA Configuration:
   ├─ User downloads EA License EA
   ├─ Opens EA in MT5
   └─ Configures:
      ├─ Backend URL: http://localhost:5000
      ├─ User ID: 6936ec11ca04b1e8119db09d
      └─ MT5 Accounts: 5930870,40890507,40699457

3. EA Validation:
   ├─ EA sends: POST /api/license/validate
   ├─ Body: { userId, mt5Accounts: ["5930870", ...] }
   ├─ Backend checks: Do these accounts belong to this user?
   └─ Response: { valid: true/false }

4. Copy Trading:
   └─ If valid → EA starts copy trading
```

### Full Access EA Flow:

```
1. User Setup:
   ├─ User registers → Gets User ID
   ├─ User has FULL_ACCESS tier (default)
   └─ User adds MT5 accounts in frontend

2. EA Configuration:
   ├─ User uses existing Full Access EA
   └─ Configures:
      ├─ EA Token: 550e8400-e29b-41d4-a716-446655440000
      └─ Backend URL: http://localhost:5000

3. EA Heartbeat:
   ├─ EA sends heartbeat with eaToken
   ├─ Backend validates token
   └─ Backend links EA to account

4. Copy Trading:
   └─ EA uses existing heartbeat/command system
```

---

## Key Differences

| Feature | EA License EA | Full Access EA |
|---------|---------------|----------------|
| **Authentication** | User ID + MT5 Accounts | EA Token |
| **Validation** | License API | Token validation |
| **Backend Usage** | Minimal (1 req/day) | Normal (heartbeat) |
| **Features** | Local copy only | Full features |
| **API Endpoint** | `/api/license/validate` | Existing heartbeat |

---

## Your Current Values

Based on your setup:

**User: hello@gmail.com**
- **User ID:** `6936ec11ca04b1e8119db09d`
- **Tier:** `FULL_ACCESS` (can be changed to `EA_LICENSE` by admin)
- **MT5 Accounts:**
  - `5930870` (master)
  - `40890507` (slave)
  - `40699457` (slave)

**EA License EA Configuration:**
```
LicenseApiUrl: http://localhost:5000
UserId: 6936ec11ca04b1e8119db09d
MT5AccountNumbers: 5930870,40890507,40699457
```

---

## Testing

### Test License Validation:

```bash
curl -X POST http://localhost:5000/api/license/validate \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "6936ec11ca04b1e8119db09d",
    "mt5Accounts": ["5930870", "40890507", "40699457"]
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "valid": true,
    "tier": "FULL_ACCESS",
    "allowedAccounts": ["5930870", "40890507", "40699457"]
  }
}
```

---

## Summary

- **EA License EA** needs: User ID + MT5 Account Numbers
- **MT5 accounts** are linked via `userId` in database
- **Backend validates** by checking if accounts belong to user
- **Full Access EA** uses EA Token (different system)
- **Your values** are ready to use in EA!

