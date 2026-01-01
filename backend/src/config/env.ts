import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Server
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  apiUrl: process.env.API_URL || 'http://localhost:5000',

  // Database
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/letechs-copy-trading',

  // Redis
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  // JWT
  jwt: {
    secret: (() => {
      const secret = process.env.JWT_SECRET;
      if (!secret) {
        if (process.env.NODE_ENV === 'production') {
          throw new Error('JWT_SECRET is required in production environment');
        }
        console.warn('⚠️  WARNING: JWT_SECRET not set. Using default for development only.');
        return 'dev-secret-change-in-production-do-not-use-in-production';
      }
      return secret;
    })(),
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  // Stripe
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
  },

  // CORS
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',

  // Email (SMTP)
  email: {
    smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
    smtpPort: parseInt(process.env.SMTP_PORT || '587', 10),
    smtpUser: process.env.SMTP_USER || process.env.SMTP_EMAIL,
    smtpPassword: process.env.SMTP_PASSWORD || process.env.SMTP_APP_PASSWORD,
    smtpFromEmail: process.env.SMTP_FROM_EMAIL || process.env.SMTP_EMAIL || 'noreply@letechs.com',
    smtpFromName: process.env.SMTP_FROM_NAME || 'LeTechs Copy Trading',
  },

  // Frontend URL (for email links)
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
};

// Validate required environment variables
const requiredEnvVars: Record<string, string[]> = {
  development: ['JWT_SECRET'],
  production: ['JWT_SECRET', 'MONGODB_URI', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
  test: ['JWT_SECRET', 'MONGODB_URI'],
};

const env = config.nodeEnv || 'development';
const required = requiredEnvVars[env] || requiredEnvVars.development;

const missing = required.filter(envVar => !process.env[envVar]);

if (missing.length > 0) {
  const errorMsg = `Missing required environment variables for ${env}: ${missing.join(', ')}`;
  if (env === 'production') {
    throw new Error(errorMsg);
  }
  console.warn(`⚠️  WARNING: ${errorMsg}`);
}

