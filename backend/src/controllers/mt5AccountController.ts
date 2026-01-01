import { Request, Response, NextFunction } from 'express';
import { mt5AccountService } from '../services/mt5/accountService';
import { ValidationError } from '../utils/errors';
import { body } from 'express-validator';
import { cacheService } from '../services/realtime/cacheService';
import { logger } from '../utils/logger';
import { HistoryService } from '../services/history/historyService';
import { subscriptionService } from '../services/subscription/subscriptionService';

export class MT5AccountController {
  /**
   * Create new MT5 account
   * POST /api/mt5/accounts
   */
  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ValidationError('User not authenticated');
      }

      const { accountName, loginId, broker, server, accountType } = req.body;

      const account = await mt5AccountService.createAccount(req.user._id.toString(), {
        accountName,
        loginId,
        broker,
        server,
        accountType: accountType || 'standalone',
      });

      // Log history
      await HistoryService.createEntry({
        userId: req.user._id.toString(),
        actionType: 'account_added',
        description: `MT5 account added: ${accountName} (${loginId}) - ${accountType || 'standalone'}`,
        newValue: {
          accountId: account._id,
          accountName,
          loginId,
          broker,
          server,
          accountType: accountType || 'standalone',
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.status(201).json({
        success: true,
        message: 'MT5 account created successfully',
        data: account,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get all user's MT5 accounts
   * GET /api/mt5/accounts
   */
  getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ValidationError('User not authenticated');
      }

      // Check and remove excess accounts before fetching (in case limits changed)
      try {
        await subscriptionService.removeExcessAccounts(req.user._id.toString());
      } catch (error) {
        // Log but don't fail the request if removal fails
        logger.error(`Failed to remove excess accounts for user ${req.user._id}: ${error}`);
      }

      const accounts = await mt5AccountService.getUserAccounts(req.user._id.toString());

      res.json({
        success: true,
        data: accounts,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get MT5 account by ID
   * GET /api/mt5/accounts/:id
   */
  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ValidationError('User not authenticated');
      }

      const account = await mt5AccountService.getAccountById(
        req.params.id,
        req.user._id.toString()
      );

      res.json({
        success: true,
        data: account,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Update MT5 account
   * PUT /api/mt5/accounts/:id
   */
  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ValidationError('User not authenticated');
      }

      const { accountName, loginId, broker, server, accountType } = req.body;

      const account = await mt5AccountService.updateAccount(
        req.params.id,
        req.user._id.toString(),
        {
          accountName,
          loginId,
          broker,
          server,
          accountType,
        }
      );

      res.json({
        success: true,
        message: 'MT5 account updated successfully',
        data: account,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Delete MT5 account
   * DELETE /api/mt5/accounts/:id
   */
  delete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ValidationError('User not authenticated');
      }

      // Get account data before deletion for history
      const account = await mt5AccountService.getAccountById(req.params.id, req.user._id.toString());

      await mt5AccountService.deleteAccount(req.params.id, req.user._id.toString());

      // Log history
      await HistoryService.createEntry({
        userId: req.user._id.toString(),
        actionType: 'account_deleted',
        description: `MT5 account deleted: ${account.accountName} (${account.loginId})`,
        oldValue: {
          accountId: account._id,
          accountName: account.accountName,
          loginId: account.loginId,
          broker: account.broker,
          server: account.server,
          accountType: account.accountType,
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.json({
        success: true,
        message: 'MT5 account deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Regenerate EA token
   * POST /api/mt5/accounts/:id/regenerate-token
   */
  regenerateToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ValidationError('User not authenticated');
      }

      const newToken = await mt5AccountService.regenerateEAToken(
        req.params.id,
        req.user._id.toString()
      );

      res.json({
        success: true,
        message: 'EA token regenerated successfully',
        data: { eaToken: newToken },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Update account rules
   * PUT /api/mt5/accounts/:id/rules
   */
  updateRules = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ValidationError('User not authenticated');
      }

      const account = await mt5AccountService.updateAccountRules(
        req.params.id,
        req.user._id.toString(),
        req.body
      );

      res.json({
        success: true,
        message: 'Account rules updated successfully',
        data: account,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get real-time account data from cache
   * GET /api/mt5/accounts/:id/realtime
   */
  getRealtimeData = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ValidationError('User not authenticated');
      }

      // Verify account belongs to user
      const account = await mt5AccountService.getAccountById(
        req.params.id,
        req.user._id.toString()
      );

      // Get cached data
      const cachedData = await cacheService.getCachedAccountData(req.params.id);

      if (!cachedData) {
        // No cached data, return account info from DB
        res.json({
          success: true,
          data: {
            accountId: account._id.toString(),
            balance: account.balance || 0,
            equity: account.equity || 0,
            margin: account.margin || 0,
            freeMargin: account.freeMargin || 0,
            marginLevel: account.marginLevel || 0,
            connectionStatus: account.connectionStatus || 'offline',
            lastHeartbeat: account.lastHeartbeat || null,
            openTrades: [],
            cached: false,
          },
        });
        return;
      }

      // Return cached data
      res.json({
        success: true,
        data: {
          ...cachedData,
          accountId: req.params.id,
          cached: true,
        },
      });
    } catch (error) {
      next(error);
    }
  };
}

export const mt5AccountController = new MT5AccountController();

// Validation rules
export const createAccountValidation = [
  body('accountName').trim().notEmpty().withMessage('Account name is required'),
  body('loginId').notEmpty().withMessage('Login ID is required'),
  body('broker').trim().notEmpty().withMessage('Broker is required'),
  body('server').trim().notEmpty().withMessage('Server is required'),
  body('accountType').optional().isIn(['master', 'slave', 'standalone']).withMessage('Invalid account type'),
];

