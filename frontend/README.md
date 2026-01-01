# LeTechs Copy Trading - Frontend

Next.js frontend for MT5 Copy Trading System.

## 🚀 Getting Started

### Prerequisites

- Node.js 18.x or higher
- Backend API running on `http://localhost:5000`

### Installation

1. Install dependencies:
```bash
npm install
```

2. Create `.env.local` file:
```env
NEXT_PUBLIC_API_URL=http://localhost:5000
```

3. Start development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📁 Project Structure

```
frontend/
├── app/                    # Next.js App Router
│   ├── dashboard/         # Dashboard pages
│   ├── login/             # Login page
│   ├── register/          # Register page
│   └── layout.tsx         # Root layout
├── components/            # React components
│   ├── Layout/           # Layout components
│   └── ProtectedRoute.tsx
├── lib/                   # Utilities
│   ├── api.ts            # API client
│   └── auth.ts           # Auth utilities
└── package.json
```

## 🎨 Features

- ✅ User Authentication (Login/Register)
- ✅ Dashboard with statistics
- ✅ MT5 Account Management
- ✅ Web Terminal (Remote Order Placement)
- ✅ Subscription Management
- ✅ Copy Trading Setup
- ✅ Settings (Profile & Password)

## 📡 API Integration

The frontend communicates with the backend API at `NEXT_PUBLIC_API_URL`.

All API calls are handled through:
- `lib/api.ts` - Axios client with interceptors
- `lib/auth.ts` - Authentication service

## 🔐 Authentication

- JWT tokens stored in localStorage
- Automatic token injection in API requests
- Protected routes redirect to login if not authenticated

## 🛠️ Tech Stack

- **Next.js 14** - React framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **React Query** - Data fetching
- **Axios** - HTTP client
- **Lucide React** - Icons

## 📝 Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint

## 🚀 Deployment

Build the application:
```bash
npm run build
npm start
```

Or deploy to Vercel:
```bash
vercel
```

---

**Status:** Frontend is ready! ✅

