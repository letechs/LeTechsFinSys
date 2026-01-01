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

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down gracefully...');
  
  // Flush any pending history entries before shutdown
  try {
    await HistoryService.flushPendingEntries();
    logger.info('Pending history entries flushed');
  } catch (error) {
    logger.error('Error flushing history entries:', error);
  }
  
  await mongoose.connection.close();
  logger.info('MongoDB connection closed due to app termination');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down gracefully (SIGTERM)...');
  
  // Flush any pending history entries before shutdown
  try {
    await HistoryService.flushPendingEntries();
    logger.info('Pending history entries flushed');
  } catch (error) {
    logger.error('Error flushing history entries:', error);
  }
  
  await mongoose.connection.close();
  logger.info('MongoDB connection closed due to app termination');
  process.exit(0);
});

