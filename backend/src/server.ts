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

import app from './app';
import { config } from './config/env';
import { connectDatabase } from './config/database';
import { connectRedis } from './config/redis';
import { logger } from './utils/logger';
import { webSocketService } from './services/realtime/websocketService';
import { accountStatusMonitor } from './services/mt5/accountStatusMonitor';
import mongoose from 'mongoose';

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

    // Start server
    httpServer.listen(config.port, '0.0.0.0', () => {
      logger.info(`🚀 Server running on port ${config.port}`);
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
      logger.error('❌ HTTP Server error:', error);
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${config.port} is already in use. Please use a different port.`);
      }
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

