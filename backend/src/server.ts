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
    // Connect to database
    try {
      await connectDatabase();
    } catch (error: any) {
      if (config.nodeEnv === 'production') {
        logger.error('Failed to connect to MongoDB. Server cannot start without database in production.');
        logger.error('Please ensure MongoDB is running and accessible.');
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
    httpServer.listen(config.port, () => {
      logger.info(`🚀 Server running on port ${config.port}`);
      logger.info(`📝 Environment: ${config.nodeEnv}`);
      logger.info(`🌐 API URL: ${config.apiUrl}`);
      logger.info(`🔌 WebSocket server initialized`);
      if (config.nodeEnv !== 'production') {
        if (!mongoose.connection.readyState) {
          logger.warn('⚠️  MongoDB is not connected. Some features may not work.');
        }
      }
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

