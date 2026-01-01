# Stripe Integration Setup Guide

## ✅ Integration Status: COMPLETE

All Stripe payment integration code is complete and ready for testing!

---

## 📋 Environment Variables Setup

### Backend `.env` File

Create a `.env` file in `mt5-copy-trading/backend/` with the following:

```bash
# Server Configuration
NODE_ENV=development
PORT=5000
API_URL=http://localhost:5000

# Database
MONGODB_URI=mongodb://localhost:27017/letechs-copy-trading

# Redis (Optional)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT Authentication
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d

# Stripe Payment Configuration
# Get these from: https://dashboard.stripe.com/apikeys
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...

# Webhook Secret (get from Stripe Dashboard → Webhooks)
# For local testing, use Stripe CLI (see below)
STRIPE_WEBHOOK_SECRET=whsec_...

# Frontend URL (for redirects after payment)
FRONTEND_URL=http://localhost:3000

# CORS
CORS_ORIGIN=http://localhost:3000

# Logging
LOG_LEVEL=info
```

### Frontend `.env.local` File

Create a `.env.local` file in `mt5-copy-trading/frontend/` with:

```bash
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:5000

# Stripe Publishable Key (optional - for future Stripe.js integration)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

---

## 🔑 Getting Stripe API Keys

1. Go to [https://dashboard.stripe.com/](https://dashboard.stripe.com/)
2. Sign up or log in
3. Go to **Developers → API keys**
4. Copy your **Secret key** (`sk_test_...`) and **Publishable key** (`pk_test_...`)
5. Add them to your `.env` files

---

## 🪝 Setting Up Webhooks

### Option 1: Local Testing with Stripe CLI (Recommended for Development)

1. **Install Stripe CLI:**
   ```bash
   # Windows (using Scoop)
   scoop install stripe
   
   # macOS
   brew install stripe/stripe-cli/stripe
   
   # Linux
   # Download from https://github.com/stripe/stripe-cli/releases
   ```

2. **Login to Stripe:**
   ```bash
   stripe login
   ```

3. **Forward webhooks to your local server:**
   ```bash
   stripe listen --forward-to localhost:5000/api/payment/webhook
   ```

4. **Copy the webhook signing secret** (it will look like `whsec_...`)
   - It will be displayed in the terminal output
   - Add it to your backend `.env` as `STRIPE_WEBHOOK_SECRET`

### Option 2: Production Webhook Setup

1. Go to Stripe Dashboard → **Developers → Webhooks**
2. Click **Add endpoint**
3. Enter your production URL: `https://your-domain.com/api/payment/webhook`
4. Select these events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Copy the **Signing secret** and add to your production `.env`

---

## 🧪 Testing the Integration

### 1. Start Your Servers

**Terminal 1 - Backend:**
```bash
cd mt5-copy-trading/backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd mt5-copy-trading/frontend
npm run dev
```

**Terminal 3 - Stripe CLI (for webhooks):**
```bash
stripe listen --forward-to localhost:5000/api/payment/webhook
```

### 2. Test Payment Flow

1. Go to `http://localhost:3000/dashboard/subscription`
2. Click **"Upgrade to EA License"** or **"Proceed to Checkout"**
3. Use Stripe test card: `4242 4242 4242 4242`
   - Expiry: Any future date (e.g., `12/34`)
   - CVC: Any 3 digits (e.g., `123`)
   - ZIP: Any 5 digits (e.g., `12345`)
4. Complete the checkout
5. Verify:
   - Success message appears
   - Subscription is updated in database
   - Webhook received in Stripe CLI terminal

### 3. Test Cards

**Success:**
- `4242 4242 4242 4242` - Visa
- `5555 5555 5555 4444` - Mastercard

**Decline:**
- `4000 0000 0000 0002` - Card declined
- `4000 0000 0000 9995` - Insufficient funds

**3D Secure:**
- `4000 0025 0000 3155` - Requires authentication

---

## ✅ Features Implemented

### 1. **Dynamic Pricing**
- ✅ Custom amounts per user based on discounts
- ✅ Monthly and yearly billing cycles
- ✅ Automatic discount application (client discounts, special discounts)

### 2. **Checkout Sessions**
- ✅ Tier upgrades (EA License, Full Access)
- ✅ Add-ons purchase (masters, slaves)
- ✅ Success/cancel redirects
- ✅ Metadata tracking

### 3. **Webhook Handling**
- ✅ Signature verification
- ✅ Subscription activation
- ✅ Renewal date updates
- ✅ Payment success/failure handling
- ✅ Subscription cancellation

### 4. **Customer Portal**
- ✅ Self-service subscription management
- ✅ Payment method updates
- ✅ Invoice viewing
- ✅ Subscription cancellation

### 5. **Subscription Management**
- ✅ Automatic tier updates
- ✅ Renewal date tracking
- ✅ Stripe customer/subscription ID storage
- ✅ History logging

---

## 🔒 Security Features

- ✅ Webhook signature verification
- ✅ Environment variable validation
- ✅ Authentication required for all endpoints
- ✅ Error handling doesn't leak sensitive data
- ✅ Payment code isolated from business logic

---

## 📝 Important Notes

1. **Dynamic Pricing**: The system uses `price_data` instead of fixed Price IDs, allowing custom amounts per checkout session. This means you don't need to create Price IDs in Stripe for every discount combination.

2. **Billing Cycles**: 
   - Monthly: EA License $29/month, Full Access $99/month
   - Yearly: EA License $299/year (save 14%), Full Access $999/year (save 16%)

3. **Webhook Events**: The system handles:
   - `checkout.session.completed` - Initial subscription activation
   - `invoice.payment_succeeded` - Renewal payments
   - `customer.subscription.updated` - Subscription changes
   - `customer.subscription.deleted` - Cancellations

4. **Renewal Dates**: Automatically calculated from Stripe subscription periods and updated in the database.

---

## 🚀 Production Checklist

Before going live:

- [ ] Switch to production Stripe keys (`sk_live_...`)
- [ ] Set `NODE_ENV=production`
- [ ] Set strong `JWT_SECRET`
- [ ] Configure production webhook endpoint in Stripe Dashboard
- [ ] Set `FRONTEND_URL` to your production domain
- [ ] Enable HTTPS
- [ ] Test all payment flows
- [ ] Set up monitoring/alerts
- [ ] Review Stripe dashboard settings

---

## 🐛 Troubleshooting

### Webhook Not Received

1. Check Stripe CLI is running: `stripe listen --forward-to localhost:5000/api/payment/webhook`
2. Verify webhook secret in `.env` matches CLI output
3. Check backend logs for errors
4. Verify webhook endpoint is accessible

### Payment Succeeds But Subscription Not Updated

1. Check webhook was received (Stripe CLI terminal)
2. Check backend logs for webhook processing errors
3. Verify user has `stripeCustomerId` set
4. Check database for subscription updates

### Signature Verification Fails

1. Ensure `STRIPE_WEBHOOK_SECRET` is set correctly
2. Verify webhook route uses `express.raw()` middleware (already configured)
3. Check webhook secret matches Stripe Dashboard or CLI output

---

## 📚 Additional Resources

- [Stripe API Documentation](https://stripe.com/docs/api)
- [Stripe Webhooks Guide](https://stripe.com/docs/webhooks)
- [Stripe Testing](https://stripe.com/docs/testing)
- [Stripe CLI Documentation](https://stripe.com/docs/stripe-cli)

---

**Status**: ✅ **READY FOR TESTING**

All code is complete. Follow the setup steps above to start testing!

