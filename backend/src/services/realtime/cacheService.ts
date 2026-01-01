import { redisClient } from '../../config/redis';
import { logger } from '../../utils/logger';

export interface CachedAccountData {
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
  connectionStatus: 'online' | 'offline';
  lastHeartbeat: string;
  openTrades: Array<{
    ticket: number;
    symbol: string;
    type: 'BUY' | 'SELL';
    volume: number;
    openPrice: number;
    currentPrice: number;
    profit: number;
    sl?: number;
    tp?: number;
    comment?: string; // CRITICAL: Include comment to check for existing trades by master ticket
    openTime: string;
  }>;
  timestamp: string;
}

class CacheService {
  private readonly CACHE_TTL = 2; // 2 seconds TTL for account data
  private readonly REDIS_PREFIX = 'account:data:';
  private redisUnavailableLogged = false; // Track if we've logged Redis unavailability
  private lastWarningTime = 0; // Track last warning time to throttle warnings
  private readonly WARNING_THROTTLE_MS = 60000; // Only log warning once per minute

  /**
   * Check if Redis is actually available and ready
   */
  private isRedisAvailable(): boolean {
    // Only return true if Redis is actually ready (not just open)
    return redisClient.isReady === true;
  }

  /**
   * Cache account data
   */
  async cacheAccountData(accountId: string, data: CachedAccountData): Promise<void> {
    if (!this.isRedisAvailable()) {
      // Redis not available, skip caching (graceful degradation)
      // Only log once to avoid spam
      if (!this.redisUnavailableLogged) {
        this.redisUnavailableLogged = true;
        // Don't log - Redis is optional, silent degradation
      }
      return;
    }

    try {
      const key = `${this.REDIS_PREFIX}${accountId}`;
      
      // Add timeout to prevent hanging if Redis is slow/unresponsive
      const cachePromise = redisClient.setEx(key, this.CACHE_TTL, JSON.stringify(data));
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Redis cache timeout after 1 second')), 1000)
      );
      
      await Promise.race([cachePromise, timeoutPromise]);
      // Reset unavailable flag on success
      this.redisUnavailableLogged = false;
    } catch (error: any) {
      // Throttle warnings - only log once per minute
      const now = Date.now();
      if (now - this.lastWarningTime > this.WARNING_THROTTLE_MS) {
        this.lastWarningTime = now;
        // Suppress timeout warnings - Redis is optional
        // Only log if it's not a timeout (actual errors)
        if (!error.message?.includes('timeout')) {
          logger.warn(`Failed to cache account data for ${accountId}:`, error.message);
        }
      }
      // Don't throw - caching is optional, continue execution
    }
  }

  /**
   * Get cached account data
   */
  async getCachedAccountData(accountId: string): Promise<CachedAccountData | null> {
    if (!this.isRedisAvailable()) {
      return null;
    }

    try {
      const key = `${this.REDIS_PREFIX}${accountId}`;
      const cached = await redisClient.get(key);
      
      if (!cached) {
        return null;
      }

      return JSON.parse(cached) as CachedAccountData;
    } catch (error: any) {
      logger.warn(`Failed to get cached account data for ${accountId}:`, error.message);
      return null;
    }
  }

  /**
   * Invalidate cached account data
   */
  async invalidateAccountData(accountId: string): Promise<void> {
    if (!this.isRedisAvailable()) {
      return;
    }

    try {
      const key = `${this.REDIS_PREFIX}${accountId}`;
      await redisClient.del(key);
    } catch (error: any) {
      logger.warn(`Failed to invalidate cached account data for ${accountId}:`, error.message);
    }
  }

  /**
   * Cache multiple accounts (batch operation)
   */
  async cacheMultipleAccounts(data: Map<string, CachedAccountData>): Promise<void> {
    if (!this.isRedisAvailable() || data.size === 0) {
      return;
    }

    try {
      const pipeline = redisClient.multi();
      
      data.forEach((accountData, accountId) => {
        const key = `${this.REDIS_PREFIX}${accountId}`;
        pipeline.setEx(key, this.CACHE_TTL, JSON.stringify(accountData));
      });

      await pipeline.exec();
    } catch (error: any) {
      logger.warn(`Failed to cache multiple accounts:`, error.message);
    }
  }

  /**
   * Get cached data for multiple accounts
   */
  async getCachedMultipleAccounts(accountIds: string[]): Promise<Map<string, CachedAccountData>> {
    const result = new Map<string, CachedAccountData>();

    if (!this.isRedisAvailable() || accountIds.length === 0) {
      return result;
    }

    try {
      const keys = accountIds.map(id => `${this.REDIS_PREFIX}${id}`);
      const values = await redisClient.mGet(keys);

      values.forEach((value, index) => {
        if (value) {
          try {
            const data = JSON.parse(value) as CachedAccountData;
            result.set(accountIds[index], data);
          } catch (parseError) {
            // Skip invalid JSON
          }
        }
      });
    } catch (error: any) {
      logger.warn(`Failed to get cached data for multiple accounts:`, error.message);
    }

    return result;
  }
}

export const cacheService = new CacheService();

