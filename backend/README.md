# LeTechs Copy Trading System - Backend API

Backend API for MT5 Copy Trading System built with Node.js, Express, TypeScript, MongoDB, and Redis.

## 🚀 Getting Started

### Prerequisites

- Node.js 20.x or higher
- MongoDB (local or MongoDB Atlas)
- Redis (optional, for command queue)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file in the root directory:
```env
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://localhost:27017/letechs-copy-trading
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=your-super-secret-jwt-key
STRIPE_SECRET_KEY=sk_test_your_key
```

3. Start development server:
```bash
npm run dev
```

4. Build for production:
```bash
npm run build
npm start
```

## 📁 Project Structure

```
backend/
├── src/
│   ├── config/          # Configuration files
│   ├── models/          # Database models
│   ├── middleware/      # Express middleware
│   ├── services/        # Business logic
│   ├── controllers/     # Request handlers
│   ├── routes/          # API routes
│   ├── utils/           # Utility functions
│   ├── types/           # TypeScript types
│   ├── jobs/            # Background jobs
│   ├── app.ts           # Express app setup
│   └── server.ts        # Server entry point
├── logs/                # Log files
├── dist/                # Compiled JavaScript
└── package.json
```

## 🔧 Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Start production server

## 📚 Documentation

See `/docs` folder in the root project for complete system documentation:
- Database Schema
- API Structure
- EA Authentication Flow

## 🔒 Environment Variables

See `.env.example` for all required environment variables.

