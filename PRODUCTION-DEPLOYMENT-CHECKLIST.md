# Production Deployment Checklist

This checklist contains all items that need to be addressed before deploying to production. Work through them systematically, starting with Critical items.

---

## 🔴 CRITICAL ISSUES (Must Fix Before Deployment)

### 1. Environment Variables Configuration
- [x] **Create `.env.example` file for backend** with all required variables ✅ DONE
- [x] **Create `.env.local.example` file for frontend** with all required variables ✅ DONE
- [x] **Remove hardcoded `localhost` references** and replace with environment variables ✅ DONE
  - Location: `backend/src/config/env.ts`, `backend/src/app.ts`, `frontend/next.config.js`
  - Replace all `http://localhost:3000` and `http://localhost:5000` with env vars
  - Updated: `stripeService.ts` and `paymentController.ts` now use `config.frontendUrl`
  - Updated: `next.config.js` CSP now uses `NEXT_PUBLIC_API_URL` dynamically
- [ ] **Verify all production environment variables are set:**
  - [ ] `NODE_ENV=production`
  - [ ] `MONGODB_URI` (production MongoDB connection string)
  - [ ] `JWT_SECRET` (strong, random secret - use `openssl rand -base64 32`)
  - [ ] `STRIPE_SECRET_KEY` (production key: `sk_live_...`)
  - [ ] `STRIPE_WEBHOOK_SECRET` (production webhook secret: `whsec_...`)
  - [ ] `STRIPE_PUBLISHABLE_KEY` (production key: `pk_live_...`)
  - [ ] `CORS_ORIGIN` (your production frontend URL: `https://yourdomain.com`)
  - [ ] `FRONTEND_URL` (your production frontend URL: `https://yourdomain.com`)
  - [ ] `SMTP_HOST`, `SMTP_PORT`, `SMTP_EMAIL`, `SMTP_PASSWORD`
  - [ ] `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`

**Files to update:**
- `backend/.env.example` (create)
- `frontend/.env.local.example` (create)
- `backend/src/services/payment/stripeService.ts` (line 364-365)
- `backend/src/controllers/paymentController.ts` (line 834)
- `frontend/next.config.js` (line 15 - CSP header)

---

### 2. Remove/Replace Console.log Statements
- [x] **Backend:** Replace all `console.log` with proper logger ✅ DONE
  - Priority files completed:
    - `backend/src/controllers/paymentController.ts` - All console.log replaced with logger
    - `backend/src/services/payment/stripeService.ts` - All console.log replaced with logger
    - `backend/src/routes/webhooks.routes.ts` - All console.log replaced with logger
    - `backend/src/app.ts` - Debug logs replaced with logger.debug
    - `backend/src/services/subscription/subscriptionService.ts` - All console.log replaced with logger
    - `backend/src/services/copyTrading/signalDetectionService.ts` - All console.log replaced with logger
  - Note: `console.error/warn` in `server.ts` and `env.ts` are acceptable (startup warnings before logger initialization)
  - Use: `logger.info()`, `logger.debug()`, `logger.warn()`, `logger.error()`
- [x] **Frontend:** Remove or conditionally enable `console.log` ✅ DONE
  - Removed debug console.log statements from:
    - `frontend/app/dashboard/subscription/page.tsx`
    - `frontend/app/dashboard/accounts/page.tsx`
    - `frontend/lib/hooks/useAccounts.ts`
  - Remaining console statements in other files are minimal and can be handled case-by-case
  - Use: Removed debug logs; production builds won't include them

**Search and replace:**
```bash
# Backend - Find all console.log
grep -r "console.log" backend/src --exclude-dir=node_modules

# Frontend - Find all console.log  
grep -r "console.log" frontend --exclude-dir=node_modules
```

---

### 3. CORS Configuration for Production
- [x] **Verify CORS is properly restricted in production** ✅ DONE
  - Location: `backend/src/app.ts` (lines 17-45)
  - ✅ Production mode uses `config.corsOrigin` (single origin only)
  - ✅ Added startup logging to show CORS configuration
  - ✅ WebSocket CORS also uses `config.corsOrigin` for consistency
  - ✅ Code uses `isDevelopment` variable for clarity
  - **Note:** In production, CORS will reject requests from unauthorized origins automatically
  - **To test:** Set `NODE_ENV=production` and `CORS_ORIGIN=https://yourdomain.com`, then try accessing from different origin

**Production behavior:**
- Development: `origin: true` (allows all origins)
- Production: `origin: config.corsOrigin` (single origin only - strict)

---

### 4. Content Security Policy (CSP) Update
- [x] **Remove `localhost` from CSP headers in production** ✅ DONE
  - Location: `frontend/next.config.js` (lines 7-29)
  - ✅ Updated CSP to check `NODE_ENV` for production vs development
  - ✅ Production: Uses only `NEXT_PUBLIC_API_URL` from env (no localhost)
  - ✅ Development: Allows localhost variants for local dev convenience
  - ✅ Properly uses `process.env.NEXT_PUBLIC_API_URL` instead of hardcoded localhost

---

### 5. Node.js Version Verification
- [x] **Ensure production server uses Node.js 18 LTS** ✅ VERIFIED
  - ✅ Backend `package.json` has engines field: `"node": ">=18.0.0 <19.0.0"`
  - ✅ Frontend `package.json` has engines field: `"node": ">=18.0.0 <19.0.0"` (added for consistency)
  - ✅ Server startup code has warning for Node.js 20.x (TLS bug with Stripe on Windows)
  - ✅ Warning is in place at `backend/src/server.ts` (lines 5-17)
  - **To verify:** Run `node --version` on production server - should be v18.x.x
  - **Note:** If Node 20 is detected, server will show warning but still start (Stripe calls will fail)

---

### 6. Log File Rotation Configuration
- [x] **Configure Winston log rotation** ✅ DONE
  - Location: `backend/src/utils/logger.ts`
  - ✅ Installed: `winston-daily-rotate-file` package
  - ✅ Configured: Rotate daily, keep 14 days, max 20MB per file
  - ✅ Updated logger to use DailyRotateFile transport for error and combined logs
  - ✅ Added zippedArchive: true to compress old log files
  - **Log files:** `logs/error-YYYY-MM-DD.log` and `logs/combined-YYYY-MM-DD.log`

---

## 🟠 HIGH PRIORITY (Should Fix Before Launch)

### 7. Stripe Webhook Signature Verification Testing
- [x] **Webhook signature verification implementation verified** ✅ VERIFIED
  - Location: `backend/src/services/payment/stripeService.ts` (lines 664-682)
  - ✅ `verifyWebhookSignature()` method properly implemented using `stripe.webhooks.constructEvent()`
  - ✅ Webhook route uses `express.raw()` middleware (required for signature verification)
  - ✅ Invalid signatures are properly rejected (returns 400 error)
  - ✅ Webhook secret checked: Uses `config.stripe.webhookSecret` from `STRIPE_WEBHOOK_SECRET` env var
  - **Testing instructions:**
    - Install Stripe CLI: `npm install -g stripe-cli` or download from https://stripe.com/docs/stripe-cli
    - Login: `stripe login`
    - Forward webhooks: `stripe listen --forward-to localhost:5000/api/payment/webhook`
    - Copy webhook signing secret from CLI output (starts with `whsec_`)
    - Set in `.env`: `STRIPE_WEBHOOK_SECRET=whsec_...`
    - Test: Trigger event with `stripe trigger checkout.session.completed`
    - Verify: Check logs for successful signature verification
    - Test invalid: Send webhook with wrong signature - should be rejected with 400 error

---

### 8. Production Email Configuration
- [x] **Email service implementation verified** ✅ VERIFIED
  - Location: `backend/src/services/email/emailService.ts`
  - ✅ Email service properly configured with SMTP support (Gmail or custom SMTP)
  - ✅ Email templates implemented:
    - ✅ Registration verification emails (`sendVerificationEmail`)
    - ✅ Password reset emails (`sendPasswordResetEmail`)
  - ✅ Configuration uses environment variables:
    - `SMTP_HOST`, `SMTP_PORT`, `SMTP_EMAIL`, `SMTP_PASSWORD`
    - `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`
    - `FRONTEND_URL` (for email links)
  - **Testing required before production:**
    - [ ] Test registration verification email (register new user)
    - [ ] Test password reset email (use forgot password)
    - [ ] Verify email links work correctly (verification and reset links)
    - [ ] Test with production SMTP credentials (update `.env` with production values)
    - [ ] Verify email delivery (check spam folder if needed)
  - **Production SMTP setup:**
    - Option 1: Gmail SMTP (free tier) - requires App Password
    - Option 2: Custom SMTP (recommended for production) - set `SMTP_HOST`, `SMTP_PORT`, etc.

---

### 9. Rate Limiting Verification
- [x] **Rate limiting implementation verified** ✅ VERIFIED
  - Location: `backend/src/middleware/rateLimit.ts`
  - ✅ Rate limits properly configured and match documentation:
    - ✅ General API: 100 requests / 15 minutes (`apiLimiter`)
    - ✅ Auth: 5 requests / 15 minutes (`authLimiter`)
    - ✅ EA: 600 requests / 1 minute (`eaLimiter`)
    - ✅ Commands: 120 requests / 1 minute (`commandLimiter`)
  - ✅ All limiters are disabled in development (using `skip()` function)
  - ✅ All limiters active in production mode
  - ✅ Properly applied to routes:
    - `apiLimiter`: Applied globally to all API routes (`routes/index.ts`)
    - `authLimiter`: Applied to auth routes (register, login, forgot-password, reset-password)
    - `eaLimiter`: Applied to EA webhook routes
    - `commandLimiter`: Available for command routes (if needed)
  - ✅ Additional features:
    - `authLimiter` uses `skipSuccessfulRequests: true` (only counts failed attempts)
    - Standard headers enabled for rate limit info (`X-RateLimit-*`)
    - Appropriate error messages for each limiter
  - **Testing required:**
    - [ ] Test rate limiting in production mode (set `NODE_ENV=production`)
    - [ ] Verify requests are blocked after limit exceeded
    - [ ] Verify rate limit headers are included in responses
    - [ ] Test that development mode doesn't enforce limits

---

### 10. Health Check Endpoint Testing
- [x] **Health check endpoint implementation verified** ✅ VERIFIED
  - Location: `backend/src/app.ts` (around line 119)
  - ✅ Endpoint: `GET /health`
  - ✅ Returns: Simple JSON response `{ status: 'ok' }`
  - ✅ Response format: 200 status code with JSON body
  - **Setup monitoring (manual steps required):**
    - [ ] Configure PM2 monitoring (if using PM2)
    - [ ] Set up external monitoring service (UptimeRobot, Pingdom, etc.)
    - [ ] Configure monitoring to check: `GET https://your-domain.com/health`
    - [ ] Set alert thresholds (e.g., alert if down for 2+ minutes)
    - [ ] Test endpoint manually: `curl https://your-domain.com/health`
    - [ ] Verify response: Should return `{"status":"ok"}` with 200 status

---

### 11. Database Connection Pool Configuration
- [x] **MongoDB connection pool settings configured** ✅ DONE
  - Location: `backend/src/config/database.ts`
  - ✅ Explicit pool settings added for production:
    - `maxPoolSize: 10` - Maximum connections in pool
    - `minPoolSize: 2` - Minimum connections to maintain
    - `maxIdleTimeMS: 30000` - Close idle connections after 30s
  - ✅ Additional connection options:
    - `serverSelectionTimeoutMS: 5000` - Fast fail on connection issues
    - `socketTimeoutMS: 45000` - Close sockets after 45s inactivity
  - **Benefits:**
    - Better connection management under load
    - Prevents connection exhaustion
    - Maintains minimal connections for faster response
    - Automatically cleans up idle connections

---

### 12. HTTPS/SSL Configuration
- [x] **Trust proxy configuration added** ✅ DONE
  - Location: `backend/src/app.ts` (after app initialization)
  - ✅ `app.set('trust proxy', 1)` enabled in production
  - ✅ Allows correct `req.ip`, `req.protocol`, `req.hostname` when behind reverse proxy
  - ✅ Security headers via Helmet already configured

- [ ] **Infrastructure-level SSL/TLS configuration** (Manual - infrastructure setup)
  - **Use Nginx or Apache as reverse proxy**
  - **Obtain SSL certificate** (Let's Encrypt is free - use Certbot)
  - **Configure reverse proxy to:**
    - Terminate SSL/TLS (HTTPS on port 443)
    - Forward HTTP requests to backend on port 5000
    - Handle WebSocket connections (for Socket.IO)
    - Set proper headers (X-Forwarded-For, X-Forwarded-Proto, etc.)
  
  **Example Nginx configuration (to be created during deployment):**
  ```nginx
  # HTTPS server block
  server {
      listen 443 ssl http2;
      server_name your-domain.com;
      
      ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
      ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
      
      # SSL settings (best practices)
      ssl_protocols TLSv1.2 TLSv1.3;
      ssl_ciphers HIGH:!aNULL:!MD5;
      ssl_prefer_server_ciphers on;
      
      # Backend API
      location / {
          proxy_pass http://localhost:5000;
          proxy_http_version 1.1;
          proxy_set_header Upgrade $http_upgrade;
          proxy_set_header Connection 'upgrade';
          proxy_set_header Host $host;
          proxy_set_header X-Real-IP $remote_addr;
          proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
          proxy_set_header X-Forwarded-Proto $scheme;
          proxy_cache_bypass $http_upgrade;
      }
      
      # WebSocket support for Socket.IO
      location /socket.io/ {
          proxy_pass http://localhost:5000;
          proxy_http_version 1.1;
          proxy_set_header Upgrade $http_upgrade;
          proxy_set_header Connection "upgrade";
          proxy_set_header Host $host;
          proxy_set_header X-Real-IP $remote_addr;
          proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
          proxy_set_header X-Forwarded-Proto $scheme;
      }
  }
  
  # HTTP to HTTPS redirect
  server {
      listen 80;
      server_name your-domain.com;
      return 301 https://$server_name$request_uri;
  }
  ```
  
  **Steps:**
  1. Install Nginx: `sudo apt install nginx` (Ubuntu/Debian)
  2. Install Certbot: `sudo apt install certbot python3-certbot-nginx`
  3. Obtain certificate: `sudo certbot --nginx -d your-domain.com`
  4. Configure Nginx (use example above)
  5. Test configuration: `sudo nginx -t`
  6. Reload Nginx: `sudo systemctl reload nginx`

**Note:** SSL/HTTPS configuration is handled at infrastructure level (reverse proxy), not in application code. The application code is now ready to work behind a reverse proxy.

---

### 13. Process Management (PM2) Setup
- [x] **PM2 ecosystem configuration created** ✅ DONE
  - Location: `backend/ecosystem.config.js`
  - ✅ Configured with production settings
  - ✅ Logging to `logs/pm2-*.log` files
  - ✅ Auto-restart on crashes
  - ✅ Memory limit (restart if > 500MB)
  - ✅ Fork mode (better for MongoDB connections than cluster)
  - ✅ Production environment variables set

- [ ] **Install and configure PM2** (Manual - deployment steps)
  - **Install PM2 globally:**
    ```bash
    npm install -g pm2
    ```
  
  - **Build the backend application:**
    ```bash
    cd backend
    npm run build
    ```
  
  - **Start application with PM2:**
    ```bash
    pm2 start ecosystem.config.js --env production
    ```
  
  - **Setup PM2 to start on system boot:**
    ```bash
    # Generate startup script (run once)
    pm2 startup
    
    # Save current process list
    pm2 save
    ```
  
  - **Useful PM2 commands:**
    ```bash
    pm2 status                    # Check status
    pm2 logs letechs-backend      # View logs
    pm2 monit                     # Monitor CPU/Memory
    pm2 restart letechs-backend   # Restart app
    pm2 reload letechs-backend    # Zero-downtime reload
    pm2 stop letechs-backend      # Stop app
    pm2 delete letechs-backend    # Remove from PM2
    ```
  
  - **PM2 Configuration Details:**
    - **Mode:** Fork (single instance - better for MongoDB pooling)
    - **Auto-restart:** Enabled
    - **Memory limit:** 500MB (auto-restart if exceeded)
    - **Logging:** Separate error and output logs with timestamps
    - **Restart policy:** Max 10 restarts/minute, 4s delay between restarts
    - **Note:** Using fork mode instead of cluster to avoid MongoDB connection issues

---

### 14. Database Backup Strategy
- [x] **Backup scripts created** ✅ DONE
  - Location: `backend/scripts/`
  - ✅ `backup-mongodb.sh` - Linux/macOS backup script
  - ✅ `backup-mongodb.ps1` - Windows PowerShell backup script
  - ✅ `restore-mongodb.sh` - Linux/macOS restore script
  - Features:
    - Automatic compression
    - Retention policy (30 days by default)
    - Support for authenticated and unauthenticated MongoDB
    - MongoDB Atlas detection with warnings

- [ ] **Set up automated MongoDB backups** (Manual - deployment steps)
  
  **Option 1: MongoDB Atlas (Recommended - Automatic Backups)**
  - MongoDB Atlas provides automatic backups if you're using Atlas
  - No additional setup required
  - Backups are managed through Atlas dashboard
  - Go to: Atlas → Clusters → Backup → Configure backup schedule
  
  **Option 2: Self-Hosted MongoDB (Using Backup Scripts)**
  
  **Linux/macOS (Cron Job):**
  ```bash
  # Make script executable
  chmod +x backend/scripts/backup-mongodb.sh
  
  # Test backup manually first
  cd backend
  ./scripts/backup-mongodb.sh
  
  # Add to crontab (daily at 2 AM)
  crontab -e
  # Add this line:
  0 2 * * * cd /path/to/backend && ./scripts/backup-mongodb.sh >> logs/backup.log 2>&1
  ```
  
  **Windows (Scheduled Task):**
  ```powershell
  # Open Task Scheduler
  # Create new task:
  # - Trigger: Daily at 2:00 AM
  # - Action: Start a program
  # - Program: powershell.exe
  # - Arguments: -File "C:\path\to\backend\scripts\backup-mongodb.ps1"
  # - Working directory: C:\path\to\backend
  ```
  
  **Configuration:**
  - Set `MONGODB_URI` environment variable or edit script
  - Default backup location: `backend/backups/`
  - Default retention: 30 days
  - Backups are compressed (`.tar.gz` on Linux, `.zip` on Windows)
  
  **Option 3: Third-Party Backup Service**
  - Services like Backupify, Datto, or cloud storage solutions
  - Configure to run backup scripts or use their MongoDB tools
  
  **Restore Procedure:**
  ```bash
  # Linux/macOS
  cd backend
  ./scripts/restore-mongodb.sh backups/backup_20250115_020000.tar.gz
  # Use --drop flag to replace existing data (WARNING: deletes current data)
  ./scripts/restore-mongodb.sh backups/backup_20250115_020000.tar.gz --drop
  ```
  
  **Testing:**
  - [ ] Run backup script manually to verify it works
  - [ ] Test restore on a development database
  - [ ] Verify backup files are created and compressed correctly
  - [ ] Verify old backups are cleaned up after retention period
  - [ ] Document restore procedure for your team

---

## 🟡 MEDIUM PRIORITY (Important but Not Blocking)

### 15. Monitoring and Alerting
- [ ] **Set up basic monitoring**
  - Options: PM2 Plus (free), New Relic (free tier), or custom solution
  - Monitor: CPU, memory, response times, error rates
  - Set up alerts for:
    - Server down
    - High error rate
    - High response time
    - Database connection failures

---

### 16. Home Page Creation
- [x] **Professional landing page created** ✅ DONE
  - Location: `frontend/app/page.tsx`
  - ✅ Company positioning: LeTechs Finsys Technologies LLC as trading software company
  - ✅ Hero section with clear value proposition
  - ✅ Services section (Copy Trading, Trading Apps, Auto Trading EA)
  - ✅ Features/benefits section
  - ✅ Contact section with WhatsApp, phone numbers, and address
  - ✅ Professional footer with legal links (Terms, Privacy Policy)
  - ✅ Responsive design matching existing UI
  - ✅ Navigation with Login/Get Started buttons
  - ✅ Contact information:
    - WhatsApp: https://wa.me/message/C2ERB7SZ3J5SJ1
    - Phone: +971 544569987, +971 544374722
    - Address: 2401, Clover Bay Tower, Business Bay, Dubai, UAE

**Note:** Terms of Service and Privacy Policy pages should be created separately when needed

---

### 17. API Documentation
- [ ] **Create API documentation** (optional)
  - Consider Swagger/OpenAPI
  - Or simple markdown documentation
  - Document all endpoints, request/response formats

---

### 18. Error Tracking
- [ ] **Set up error tracking service** (optional but recommended)
  - Options: Sentry (free tier), LogRocket, or similar
  - Track frontend and backend errors
  - Get notified of errors in production

---

## 🟢 LOW PRIORITY (Nice to Have)

### 19. Code Quality Improvements
- [ ] **Address TODO comments in code**
  - Location: `backend/src/controllers/subscriptionController.ts` (line 95)
  - Review and complete or remove TODOs

---

### 20. Test Coverage
- [ ] **Add basic tests** (optional for now)
  - Unit tests for critical functions
  - Integration tests for API endpoints
  - Can be added incrementally after launch

---

### 21. Performance Optimization
- [ ] **Database query optimization**
  - Review slow queries
  - Add indexes where needed (most are already in place)
  - Use MongoDB explain() to analyze queries

**Current indexes look good:** User, Trade, Command, UserHistory all have appropriate indexes

---

### 22. Frontend Build Optimization
- [ ] **Optimize Next.js build**
  - Verify build output size
  - Enable compression (usually handled by reverse proxy)
  - Consider code splitting if bundle is large

---

## 📋 PRE-DEPLOYMENT VERIFICATION

Before deploying, verify:

- [ ] All critical issues above are completed
- [ ] All environment variables are set correctly
- [ ] Database is accessible and migrations are complete
- [ ] Stripe is configured with production keys
- [ ] Email service is configured and tested
- [ ] CORS is properly restricted
- [ ] HTTPS/SSL is configured
- [ ] Process manager (PM2) is configured
- [ ] Health check endpoint is accessible
- [ ] Logs are being written and rotated correctly
- [ ] Backup strategy is in place
- [ ] Monitoring is set up (at least basic)

---

## 🚀 DEPLOYMENT STEPS

1. **Backend Deployment:**
   ```bash
   cd backend
   npm install
   npm run build
   # Set production environment variables
   pm2 start ecosystem.config.js
   pm2 logs
   ```

2. **Frontend Deployment:**
   ```bash
   cd frontend
   npm install
   npm run build
   # Set production environment variables
   npm start
   # Or use PM2: pm2 start npm --name "letechs-frontend" -- start
   ```

3. **Post-Deployment:**
   - [ ] Test user registration
   - [ ] Test login
   - [ ] Test subscription purchase (use Stripe test mode first)
   - [ ] Test email sending
   - [ ] Test WebSocket connections
   - [ ] Test EA authentication
   - [ ] Monitor logs for errors
   - [ ] Check health endpoint
   - [ ] Verify all features work

---

## 📝 NOTES

- **Development vs Production:** The codebase already handles development/production differences well (rate limiting, CORS, error messages, etc.)

- **Security:** Security measures are in place:
  - ✅ Password hashing (bcrypt)
  - ✅ JWT authentication
  - ✅ Email verification required
  - ✅ Account lockout mechanism
  - ✅ Rate limiting
  - ✅ Helmet security headers
  - ✅ Input validation
  - ✅ Stripe webhook signature verification

- **Core Functionality:** All core features are implemented and working

- **Priority Order:** Fix items in order (Critical → High → Medium → Low)

---

## ✅ PROGRESS TRACKING

Use this section to track your progress:

**Completed:** 0/22 items

**Last Updated:** [Date]

**Current Status:** Pre-deployment

---

Good luck with your deployment! 🚀

