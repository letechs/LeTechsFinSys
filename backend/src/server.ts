// Immediate console output - this runs before any imports
console.log('🚀 [SERVER] Starting server initialization...');
console.log('🚀 [SERVER] Node version:', process.version);
console.log('🚀 [SERVER] NODE_ENV:', process.env.NODE_ENV || 'not set');
console.log('🚀 [SERVER] PORT:', process.env.PORT || 'not set');

// Import type definitions first (side-effect import for type augmentation)
import './types/express';

import http from 'http';

// Check Node version before starting (Node 20 has TLS bug with Stripe on Windows)
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.split('.')[0].substring(1));
if (majorVersion === 20) {
  console.error('');
  console.error('⚠️  WARNING: Node.js 20.x detected!');
  console.error('   Node 20 has a TLS bug that breaks Stripe authentication on Windows.');
  console.error('   Please install Node.js 18 LTS: https://nodejs.org/dist/v18.19.1/node-v18.19.1-x64.msi');
  console.error('   Current version:', nodeVersion);
  console.error('');
  console.error('   The backend will start, but Stripe API calls will fail.');
  console.error('');
}

console.log('🚀 [SERVER] Starting module imports...');

import app from './app';
console.log('🚀 [SERVER] App imported');

import { config } from './config/env';
console.log('🚀 [SERVER] Config imported');

import { connectDatabase } from './config/database';
console.log('🚀 [SERVER] Database imported');

import { connectRedis } from './config/redis';
console.log('🚀 [SERVER] Redis imported');

import { logger } from './utils/logger';
console.log('🚀 [SERVER] Logger imported');

import { webSocketService } from './services/realtime/websocketService';
console.log('🚀 [SERVER] WebSocket service imported');

import { accountStatusMonitor } from './services/mt5/accountStatusMonitor';
console.log('🚀 [SERVER] Account status monitor imported');

import mongoose from 'mongoose';
console.log('🚀 [SERVER] Mongoose imported');
console.log('🚀 [SERVER] All imports successful');

// Use Railway's PORT directly (required for Railway to detect the server)
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : config.port;
console.log(`🚀 [SERVER] Starting server on port ${PORT}`);

// Log startup info
logger.info('🚀 Starting server...');
logger.info(`📝 Environment: ${config.nodeEnv}`);
logger.info(`🔌 Port: ${PORT}`);
logger.info(`🌐 API URL: ${config.apiUrl}`);

// Create HTTP server with MINIMAL health check handler FIRST
// This responds INSTANTLY before Express app is even touched
// Railway health checks happen within 3 seconds - must respond immediately
const httpServer = http.createServer((req, res) => {
  // Log ALL incoming requests immediately
  const method = req.method || 'UNKNOWN';
  const url = req.url || '/';
  console.log(`📥 [HTTP] ${method} ${url} - Incoming request`);
  
  // CRITICAL: Handle health checks IMMEDIATELY - no Express, no middleware, no blocking
  const urlPath = url.split('?')[0];
  if (urlPath === '/' || urlPath === '/health') {
    try {
      res.writeHead(200, { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      });
      res.end(JSON.stringify({ status: 'ok', time: new Date().toISOString() }));
      console.log(`✅ [HEALTH] ${method} ${url} → 200 OK (Railway health check passed)`);
      return; // CRITICAL: Return immediately, don't pass to Express
    } catch (error: any) {
      console.error(`❌ [HEALTH] Error:`, error);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Health check error');
      }
      return;
    }
  }
  
  // For all other routes, delegate to Express app
  app(req, res);
});

// Add error handlers to catch any server errors
httpServer.on('error', (error: any) => {
  console.error(`❌ [SERVER] HTTP Server error:`, error);
  logger.error('❌ HTTP Server error:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ [SERVER] Port ${PORT} is already in use.`);
    logger.error(`Port ${PORT} is already in use. Please use a different port.`);
    process.exit(1);
  }
});

httpServer.on('clientError', (error: any, socket: any) => {
  console.error(`❌ [SERVER] Client error:`, error.message);
  socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

// Start server IMMEDIATELY - this keeps the event loop alive
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 [SERVER] Server successfully bound to port ${PORT}`);
  console.log(`✅ [SERVER] Health check ready - Railway can now verify the service`);
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`📝 Environment: ${config.nodeEnv}`);
  logger.info(`🌐 API URL: ${config.apiUrl}`);
  logger.info(`✅ Server is alive - Railway health check will pass`);
  
  // DEFER ALL HEAVY SERVICES - Initialize after server is bound
  // This ensures Railway sees the server is alive immediately
  // Note: Routes are already loaded synchronously in app.ts (after health endpoints)
  setImmediate(async () => {
    try {
      // Initialize WebSocket server
      logger.info('🔌 Initializing WebSocket server...');
      webSocketService.initialize(httpServer);
      logger.info('🟢 WebSocket server ready');

      // Start account status monitor
      logger.info('🔍 Starting account status monitor...');
      accountStatusMonitor.start();
      logger.info('🟢 Account status monitor started');

      // Connect to database (non-blocking for Railway health check)
      logger.info('📦 Connecting to MongoDB (background)...');
      await connectDatabase();
      logger.info('🟢 MongoDB connected successfully');

      // Connect to Redis (optional - won't crash if it fails)
      try {
        await connectRedis();
        logger.info('🟢 Redis connected successfully');
      } catch (error) {
        // Redis connection failed, but continue anyway (Redis is optional)
        logger.warn('⚠️  Redis connection failed (optional service)');
      }

      logger.info(`✅ All background services initialized - server fully ready`);
    } catch (error: any) {
      logger.error('❌ Background service initialization failed:', error);
      logger.error('Error details:', {
        message: error.message,
        code: error.code,
        name: error.name,
        stack: error.stack,
      });
      
      // Don't exit - let server run so Railway doesn't kill it
      // Individual services will handle their own errors
      if (error.message?.includes('MongoDB')) {
        if (config.nodeEnv === 'production') {
          logger.error('❌ MongoDB connection failed in production.');
          logger.error('Please ensure MONGODB_URI is set correctly in Railway environment variables.');
          logger.error('Current MONGODB_URI:', config.mongodbUri ? 'SET (but connection failed)' : 'NOT SET');
          logger.error('⚠️  Server will continue running but database features will not work.');
        } else {
          logger.warn('⚠️  MongoDB connection failed. Server will start but database features will not work.');
          logger.warn('💡 To fix: Install MongoDB or use MongoDB Atlas (free): https://www.mongodb.com/cloud/atlas');
          logger.warn('   Or set MONGODB_URI in .env file to your MongoDB connection string');
        }
      }
    }
  });
});

// Graceful shutdown handlers
process.on('SIGTERM', () => {
  console.log('🛑 [SERVER] SIGTERM received — shutting down gracefully');
  logger.info('SIGTERM received — shutting down gracefully');
  httpServer.close(() => {
    console.log('✅ [SERVER] HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 [SERVER] SIGINT received — shutting down gracefully');
  logger.info('SIGINT received — shutting down gracefully');
  httpServer.close(() => {
    console.log('✅ [SERVER] HTTP server closed');
    process.exit(0);
  });
});

// Catch unhandled errors (but don't exit - let server continue)
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('❌ [PROCESS] Unhandled Promise Rejection:', reason);
  logger.error('Unhandled Promise Rejection:', reason);
  // Don't exit - let server continue running
});

process.on('uncaughtException', (error: Error) => {
  console.error('❌ [PROCESS] Uncaught Exception:', error);
  console.error('❌ [PROCESS] Stack:', error.stack);
  logger.error('Uncaught Exception:', error);
  // Don't exit - let server continue running (Railway will restart if needed)
});

