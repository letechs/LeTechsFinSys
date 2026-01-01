# LeTechs Copy Trading System - Complete System Overview

## 📋 Documentation Index

This system consists of **3 core components** with complete documentation:

1. **[Database Schema](./database-schema.md)** - MongoDB/PostgreSQL schema with all collections, relationships, and indexes
2. **[Backend API Structure](./backend-api-structure.md)** - Node.js/Express architecture with routes, services, and middleware
3. **[EA Authentication Flow](./ea-authentication-flow.md)** - EA-to-API communication protocol, heartbeat, and command execution

---

## 🎯 System Purpose

Transform your standalone commercial EA into a **cloud-controlled, subscription-based copy trading platform** where:

- ✅ Clients can manage MT5 accounts from your web dashboard
- ✅ Remote order placement from web terminal
- ✅ Master-Slave copy trading
- ✅ Subscription management with Stripe
- ✅ Real-time monitoring and control
- ✅ Rules engine (equity stop, daily loss, symbol filters)
- ✅ Templates for quick order placement

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    LETECHS.IO WEB APP                        │
│  - User Dashboard                                            │
│  - Subscription Management                                   │
│  - MT5 Account Control                                       │
│  - Master/Slave Setup                                        │
│  - Remote Order Placement                                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ HTTPS/REST API
                       │
┌──────────────────────▼──────────────────────────────────────┐
│              BACKEND API (Node.js + Express)                 │
│  - Authentication (JWT + EA Tokens)                          │
│  - Subscription Validation                                   │
│  - Command Queue (Redis)                                     │
│  - Signal Processing                                         │
│  - Master Trade Detection                                    │
│  - Rules Engine                                              │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ MongoDB/PostgreSQL
                       │ Redis (Command Queue)
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                    DATABASE                                  │
│  - Users & Subscriptions                                     │
│  - MT5 Accounts & EA Tokens                                │
│  - Master/Slave Links                                       │
│  - Commands & Trades                                         │
│  - Templates & Rules                                        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ HTTP Requests
                       │ (Heartbeat + Command Polling)
                       │
┌──────────────────────▼──────────────────────────────────────┐
│         CLIENT MT5 TERMINAL (VPS)                            │
│  - EA Installed (Your Commercial EA)                         │
│  - Connects with EA Token                                    │
│  - Sends Heartbeat (Status, Trades)                          │
│  - Polls for Commands                                        │
│  - Executes Orders Remotely                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔑 Key Features

### **1. Subscription Management**
- ✅ Stripe integration for payments
- ✅ Multiple plans (Basic, Pro, Enterprise)
- ✅ Feature gating (copy trading, remote control, etc.)
- ✅ Account limits (max MT5 accounts per user)
- ✅ Trial periods
- ✅ Automatic renewal

### **2. EA Token System**
- ✅ UUID v4 tokens (one per MT5 account)
- ✅ Persistent tokens (never expire)
- ✅ Token-based authentication for EA
- ✅ Secure token validation on every request

### **3. Master-Slave Copy Trading**
- ✅ One master → Multiple slaves
- ✅ Multiple masters → One slave (with priority)
- ✅ Lot multiplier configuration
- ✅ Risk management (percentage, fixed, balance ratio)
- ✅ Symbol filtering
- ✅ Real-time trade copying

### **4. Remote Order Placement**
- ✅ Web terminal UI
- ✅ Manual order placement
- ✅ Template-based orders
- ✅ Real-time execution on MT5
- ✅ Position monitoring

### **5. Rules Engine**
- ✅ Equity stop (close all if equity <= threshold)
- ✅ Daily loss limit (pause if loss > X%)
- ✅ Symbol filter (allow/exclude symbols)
- ✅ Max trades limit
- ✅ Time-based filter (trading hours)

### **6. Real-Time Communication**
- ✅ Heartbeat every 2-3 seconds
- ✅ Command polling every 1 second
- ✅ WebSocket support (optional for dashboard)
- ✅ Connection status monitoring

---

## 📊 Database Collections

1. **users** - User accounts and authentication
2. **subscriptions** - Subscription plans and status
3. **mt5_accounts** - MT5 account information and EA tokens
4. **copy_links** - Master-Slave relationships
5. **templates** - Predefined order templates
6. **commands** - Command queue for EA execution
7. **trades** - Trade history and open positions
8. **master_trade_signals** - Master trade events for copying
9. **heartbeats** - EA heartbeat logs (optional, for debugging)
10. **subscription_usage** - Usage tracking and analytics
11. **api_keys** - API keys for external access (optional)

See **[database-schema.md](./database-schema.md)** for complete schema details.

---

## 🔌 API Endpoints

### **Web User Endpoints** (JWT Auth)
- `/api/auth/*` - Authentication
- `/api/users/*` - User management
- `/api/subscriptions/*` - Subscription management
- `/api/mt5/*` - MT5 account management
- `/api/copy-trading/*` - Master-Slave setup
- `/api/commands/*` - Command creation
- `/api/templates/*` - Template management
- `/api/trades/*` - Trade history

### **EA Endpoints** (EA Token Auth)
- `POST /api/ea/heartbeat` - Send account status
- `GET /api/ea/commands` - Poll for commands
- `POST /api/ea/command-ack` - Acknowledge execution (optional)

### **Webhooks**
- `POST /api/webhooks/stripe` - Stripe payment webhooks

See **[backend-api-structure.md](./backend-api-structure.md)** for complete API documentation.

---

## 🔄 Communication Flow

### **Heartbeat Flow (EA → Backend)**
```
1. EA sends heartbeat every 2-3 seconds
2. Backend validates EA token
3. Backend checks subscription status
4. Backend updates account status (balance, equity, trades)
5. Backend detects master trade changes
6. Backend evaluates rules
7. Backend generates commands if needed
```

### **Command Flow (Backend → EA)**
```
1. Command created (from master trade, web terminal, template, or rule)
2. Command added to Redis queue
3. EA polls for commands every 1 second
4. EA receives pending commands
5. EA executes commands in MT5
6. EA reports results in next heartbeat
7. Backend updates command status
```

### **Master Copy Flow**
```
1. Master account EA sends heartbeat with open trades
2. Backend compares with previous snapshot
3. Backend detects new trades
4. Backend finds all slave accounts (via copy_links)
5. Backend generates copy commands for each slave
6. Commands added to queue
7. Slave EAs poll and execute
```

See **[ea-authentication-flow.md](./ea-authentication-flow.md)** for complete protocol details.

---

## 🛠️ Technology Stack

### **Backend**
- **Runtime:** Node.js
- **Framework:** Express.js
- **Language:** TypeScript
- **Database:** MongoDB (or PostgreSQL)
- **Cache/Queue:** Redis
- **Payment:** Stripe
- **Authentication:** JWT + Custom EA Tokens

### **Frontend** (To be built)
- **Framework:** Next.js / React
- **UI Library:** Tailwind CSS / Material-UI
- **Charts:** TradingView Widget / Chart.js
- **Real-time:** WebSocket / Server-Sent Events

### **EA**
- **Platform:** MetaTrader 5
- **Language:** MQL5
- **Communication:** HTTP WebRequest
- **Format:** JSON

---

## 🔒 Security Features

1. ✅ **JWT Authentication** for web users
2. ✅ **EA Token Authentication** for EA connections
3. ✅ **Password Hashing** with bcrypt
4. ✅ **Rate Limiting** on all endpoints
5. ✅ **Input Validation** with express-validator
6. ✅ **CORS** configuration
7. ✅ **Stripe Webhook** signature verification
8. ✅ **SQL Injection** prevention
9. ✅ **XSS Protection**

---

## 📈 Scalability

- **Target:** 5,000+ accounts
- **Heartbeat Rate:** 20,000+ per minute
- **Command Rate:** Low volume (commands are small)
- **Database:** Indexed for performance
- **Queue:** Redis for real-time command distribution
- **Load Balancing:** Nginx + multiple Node.js instances

---

## 🚀 Deployment

### **Backend**
- **Recommended:** DigitalOcean Droplet, AWS Lightsail, Railway.app
- **Requirements:** Node.js 18+, MongoDB/PostgreSQL, Redis

### **Frontend**
- **Recommended:** Vercel, Netlify
- **Requirements:** Next.js build

### **Database**
- **Recommended:** MongoDB Atlas, Supabase (PostgreSQL)
- **Requirements:** Managed database service

### **VPS (Client)**
- **Client's own VPS** with MT5 terminal installed
- **EA installed** and configured with EA token

---

## 📝 Next Steps

1. ✅ **Database Schema** - Complete ✓
2. ✅ **Backend API Structure** - Complete ✓
3. ✅ **EA Authentication Flow** - Complete ✓
4. ⏭️ **Frontend Dashboard Design** - Next
5. ⏭️ **MQL5 EA Code** - Next
6. ⏭️ **Stripe Integration** - Next
7. ⏭️ **Testing & Deployment** - Final

---

## 📚 Documentation Files

- **[database-schema.md](./database-schema.md)** - Complete database design
- **[backend-api-structure.md](./backend-api-structure.md)** - API architecture and endpoints
- **[ea-authentication-flow.md](./ea-authentication-flow.md)** - EA communication protocol

---

## ✅ System Requirements Met

- ✅ Subscription management with Stripe
- ✅ Client data management
- ✅ Remote MT5 account control
- ✅ Master-Slave copy trading
- ✅ Real-time monitoring
- ✅ Rules engine
- ✅ Template system
- ✅ Scalable architecture
- ✅ Secure authentication
- ✅ Production-ready design

---

**Your system is now fully designed and ready for implementation!** 🎉

