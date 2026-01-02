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

const startServer = async () => {
  try {
    // Log startup info immediately
    logger.info('🚀 Starting server...');
    logger.info(`📝 Environment: ${config.nodeEnv}`);
    logger.info(`🔌 Port: ${config.port}`);
    logger.info(`🌐 API URL: ${config.apiUrl}`);
    
    // Connect to database
    try {
      logger.info('📦 Connecting to MongoDB...');
      await connectDatabase();
    } catch (error: any) {
      logger.error('❌ MongoDB connection failed:', error);
      logger.error('Error details:', {
        message: error.message,
        code: error.code,
        name: error.name,
      });
      
      if (config.nodeEnv === 'production') {
        logger.error('❌ Server cannot start without database in production.');
        logger.error('Please ensure MONGODB_URI is set correctly in Railway environment variables.');
        logger.error('Current MONGODB_URI:', config.mongodbUri ? 'SET (but connection failed)' : 'NOT SET');
        
        // Give logger time to flush before exiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        process.exit(1);
      } else {
        logger.warn('⚠️  MongoDB connection failed. Server will start but database features will not work.');
        logger.warn('💡 To fix: Install MongoDB or use MongoDB Atlas (free): https://www.mongodb.com/cloud/atlas');
        logger.warn('   Or set MONGODB_URI in .env file to your MongoDB connection string');
      }
    }

    // Connect to Redis (optional - won't crash if it fails)
    try {
      await connectRedis();
    } catch (error) {
      // Redis connection failed, but continue anyway (Redis is optional)
      // Silently continue - no warning needed
    }

    // Create HTTP server
    const httpServer = http.createServer(app);

    // Initialize WebSocket server
    webSocketService.initialize(httpServer);

    // Start account status monitor (checks for stale accounts and emits offline updates)
    accountStatusMonitor.start();

    // Use Railway's PORT directly (required for Railway to detect the server)
    const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : config.port;
    console.log(`🚀 [SERVER] Binding to port ${PORT} (from ${process.env.PORT ? 'process.env.PORT' : 'config.port'})`);
    
    // Start server - MUST bind to 0.0.0.0 for Railway
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 [SERVER] Server successfully bound to port ${PORT}`);
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`📝 Environment: ${config.nodeEnv}`);
      logger.info(`🌐 API URL: ${config.apiUrl}`);
      logger.info(`🔌 WebSocket server initialized`);
      logger.info(`✅ Server startup complete - ready to accept connections`);
      if (config.nodeEnv !== 'production') {
        if (!mongoose.connection.readyState) {
          logger.warn('⚠️  MongoDB is not connected. Some features may not work.');
        }
      }
    });
    
    // Handle server errors
    httpServer.on('error', (error: any) => {
      console.error(`❌ [SERVER] HTTP Server error:`, error);
      logger.error('❌ HTTP Server error:', error);
      if (error.code === 'EADDRINUSE') {
        const port = process.env.PORT || config.port;
        console.error(`❌ [SERVER] Port ${port} is already in use.`);
        logger.error(`Port ${port} is already in use. Please use a different port.`);
      }
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Wrap startup in try-catch to catch any import errors
try {
  startServer().catch((error) => {
    console.error('❌ [SERVER] Unhandled error in startServer:', error);
    console.error('❌ [SERVER] Error stack:', error.stack);
    process.exit(1);
  });
} catch (error: any) {
  console.error('❌ [SERVER] Fatal error during startup:', error);
  console.error('❌ [SERVER] Error message:', error.message);
  console.error('❌ [SERVER] Error stack:', error.stack);
  process.exit(1);
}

