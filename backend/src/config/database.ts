import mongoose, { ConnectionStates } from 'mongoose';
import { config } from './env';
import { logger } from '../utils/logger';
import { HistoryService } from '../services/history/historyService';

export const connectDatabase = async (): Promise<void> => {
  try {
    const options = {
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
      socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
      // Connection pool settings (optimized for production)
      maxPoolSize: 10, // Maximum number of connections in the pool
      minPoolSize: 2, // Minimum number of connections to maintain
      maxIdleTimeMS: 30000, // Close connections after 30s of inactivity
      // Mongoose 6+ automatically reconnects, but we can configure retry behavior
      retryWrites: true,
      retryReads: true,
    };

    await mongoose.connect(config.mongodbUri, options);
    logger.info('✅ MongoDB connected successfully');
  } catch (error: any) {
    logger.error('❌ MongoDB connection error:', error);
    
    // Provide helpful error message
    if (error.message?.includes('ECONNREFUSED')) {
      logger.error('💡 MongoDB is not running. Please start MongoDB service.');
      logger.error('   On Windows: net start MongoDB');
      logger.error('   Or install MongoDB: https://www.mongodb.com/try/download/community');
    }
    
    throw error; // Re-throw to let the caller handle it
  }
};

// Handle connection events
mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected - attempting to reconnect...');
  // Mongoose will automatically attempt to reconnect
});

mongoose.connection.on('error', (error) => {
  logger.error('MongoDB error:', error);
});

mongoose.connection.on('reconnected', () => {
  logger.info('✅ MongoDB reconnected successfully');
});

mongoose.connection.on('connecting', () => {
  logger.info('🔄 MongoDB connecting...');
});

mongoose.connection.on('connected', () => {
  logger.info('✅ MongoDB connected');
});

/**
 * Wait for MongoDB connection to be ready
 * @param maxWaitMs Maximum time to wait in milliseconds (default: 5000ms)
 * @returns Promise that resolves when connected, or rejects if timeout
 */
export const waitForConnection = async (maxWaitMs: number = 5000): Promise<void> => {
  // Check if already connected
  const isConnected = (): boolean => {
    return mongoose.connection.readyState === ConnectionStates.connected;
  };

  if (isConnected()) {
    return; // Already connected
  }

  const startTime = Date.now();
  const checkInterval = 500; // Check every 500ms
  const maxAttempts = Math.ceil(maxWaitMs / checkInterval);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (isConnected()) {
      return; // Connected
    }
    
    if (Date.now() - startTime >= maxWaitMs) {
      throw new Error('MongoDB connection timeout - database is not available');
    }
    
    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }

  throw new Error('MongoDB connection timeout - database is not available');
};

// Note: Graceful shutdown is handled in server.ts
// Do NOT add process.exit() here - it will cause premature shutdown

