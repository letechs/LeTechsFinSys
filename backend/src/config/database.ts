import mongoose from 'mongoose';
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
  logger.warn('MongoDB disconnected');
});

mongoose.connection.on('error', (error) => {
  logger.error('MongoDB error:', error);
});

// Note: Graceful shutdown is handled in server.ts
// Do NOT add process.exit() here - it will cause premature shutdown

