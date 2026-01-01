import { MT5Account, IMT5Account, User, CopyLink } from '../../models';
import { ACCOUNT_TYPES, ACCOUNT_STATUS } from '../../config/constants';
import { NotFoundError, ValidationError, ForbiddenError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { eaTokenService } from './eaTokenService';
import { subscriptionService } from '../subscription/subscriptionService';
import { webSocketService } from '../realtime/websocketService';

export interface CreateAccountData {
  accountName: string;
  loginId: string;
  broker: string;
  server: string;
  accountType: 'master' | 'slave' | 'standalone';
}

export class MT5AccountService {
  /**
   * Create a new MT5 account
   */
  async createAccount(userId: string, data: CreateAccountData): Promise<IMT5Account> {
    // Get user's subscription limits
    const subscription = await subscriptionService.getHybridSubscription(userId);
    
    // Check specific limits based on account type
    if (data.accountType === 'master') {
      // Count existing master accounts
      const masterCount = await MT5Account.countDocuments({
        userId,
        accountType: 'master',
        status: { $in: ['active', 'offline'] },
      });
      
      if (masterCount >= subscription.limits.totalMasters) {
        throw new ValidationError(
          `Master account limit reached. You have ${subscription.limits.totalMasters} master license(s). ` +
          `Please purchase additional master add-ons or upgrade your subscription to add more master accounts.`
        );
      }
    } else if (data.accountType === 'slave') {
      // Count existing slave accounts
      const slaveCount = await MT5Account.countDocuments({
        userId,
        accountType: 'slave',
        status: { $in: ['active', 'offline'] },
      });
      
      if (slaveCount >= subscription.limits.totalSlaves) {
        throw new ValidationError(
          `Slave account limit reached. You have ${subscription.limits.totalSlaves} slave license(s). ` +
          `Please purchase additional slave add-ons or upgrade your subscription to add more slave accounts.`
        );
      }
    } else {
      // For standalone accounts, check total account limit (masters + slaves + standalone)
      const totalAccountCount = await MT5Account.countDocuments({
        userId,
        status: { $in: ['active', 'offline'] },
      });
      
      const totalLimit = subscription.limits.totalMasters + subscription.limits.totalSlaves;
      if (totalAccountCount >= totalLimit) {
        throw new ValidationError(
          `Account limit reached. You have ${totalLimit} total account license(s). ` +
          `Please purchase additional add-ons or upgrade your subscription to add more accounts.`
        );
      }
    }

    // Generate EA token
    const eaToken = eaTokenService.generateToken();

    // CRITICAL FIX: Validate and auto-correct swapped fields
    // loginId should be numeric, accountName should contain letters/spaces
    let finalAccountName = data.accountName;
    let finalLoginId = data.loginId;
    
    const loginIdIsNumeric = /^[0-9]+$/.test(String(data.loginId));
    const accountNameIsNumeric = /^[0-9]+$/.test(String(data.accountName));
    const loginIdHasLetters = /[a-zA-Z\s]/.test(String(data.loginId));
    const accountNameHasLetters = /[a-zA-Z\s]/.test(String(data.accountName));
    
    // If loginId has letters (looks like accountName) and accountName is numeric (looks like loginId), swap them
    if (loginIdHasLetters && accountNameIsNumeric) {
      logger.warn('AccountService: Detected swapped fields - auto-correcting', {
        originalLoginId: data.loginId,
        originalAccountName: data.accountName,
      });
      finalAccountName = data.loginId; // Swap
      finalLoginId = data.accountName; // Swap
    } else if (!loginIdIsNumeric) {
      // If loginId is not numeric but accountName is, they might be swapped
      if (accountNameIsNumeric) {
        logger.warn('AccountService: loginId is not numeric but accountName is - auto-correcting', {
          originalLoginId: data.loginId,
          originalAccountName: data.accountName,
        });
        finalAccountName = data.loginId;
        finalLoginId = data.accountName;
      } else {
        // Both are non-numeric or both are numeric - log warning but use as-is
        logger.warn('AccountService: loginId is not numeric', {
          loginId: data.loginId,
          accountName: data.accountName,
        });
      }
    }

    // Create account
    const account = new MT5Account({
      userId,
      accountName: finalAccountName,
      loginId: finalLoginId,
      broker: data.broker,
      server: data.server,
      eaToken,
      accountType: data.accountType,
      status: ACCOUNT_STATUS.ACTIVE,
      connectionStatus: 'offline',
    });

    await account.save();

    logger.info(`MT5 account created: ${account._id} for user: ${userId}`);

    return account;
  }

  /**
   * Get account by ID
   * Automatically checks and updates connection status based on lastHeartbeat
   * Returns balance/equity as 0 for offline accounts
   */
  async getAccountById(accountId: string, userId?: string): Promise<IMT5Account> {
    const query: any = { _id: accountId };

    // If userId provided, ensure user owns the account
    if (userId) {
      query.userId = userId;
    }

    const account = await MT5Account.findOne(query);

    if (!account) {
      throw new NotFoundError('MT5 account not found');
    }

    // Check and update connection status (this will save if status changes)
    await this.checkAndUpdateConnectionStatus(account);

    // Reload to get updated connectionStatus
    const updatedAccount = await MT5Account.findOne(query);
    if (!updatedAccount) {
      throw new NotFoundError('MT5 account not found');
    }

    // Sanitize account data - set balance/equity to 0 for offline accounts
    return this.sanitizeAccountData(updatedAccount);
  }

  /**
   * Check if account connection status should be updated based on lastHeartbeat
   * Accounts are considered offline if lastHeartbeat is older than 30 seconds
   * Emits WebSocket update when status changes
   */
  private async checkAndUpdateConnectionStatus(account: IMT5Account, emitUpdate: boolean = true): Promise<void> {
    const HEARTBEAT_TIMEOUT_MS = 30 * 1000; // 30 seconds
    const now = new Date();
    const previousStatus = account.connectionStatus;
    
    // If account has no lastHeartbeat, it's definitely offline
    if (!account.lastHeartbeat) {
      if (account.connectionStatus === 'online') {
        account.connectionStatus = 'offline';
        await account.save();
        logger.debug(`Account ${account._id} marked as offline (no heartbeat)`);
        
        // Emit WebSocket update when account goes offline
        if (emitUpdate && previousStatus !== account.connectionStatus) {
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
        }
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
        
        // Emit WebSocket update when account goes offline
        if (emitUpdate && previousStatus !== account.connectionStatus) {
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
        }
      }
    }
    // If heartbeat is recent and account is marked offline, mark as online
    // (This handles edge cases where status might be out of sync)
    else if (account.connectionStatus === 'offline') {
      account.connectionStatus = 'online';
      await account.save();
      logger.debug(`Account ${account._id} marked as online (recent heartbeat: ${Math.round(timeSinceHeartbeat / 1000)}s ago)`);
    }
  }

  /**
   * Sanitize account data - set balance/equity to 0 if offline
   * This ensures offline accounts don't show stale balance/equity values
   */
  private sanitizeAccountData(account: IMT5Account): IMT5Account {
    // If account is offline, set balance and equity to 0
    if (account.connectionStatus === 'offline') {
      // Create a new object with balance/equity set to 0
      // We use toObject() to convert Mongoose document to plain object, then modify
      const accountObj = account.toObject ? account.toObject() : { ...account };
      accountObj.balance = 0;
      accountObj.equity = 0;
      accountObj.margin = 0;
      accountObj.freeMargin = 0;
      accountObj.marginLevel = 0;
      // Convert back to Mongoose document if needed, or return as plain object
      return accountObj as IMT5Account;
    }
    return account;
  }

  /**
   * Auto-fix corrupted accounts (where loginId and accountName are swapped)
   */
  private async fixCorruptedAccount(account: IMT5Account): Promise<void> {
    const loginIdIsNumeric = /^[0-9]+$/.test(String(account.loginId));
    const accountNameIsNumeric = /^[0-9]+$/.test(String(account.accountName));
    const loginIdHasLetters = /[a-zA-Z\s]/.test(String(account.loginId));
    
    // If loginId has letters (looks like accountName) and accountName is numeric (looks like loginId), swap them
    if (loginIdHasLetters && accountNameIsNumeric) {
      logger.warn('AccountService: Fixing corrupted account - swapping loginId and accountName', {
        accountId: account._id,
        oldLoginId: account.loginId,
        oldAccountName: account.accountName,
      });
      
      const temp = account.accountName;
      account.accountName = account.loginId;
      account.loginId = temp;
      
      await account.save();
      
      logger.info('AccountService: Account fixed successfully', {
        accountId: account._id,
        newLoginId: account.loginId,
        newAccountName: account.accountName,
      });
    }
  }

  /**
   * Get all accounts for a user
   * Automatically checks and updates connection status based on lastHeartbeat
   * Returns balance/equity as 0 for offline accounts
   * Also auto-fixes corrupted accounts (swapped loginId/accountName)
   */
  async getUserAccounts(userId: string): Promise<IMT5Account[]> {
    const accounts = await MT5Account.find({ userId }).sort({ createdAt: -1 });
    
    // Auto-fix corrupted accounts (swapped fields)
    await Promise.all(
      accounts.map(account => this.fixCorruptedAccount(account as any).catch(err => {
        logger.error('AccountService: Error fixing corrupted account', {
          accountId: account._id,
          error: err,
        });
      }))
    );
    
    // Check and update connection status for each account
    // Do this in parallel for better performance
    await Promise.all(
      accounts.map(account => this.checkAndUpdateConnectionStatus(account))
    );
    
    // Reload accounts to get updated connectionStatus and fixed fields
    const updatedAccounts = await MT5Account.find({ userId }).sort({ createdAt: -1 });
    
    // Sanitize account data - set balance/equity to 0 for offline accounts
    return updatedAccounts.map(account => this.sanitizeAccountData(account));
  }

  /**
   * Update account
   */
  async updateAccount(
    accountId: string,
    userId: string,
    data: Partial<CreateAccountData>
  ): Promise<IMT5Account> {
    // Fetch account directly (not through getAccountById) to get Mongoose document with .save() method
    const query: any = { _id: accountId };
    if (userId) {
      query.userId = userId;
    }

    const account = await MT5Account.findOne(query);
    
    // CRITICAL FIX: Validate and auto-correct swapped fields (same as createAccount)
    if (data.accountName !== undefined || data.loginId !== undefined) {
      const currentAccountName = data.accountName !== undefined ? data.accountName : account?.accountName;
      const currentLoginId = data.loginId !== undefined ? data.loginId : account?.loginId;
      
      const loginIdIsNumeric = /^[0-9]+$/.test(String(currentLoginId));
      const accountNameIsNumeric = /^[0-9]+$/.test(String(currentAccountName));
      const loginIdHasLetters = /[a-zA-Z\s]/.test(String(currentLoginId));
      
      // If loginId has letters (looks like accountName) and accountName is numeric (looks like loginId), swap them
      if (loginIdHasLetters && accountNameIsNumeric) {
        logger.warn('AccountService: Detected swapped fields in update - auto-correcting', {
          accountId,
          originalLoginId: currentLoginId,
          originalAccountName: currentAccountName,
        });
        if (data.accountName !== undefined) data.accountName = currentLoginId as string;
        if (data.loginId !== undefined) data.loginId = currentAccountName as string;
      } else if (!loginIdIsNumeric && accountNameIsNumeric) {
        logger.warn('AccountService: loginId is not numeric but accountName is in update - auto-correcting', {
          accountId,
          originalLoginId: currentLoginId,
          originalAccountName: currentAccountName,
        });
        if (data.accountName !== undefined) data.accountName = currentLoginId as string;
        if (data.loginId !== undefined) data.loginId = currentAccountName as string;
      }
    }
    if (!account) {
      throw new NotFoundError('MT5 account not found');
    }

    logger.info('Updating account', {
      accountId,
      userId,
      updateData: data,
      currentAccountType: account.accountType,
    });

    if (data.accountName) account.accountName = data.accountName;
    if (data.loginId) account.loginId = data.loginId;
    if (data.broker) account.broker = data.broker;
    if (data.server) account.server = data.server;
    if (data.accountType !== undefined) {
      // Validate accountType value
      const validTypes = ['master', 'slave', 'standalone'];
      if (!validTypes.includes(data.accountType)) {
        throw new ValidationError(`Invalid accountType: ${data.accountType}. Must be one of: ${validTypes.join(', ')}`);
      }
      account.accountType = data.accountType;
    }

    try {
      await account.save();
      logger.info(`MT5 account updated: ${accountId}`, {
        newAccountType: account.accountType,
      });
    } catch (error: any) {
      logger.error('Error saving account update', {
        accountId,
        error: error.message,
        stack: error.stack,
        updateData: data,
      });
      throw error;
    }

    // Return sanitized data for response (but account is already saved)
    return this.sanitizeAccountData(account);
  }

  /**
   * Delete account
   * Also deletes all associated copy links (where account is master or slave)
   */
  async deleteAccount(accountId: string, userId: string): Promise<void> {
    const account = await this.getAccountById(accountId, userId);

    // Delete all copy links where this account is master or slave
    const deletedLinks = await CopyLink.deleteMany({
      $or: [
        { masterAccountId: accountId },
        { slaveAccountId: accountId },
      ],
    });

    logger.info(`Deleted ${deletedLinks.deletedCount} copy link(s) associated with account ${accountId}`);

    // Delete the account
    await MT5Account.findByIdAndDelete(accountId);

    logger.info(`MT5 account deleted: ${accountId}`);
  }

  /**
   * Regenerate EA token
   */
  async regenerateEAToken(accountId: string, userId: string): Promise<string> {
    const account = await this.getAccountById(accountId, userId);

    const newToken = await eaTokenService.regenerateToken(accountId);

    return newToken;
  }

  /**
   * Update account rules
   */
  async updateAccountRules(
    accountId: string,
    userId: string,
    rules: Partial<IMT5Account['rules']>
  ): Promise<IMT5Account> {
    const account = await this.getAccountById(accountId, userId);

    if (rules.equityStop) {
      account.rules.equityStop = { ...account.rules.equityStop, ...rules.equityStop };
    }
    if (rules.dailyLossLimit) {
      account.rules.dailyLossLimit = { ...account.rules.dailyLossLimit, ...rules.dailyLossLimit };
    }
    if (rules.symbolFilter) {
      account.rules.symbolFilter = { ...account.rules.symbolFilter, ...rules.symbolFilter };
    }
    if (rules.maxTrades) {
      account.rules.maxTrades = { ...account.rules.maxTrades, ...rules.maxTrades };
    }
    if (rules.timeFilter) {
      account.rules.timeFilter = { ...account.rules.timeFilter, ...rules.timeFilter };
    }

    await account.save();

    logger.info(`Account rules updated: ${accountId}`);

    return account;
  }
}

export const mt5AccountService = new MT5AccountService();

