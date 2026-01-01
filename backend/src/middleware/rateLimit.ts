import rateLimit from 'express-rate-limit';
import { config } from '../config/env';

// In development, we disable all rate limiting (temporary per user request)
const isDevelopment = config.nodeEnv === 'development';

// General API rate limiter
export const apiLimiter = rateLimit({
  // Disabled in development
  windowMs: 15 * 60 * 1000,
  max: isDevelopment ? Number.MAX_SAFE_INTEGER : 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDevelopment, // disable entirely in dev
});

// Strict rate limiter for auth endpoints
export const authLimiter = rateLimit({
  // Disabled in development
  windowMs: isDevelopment ? 60 * 1000 : 15 * 60 * 1000,
  max: isDevelopment ? Number.MAX_SAFE_INTEGER : 5,
  message: 'Too many authentication attempts, please try again later.',
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDevelopment,
});

// EA endpoints rate limiter (higher limit)
export const eaLimiter = rateLimit({
  // Disabled in development
  windowMs: 60 * 1000,
  max: isDevelopment ? Number.MAX_SAFE_INTEGER : 600, // raise in prod too
  message: 'Too many requests from EA, please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDevelopment,
});

// Command creation rate limiter
export const commandLimiter = rateLimit({
  // Disabled in development
  windowMs: 60 * 1000,
  max: isDevelopment ? Number.MAX_SAFE_INTEGER : 120,
  message: 'Too many commands created, please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDevelopment,
});

