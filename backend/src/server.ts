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
  // Log ALL incoming requests immediately with timestamp
  const method = req.method || 'UNKNOWN';
  const url = req.url || '/';
  const timestamp = new Date().toISOString();
  const remoteAddress = req.socket.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';
  console.log(`📥 [HTTP] ${timestamp} ${method} ${url} - Incoming request from ${remoteAddress} (${userAgent.substring(0, 50)})`);
  
  // CRITICAL: Handle health checks IMMEDIATELY - no Express, no middleware, no blocking
  // Railway requires instant response - use plain text for fastest response
  // Railway health checks come from healthcheck.railway.app - must allow all origins
  const urlPath = url.split('?')[0];
  if (urlPath === '/' || urlPath === '/health') {
    // Respond instantly with plain text - Railway just needs 200 OK
    const healthCheckStart = Date.now();
    try {
      // Allow all origins for health checks (Railway uses healthcheck.railway.app)
      const headers: { [key: string]: string } = {
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*', // Allow Railway health checks from any origin
      };
      
      res.writeHead(200, headers);
      res.end('OK');
      const responseTime = Date.now() - healthCheckStart;
      console.log(`✅ [HEALTH] ${timestamp} ${method} ${url} → 200 OK (${responseTime}ms) - Railway health check passed from ${remoteAddress}`);
    } catch (error: any) {
      console.error(`❌ [HEALTH] ${timestamp} Error responding:`, error);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Health check error');
      }
    }
    return; // CRITICAL: Return immediately, don't pass to Express
  }
  
  // For all other routes, delegate to Express app
  try {
    app(req, res);
  } catch (error: any) {
    console.error(`❌ [HTTP] Error handling request ${method} ${url}:`, error);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    }
  }
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

// Track connection lifecycle for debugging
httpServer.on('connection', (socket: any) => {
  const remoteAddress = socket.remoteAddress || 'unknown';
  console.log(`🔌 [SERVER] New connection from ${remoteAddress}`);
  socket.on('close', () => {
    console.log(`🔌 [SERVER] Connection closed from ${remoteAddress}`);
  });
});

// Start server IMMEDIATELY - this keeps the event loop alive
// Note: server.listen() makes the server ready to accept connections immediately
// Railway can start health checking as soon as this is called
// CRITICAL: Bind to '::' (IPv6) which also accepts IPv4 connections on Railway
// Railway's health checks may come over IPv6, and binding to '0.0.0.0' only might fail
httpServer.listen(PORT, '::', () => {
  const readyTime = new Date().toISOString();
  console.log(`🚀 [SERVER] ${readyTime} - Server successfully bound to port ${PORT} on IPv6 (::) - accepts both IPv4 and IPv6`);
  console.log(`✅ [SERVER] ${readyTime} - Health check ready - Railway can now verify the service`);
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`📝 Environment: ${config.nodeEnv}`);
  logger.info(`🌐 API URL: ${config.apiUrl}`);
  logger.info(`✅ Server is alive - Railway health check will pass`);
  
  // Log that we're ready for health checks
  console.log(`📊 [SERVER] Server is now listening and ready for health checks`);
  console.log(`📊 [SERVER] Health check endpoint: http://[::]:${PORT}/health (also accessible via IPv4)`);
  console.log(`📊 [SERVER] Root endpoint: http://[::]:${PORT}/ (also accessible via IPv4)`);
  
  // Keep process alive - log every 10 seconds to show we're still running
  const keepAliveInterval = setInterval(() => {
    console.log(`💓 [SERVER] ${new Date().toISOString()} - Server is alive and running`);
  }, 10000);
  
  // Store interval reference for cleanup
  (global as any).keepAliveInterval = keepAliveInterval;
  
  // DEFER ALL HEAVY SERVICES - Initialize after server is bound
  // This ensures Railway sees the server is alive immediately
  // Note: Routes are already loaded synchronously in app.ts (after health endpoints)
  // CRITICAL: Wrap in try-catch to prevent unhandled rejections from killing the process
  (async () => {
    try {
      // Small delay to ensure server is fully ready
      await new Promise(resolve => setTimeout(resolve, 100));
      
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
      // CRITICAL: Never exit on background service errors - just log them
      // The server must continue running even if services fail
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
      
      // Explicitly prevent process exit - server must stay alive
      logger.info('🔄 Server will continue running despite background service errors');
    }
  })().catch((error) => {
    // CRITICAL: Catch any unhandled rejections from the async IIFE
    // This prevents the process from exiting due to unhandled promise rejections
    logger.error('❌ Unhandled rejection in background service initialization:', error);
    logger.error('🔄 Server will continue running - this error is non-fatal');
  });
});

// CRITICAL: Track process exit to debug premature shutdowns
// Register this FIRST, before anything else
process.on('exit', (code) => {
  console.log(`🔥 [PROCESS] PROCESS EXITED WITH CODE ${code} at ${new Date().toISOString()}`);
  // Stack trace might not be available in exit handler, but try
  try {
    console.log(`🔥 [PROCESS] Exit stack trace:`, new Error().stack);
  } catch (e) {
    console.log(`🔥 [PROCESS] Could not get stack trace`);
  }
});

// Note: uncaughtException and unhandledRejection handlers are registered later
// to avoid duplicate handlers

// Graceful shutdown handlers - ONLY in server.ts (removed duplicates from database.ts and redis.ts)
let isShuttingDown = false;

const gracefulShutdown = async (signal: string) => {
  if (isShuttingDown) {
    console.log(`🛑 [SERVER] ${new Date().toISOString()} - ${signal} received again (already shutting down)`);
    return;
  }
  isShuttingDown = true;
  const shutdownTime = new Date().toISOString();
  console.log(`🛑 [SERVER] ${shutdownTime} - ${signal} received — shutting down gracefully`);
  console.log(`🛑 [SERVER] ${shutdownTime} - Active connections: ${(httpServer as any)._connections || 'unknown'}`);
  logger.info(`${signal} received — shutting down gracefully`);
  
  // Clear the keep-alive interval
  if ((global as any).keepAliveInterval) {
    clearInterval((global as any).keepAliveInterval);
    console.log(`🛑 [SERVER] ${shutdownTime} - Cleared keep-alive interval`);
  }
  
  // Close MongoDB connection
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log(`🛑 [SERVER] ${shutdownTime} - MongoDB connection closed`);
    }
  } catch (error: any) {
    console.error(`❌ [SERVER] Error closing MongoDB:`, error.message);
  }
  
  // Close Redis connection
  try {
    const { redisClient } = require('./config/redis');
    if (redisClient && redisClient.isOpen) {
      await redisClient.quit();
      console.log(`🛑 [SERVER] ${shutdownTime} - Redis connection closed`);
    }
  } catch (error: any) {
    console.error(`❌ [SERVER] Error closing Redis:`, error.message);
  }
  
  // Close HTTP server
  httpServer.close(() => {
    console.log(`✅ [SERVER] ${new Date().toISOString()} - HTTP server closed`);
    process.exit(0);
  });
  
  // Force exit after 10 seconds if server doesn't close
  setTimeout(() => {
    console.log(`⚠️ [SERVER] ${new Date().toISOString()} - Forcing exit after 10 seconds`);
    process.exit(0);
  }, 10000);
};

// Register signal handlers IMMEDIATELY - before server starts
// This must be at module level, not inside a function
console.log(`🔧 [SERVER] Registering signal handlers at ${new Date().toISOString()}...`);

const sigtermHandler = () => {
  const timestamp = new Date().toISOString();
  console.log(`🔧 [SERVER] ${timestamp} - SIGTERM handler TRIGGERED (raw signal received)`);
  console.log(`🔧 [SERVER] ${timestamp} - Calling gracefulShutdown('SIGTERM')...`);
  gracefulShutdown('SIGTERM').catch((error) => {
    console.error(`❌ [SERVER] Error in graceful shutdown:`, error);
    process.exit(1);
  });
};

const sigintHandler = () => {
  const timestamp = new Date().toISOString();
  console.log(`🔧 [SERVER] ${timestamp} - SIGINT handler TRIGGERED (raw signal received)`);
  console.log(`🔧 [SERVER] ${timestamp} - Calling gracefulShutdown('SIGINT')...`);
  gracefulShutdown('SIGINT').catch((error) => {
    console.error(`❌ [SERVER] Error in graceful shutdown:`, error);
    process.exit(1);
  });
};

process.on('SIGTERM', sigtermHandler);
process.on('SIGINT', sigintHandler);
console.log(`✅ [SERVER] Signal handlers registered at ${new Date().toISOString()}`);

// CRITICAL: Catch unhandled errors (but don't exit - let server continue)
// These handlers prevent the process from exiting due to unhandled errors
// Only register once to avoid duplicate handlers
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  const timestamp = new Date().toISOString();
  console.error(`🔥 [PROCESS] ${timestamp} - UNHANDLED REJECTION:`, reason);
  console.error(`🔥 [PROCESS] ${timestamp} - Promise:`, promise);
  logger.error('Unhandled Promise Rejection:', reason);
  // CRITICAL: Don't exit - let server continue running
  // Railway will restart if needed, but we don't want to exit on every error
});

process.on('uncaughtException', (error: Error) => {
  const timestamp = new Date().toISOString();
  console.error(`🔥 [PROCESS] ${timestamp} - UNCAUGHT EXCEPTION:`, error);
  console.error(`🔥 [PROCESS] ${timestamp} - Stack:`, error.stack);
  logger.error('Uncaught Exception:', error);
  // CRITICAL: Don't exit - let server continue running (Railway will restart if needed)
  // Exiting on uncaught exceptions can cause Railway to restart the container repeatedly
});

