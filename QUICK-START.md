# Quick Start Guide

## 🚀 Get Started in 5 Minutes

### Step 1: Backend Setup (2 minutes)

```bash
cd backend
npm install
```

Create `backend/.env`:
```env
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://localhost:27017/letechs-copy-trading
JWT_SECRET=your-secret-key-12345
CORS_ORIGIN=http://localhost:3000
```

**Start Backend:**
```bash
npm run dev
```

✅ Backend running on http://localhost:5000

---

### Step 2: Frontend Setup (2 minutes)

```bash
cd frontend
npm install
```

Create `frontend/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:5000
```

**Start Frontend:**
```bash
npm run dev
```

✅ Frontend running on http://localhost:3000

---

### Step 3: Test (1 minute)

1. Open http://localhost:3000
2. Click "Register"
3. Create account: `test@example.com` / `password123`
4. Login
5. Go to "MT5 Accounts" → "Add Account"
6. Fill form and create account
7. Check EA Token is generated ✅

---

## 📝 MongoDB Setup

### Option 1: Local MongoDB
```bash
# Install MongoDB
# Start MongoDB service
# Use: mongodb://localhost:27017/letechs-copy-trading
```

### Option 2: MongoDB Atlas (Free Cloud)
1. Go to https://www.mongodb.com/cloud/atlas
2. Create free account
3. Create cluster
4. Get connection string
5. Use in MONGODB_URI

---

## ✅ Success Checklist

- [ ] Backend starts (port 5000)
- [ ] Frontend starts (port 3000)
- [ ] Can register user
- [ ] Can login
- [ ] Can create MT5 account
- [ ] EA token generated

---

## 🐛 Quick Fixes

**Backend won't start?**
- Check MongoDB is running
- Check PORT 5000 is free
- Check .env file exists

**Frontend won't start?**
- Check Node.js version (18+)
- Check .env.local exists
- Try `npm install` again

**Can't connect to API?**
- Check backend is running
- Check NEXT_PUBLIC_API_URL in .env.local
- Check browser console for errors

---

**Ready to test! 🎉**

