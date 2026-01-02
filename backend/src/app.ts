// Import type definitions first
import './types/express';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/env';
import { logger } from './utils/logger';

const app = express();

// CRITICAL: Health check endpoints MUST be FIRST (before any middleware)
// Railway health checks need immediate response without going through middleware
app.get('/', (req, res) => {
  console.log(`✅ [HEALTH] GET / → 200 OK (Railway health check)`);
  res.status(200).send('OK');
});

app.get('/health', (req, res) => {
  console.log(`✅ [HEALTH] GET /health → 200 OK (Railway health check)`);
  res.status(200).json({ 
    status: 'ok', 
    time: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Trust proxy (important when behind reverse proxy like Nginx/Apache)
// This allows req.ip, req.protocol, req.hostname to work correctly
// Set to 1 in production to trust first proxy (reverse proxy)
if (config.nodeEnv === 'production') {
  app.set('trust proxy', 1); // Trust first proxy (Nginx/Apache)
  logger.info('Trust proxy enabled for production (reverse proxy support)');
}

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// CORS configuration
// Development: Allow all origins for easier local development
// Production: Strictly restrict to configured CORS_ORIGIN (single origin only)
const isDevelopment = config.nodeEnv === 'development';

const corsOptions = isDevelopment
  ? {
      origin: true, // Allow all origins in development
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'X-EA-Token'],
      exposedHeaders: ['Content-Length'],
      preflightContinue: false,
      optionsSuccessStatus: 204,
    }
  : {
      // Production: Use single origin from config (strict CORS)
      origin: config.corsOrigin,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'X-EA-Token'],
      exposedHeaders: ['Content-Length'],
      preflightContinue: false,
      optionsSuccessStatus: 204,
    };

// Log CORS configuration on startup
if (!isDevelopment) {
  logger.info(`CORS configured for production: ${config.corsOrigin}`);
} else {
  logger.debug('CORS configured for development: allowing all origins');
}

app.use(cors(corsOptions));

// Stripe webhook route - must be before JSON body parser
// Stripe webhooks need raw body for signature verification
app.post(
  '/api/payment/webhook',
  express.raw({ type: 'application/json' }),
  (req, res, next) => {
    logger.debug('Stripe webhook route hit', {
      method: req.method,
      path: req.path,
      hasSignature: !!req.headers['stripe-signature'],
      bodyType: typeof req.body,
      bodyIsBuffer: Buffer.isBuffer(req.body),
      bodyLength: req.body?.length || 0,
    });
    // Import payment controller here to avoid circular dependencies
    const { paymentController } = require('./controllers/paymentController');
    paymentController.handleWebhook(req, res, next);
  }
);

// Body parsing middleware with error handling
app.use(express.json({
  strict: false, // Allow non-strict JSON
  limit: '10mb', // Increase limit for heartbeat data
  verify: (req: any, res: any, buf: Buffer) => {
    // Body verification (no logging)
  },
}));
app.use(express.urlencoded({ extended: true }));

// Add error handler for JSON parsing errors
app.use((err: any, req: any, res: any, next: any) => {
    if (err instanceof SyntaxError && 'body' in err) {
      // Don't block EA routes even if JSON is weird - let them through with empty body
      if (req.path && req.path.startsWith('/api/ea/')) {
        (req as any).body = {};  // Set empty body and continue
        return next();
      }
    
    // For other routes, return proper error response
    return res.status(400).json({
      success: false,
      message: 'Invalid JSON in request body',
      error: err.message,
    });
  }
  next(err);
});

// Request logging - log ALL requests to debug Railway health checks
app.use((req, res, next) => {
  console.log(`📥 [REQUEST] ${req.method} ${req.url}`);
  next();
});

// Root endpoint (detailed) - after middleware for full API info
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'MT5 Copy Trading API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      api: '/api',
      auth: '/api/auth',
      users: '/api/users',
      subscriptions: '/api/subscriptions',
      mt5: '/api/mt5',
      commands: '/api/commands',
      webhooks: '/api/webhooks',
    },
  });
});

// Test EA endpoint (no auth required for testing)
app.post('/test-ea', (req, res) => {
  logger.debug('EA test endpoint called', {
    hasToken: !!req.headers['x-ea-token'],
    token: req.headers['x-ea-token'] ? `${(req.headers['x-ea-token'] as string).substring(0, 8)}...` : 'none',
  });
  res.json({
    success: true,
    message: 'Backend is receiving requests',
    timestamp: new Date().toISOString(),
    receivedToken: req.headers['x-ea-token'] ? `${(req.headers['x-ea-token'] as string).substring(0, 8)}...` : 'none',
  });
});

// Load routes synchronously - they need to be available immediately for API requests
// Health endpoints are already defined first, so Railway health checks will work
import routes from './routes';
app.use('/api', routes);
console.log('✅ [APP] Routes loaded');

// Import error handlers
import { notFoundHandler, errorHandler } from './middleware/errorHandler';

// 404 handler (must be after all routes)
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

export default app;

