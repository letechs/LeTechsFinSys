import { MT5Account } from '../../models';
import { logger } from '../../utils/logger';
import { webSocketService } from '../realtime/websocketService';

/**
 * Periodic service to monitor account connection status
 * Checks all accounts every 30 seconds and emits WebSocket updates when they go offline
 */
export class AccountStatusMonitor {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL_MS = 30 * 1000; // Check every 30 seconds
  private isRunning = false;

  /**
   * Start the periodic monitoring service
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('AccountStatusMonitor is already running');
      return;
    }

    this.isRunning = true;
    logger.info('🔍 AccountStatusMonitor started - checking account status every 30 seconds');

    // Run immediately on start, then every 30 seconds
    this.checkAllAccounts();
    
    this.intervalId = setInterval(() => {
      this.checkAllAccounts();
    }, this.CHECK_INTERVAL_MS);
  }

  /**
   * Stop the periodic monitoring service
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
    logger.info('🔍 AccountStatusMonitor stopped');
  }

  /**
   * Check all accounts and update their connection status
   * Emits WebSocket updates when accounts go offline
   */
  private async checkAllAccounts(): Promise<void> {
    try {
      // Check MongoDB connection
      const mongoose = require('mongoose');
      if (mongoose.connection.readyState !== 1) {
        logger.debug('MongoDB not connected, skipping account status check');
        return;
      }

      // Get all active accounts
      const accounts = await MT5Account.find({
        status: { $in: ['active', 'offline'] },
      }).lean();

      if (accounts.length === 0) {
        return;
      }

      logger.debug(`Checking connection status for ${accounts.length} accounts`);

      // Check each account's connection status
      // This will automatically emit WebSocket updates when accounts go offline
      for (const account of accounts) {
        try {
          // Use the account service method which handles WebSocket updates
          // We need to convert lean document back to Mongoose document
          const fullAccount = await MT5Account.findById(account._id);
          if (fullAccount) {
            // Call the private method via a public wrapper or directly check status
            // Since checkAndUpdateConnectionStatus is private, we'll create a public method
            await this.checkAccountStatus(fullAccount);
          }
        } catch (error: any) {
          logger.error(`Error checking status for account ${account._id}:`, error);
        }
      }
    } catch (error: any) {
      logger.error('Error in account status check:', error);
    }
  }

  /**
   * Check a single account's connection status
   * This is a wrapper to access the private method
   */
  private async checkAccountStatus(account: any): Promise<void> {
    const HEARTBEAT_TIMEOUT_MS = 30 * 1000; // 30 seconds
    const now = new Date();
    const previousStatus = account.connectionStatus;
    
    // If account has no lastHeartbeat, it's definitely offline
    if (!account.lastHeartbeat) {
      if (account.connectionStatus === 'online') {
        account.connectionStatus = 'offline';
        await account.save();
        logger.debug(`Account ${account._id} marked as offline (no heartbeat)`);
        
        // Emit WebSocket update
        this.emitOfflineUpdate(account);
      }
      return;
    }
    
    // Calculate time since last heartbeat
    const timeSinceHeartbeat = now.getTime() - account.lastHeartbeat.getTime();
    
    // If heartbeat is stale (older than 30 seconds), mark as offline
    if (timeSinceHeartbeat > HEARTBEAT_TIMEOUT_MS) {
      if (account.connectionStatus === 'online') {
        account.connectionStatus = 'offline';
        await account.save();
        logger.debug(`Account ${account._id} marked as offline (heartbeat stale: ${Math.round(timeSinceHeartbeat / 1000)}s ago)`);
        
        // Emit WebSocket update
        this.emitOfflineUpdate(account);
      }
    }
  }

  /**
   * Emit WebSocket update when account goes offline
   */
  private emitOfflineUpdate(account: any): void {
    webSocketService.emitAccountUpdate({
      accountId: account._id.toString(),
      connectionStatus: 'offline',
      balance: 0,
      equity: 0,
      margin: 0,
      freeMargin: 0,
      marginLevel: 0,
      lastHeartbeat: account.lastHeartbeat || undefined,
    });
    logger.debug(`Emitted offline WebSocket update for account ${account._id}`);
  }
}

export const accountStatusMonitor = new AccountStatusMonitor();

