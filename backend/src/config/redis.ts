import { createClient } from 'redis';
import { config } from './env';
import { logger } from '../utils/logger';

const redisConfig = {
  socket: {
    host: config.redis.host,
    port: config.redis.port,
    connectTimeout: 5000, // 5 second timeout
  },
  password: config.redis.password,
  // Disable automatic reconnection to prevent error spam
  reconnectStrategy: (): false => false,
};

export const redisClient = createClient(redisConfig);

let redisConnected = false;
let redisErrorLogged = false;

redisClient.on('error', (err) => {
  // Only log error once to avoid spam
  if (!redisErrorLogged) {
    redisErrorLogged = true;
    if (config.nodeEnv === 'production') {
      logger.error('Redis Client Error:', err);
    } else {
      logger.warn('⚠️  Redis connection error (Redis is optional):', err.message || err);
    }
  }
});

redisClient.on('connect', () => {
  logger.info('✅ Redis connecting...');
});

redisClient.on('ready', () => {
  redisConnected = true;
  logger.info('✅ Redis connected successfully');
});

export const connectRedis = async (): Promise<void> => {
  try {
    // Set a timeout for connection attempt
    const connectPromise = redisClient.connect();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Connection timeout')), 5000)
    );
    
    await Promise.race([connectPromise, timeoutPromise]);
  } catch (error: any) {
    // Remove error listener to prevent spam after initial failure
    redisClient.removeAllListeners('error');
    
    // Redis is optional - silently skip if not available
    // Only log in production if Redis is actually required
    if (config.nodeEnv === 'production') {
      logger.debug('Redis not available (optional feature)');
    }
    // Don't exit - Redis is optional for some features
  }
};

// Graceful shutdown
process.on('SIGINT', async () => {
  await redisClient.quit();
  logger.info('Redis connection closed');
});

