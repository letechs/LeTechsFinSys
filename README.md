# LeTechs MT5 Copy Trading System

Complete full-stack MT5 copy trading platform with subscription management, remote control, and real-time trade copying.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- MongoDB (local or MongoDB Atlas)
- Redis (optional - for command queue)

### 1. Backend Setup

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

Start backend:
```bash
npm run dev
```

✅ Backend running on http://localhost:5000

### 2. Frontend Setup

```bash
cd frontend
npm install
```

Create `frontend/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:5000
```

Start frontend:
```bash
npm run dev
```

✅ Frontend running on http://localhost:3000

### 3. Test the System

1. Open http://localhost:3000
2. Register a new account
3. Login
4. Create MT5 account
5. Test web terminal

---

## 📚 Documentation

- **[QUICK-START.md](./QUICK-START.md)** - 5-minute setup guide
- **[TESTING-GUIDE.md](./TESTING-GUIDE.md)** - Complete testing instructions
- **[docs/](./docs/)** - System documentation
- **[backend/README.md](./backend/README.md)** - Backend documentation
- **[frontend/README.md](./frontend/README.md)** - Frontend documentation

---

## 📁 Project Structure

```
mt5-copy-trading/
├── backend/          # Node.js + Express API
├── frontend/         # Next.js dashboard
├── docs/             # System documentation
├── ea/               # MQL5 EA (to be developed)
└── README.md         # This file
```

---

## ✅ Features

- ✅ User Authentication (JWT)
- ✅ Subscription Management
- ✅ MT5 Account Management
- ✅ EA Token System
- ✅ Web Terminal (Remote Order Placement)
- ✅ Copy Trading Setup
- ✅ Rules Engine
- ✅ Real-time Communication

---

## 🧪 Testing Checklist

- [ ] Backend starts successfully
- [ ] Frontend starts successfully
- [ ] Can register user
- [ ] Can login
- [ ] Can create MT5 account
- [ ] EA token generated
- [ ] Can place orders via web terminal
- [ ] Dashboard shows statistics

---

## 🐛 Troubleshooting

**Backend won't start?**
- Check MongoDB is running
- Check .env file exists
- Check PORT 5000 is available

**Frontend won't start?**
- Check Node.js version (18+)
- Check .env.local exists
- Run `npm install` again

**Can't connect?**
- Verify backend is running on port 5000
- Check NEXT_PUBLIC_API_URL in frontend/.env.local
- Check browser console for errors

---

## 📝 Next Steps

1. **Test the system** - Follow TESTING-GUIDE.md
2. **Develop EA** - Create MQL5 Expert Advisor
3. **Stripe Integration** - Complete payment flow
4. **Deploy** - Deploy to production

---

## 🎉 Status

- ✅ Backend: Complete
- ✅ Frontend: Complete
- ⏳ EA: To be developed
- ⏳ Stripe: Integration pending

---

**Ready to test! 🚀**

