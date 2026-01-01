import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth/authService';
import { mt5AccountService } from '../services/mt5/accountService';
import { subscriptionService } from '../services/subscription/subscriptionService';
import { HistoryService } from '../services/history/historyService';
import { stripeService } from '../services/payment/stripeService';
import { CopyLink } from '../models';
import { ValidationError, ForbiddenError } from '../utils/errors';
import { body } from 'express-validator';
import { logger } from '../utils/logger';
import { validatePasswordStrength } from '../utils/passwordValidation';

export class UserController {
  /**
   * Get current user profile
   * GET /api/users/me
   */
  getProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ValidationError('User not authenticated');
      }

      res.json({
        success: true,
        data: req.user,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Update user profile
   * PUT /api/users/me
   */
  updateProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ValidationError('User not authenticated');
      }

      const { name } = req.body;

      const user = await authService.updateProfile(req.user._id.toString(), { name });

      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: user,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get user's MT5 accounts
   * GET /api/users/me/accounts
   */
  getMyAccounts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ValidationError('User not authenticated');
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
   * Get user's current subscription
   * GET /api/users/me/subscription
   */
  getMySubscription = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ValidationError('User not authenticated');
      }

      const subscription = await subscriptionService.getCurrentSubscription(req.user._id.toString());

      res.json({
        success: true,
        data: subscription,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Change password
   * POST /api/users/me/change-password
   */
  changePassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ValidationError('User not authenticated');
      }

      const { currentPassword, newPassword } = req.body;

      await authService.changePassword(
        req.user._id.toString(),
        currentPassword,
        newPassword
      );

      res.json({
        success: true,
        message: 'Password changed successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Update user (Admin only)
   * PUT /api/admin/users/:userId
   */
  updateUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || req.user.role !== 'admin') {
        throw new ForbiddenError('Admin access required');
      }

      const { userId } = req.params;
      const { name, email, role } = req.body;

      // Get old user data for history
      const oldUser = await authService.getUserById(userId);
      const oldValue = {
        name: oldUser.name,
        email: oldUser.email,
        role: oldUser.role,
      };

      // Update user
      const updatedUser = await authService.updateUser(userId, { name, email, role });

      const newValue = {
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
      };

      // Log history
      await HistoryService.createEntry({
        userId,
        actionType: 'user_edited',
        description: `User information updated by admin ${req.user.email}`,
        oldValue,
        newValue,
        performedBy: req.user._id.toString(),
        performedByEmail: req.user.email,
      });

      res.json({
        success: true,
        message: 'User updated successfully',
        data: updatedUser,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Delete user (Admin only)
   * DELETE /api/admin/users/:userId
   */
  deleteUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || req.user.role !== 'admin') {
        throw new ForbiddenError('Admin access required');
      }

      const { userId } = req.params;

      // Prevent admin from deleting themselves
      if (userId === req.user._id.toString()) {
        throw new ValidationError('Cannot delete your own account');
      }

      // Get user data for history
      const user = await authService.getUserById(userId);
      const userData = {
        email: user.email,
        name: user.name,
        role: user.role,
      };

      // Delete all MT5 accounts and copy links
      const accounts = await mt5AccountService.getUserAccounts(userId);
      const accountIds = accounts.map((acc: any) => acc._id.toString());

      if (accountIds.length > 0) {
        // Delete all copy links where these accounts are master or slave
        await CopyLink.deleteMany({
          $or: [
            { masterAccountId: { $in: accountIds } },
            { slaveAccountId: { $in: accountIds } },
          ],
        });

        // Delete all accounts
        for (const accountId of accountIds) {
          await mt5AccountService.deleteAccount(accountId, userId);
        }
      }

      // Cancel Stripe subscription if exists
      if (user.stripeSubscriptionId) {
        try {
          await stripeService.cancelSubscription(user.stripeSubscriptionId);
          logger.info(`Cancelled Stripe subscription for deleted user: ${user.email}`);
        } catch (error: any) {
          logger.error(`Failed to cancel Stripe subscription: ${error.message}`);
          // Continue with deletion even if Stripe cancellation fails
        }
      }

      // Cancel subscription in database
      try {
        await subscriptionService.cancelSubscription(userId);
      } catch (error: any) {
        logger.error(`Failed to cancel subscription: ${error.message}`);
        // Continue with deletion
      }

      // Log history before deletion
      await HistoryService.createEntry({
        userId,
        actionType: 'user_deleted',
        description: `User account deleted by admin ${req.user.email}. Deleted ${accounts.length} account(s) and associated copy links.`,
        oldValue: userData,
        performedBy: req.user._id.toString(),
        performedByEmail: req.user.email,
        metadata: {
          accountsDeleted: accounts.length,
          stripeSubscriptionCancelled: !!user.stripeSubscriptionId,
        },
      });

      // Delete the user
      await user.deleteOne();

      logger.info(`User deleted by admin ${req.user.email}: ${userData.email}`);

      res.json({
        success: true,
        message: 'User deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Block user (Admin only)
   * POST /api/admin/users/:userId/block
   */
  blockUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || req.user.role !== 'admin') {
        throw new ForbiddenError('Admin access required');
      }

      const { userId } = req.params;

      // Prevent admin from blocking themselves
      if (userId === req.user._id.toString()) {
        throw new ValidationError('Cannot block your own account');
      }

      const user = await authService.blockUser(userId);

      // Log history
      await HistoryService.createEntry({
        userId,
        actionType: 'user_blocked',
        description: `User account blocked by admin ${req.user.email}`,
        oldValue: { isActive: true },
        newValue: { isActive: false },
        performedBy: req.user._id.toString(),
        performedByEmail: req.user.email,
      });

      res.json({
        success: true,
        message: 'User blocked successfully',
        data: user,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Unblock user (Admin only)
   * POST /api/admin/users/:userId/unblock
   */
  unblockUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || req.user.role !== 'admin') {
        throw new ForbiddenError('Admin access required');
      }

      const { userId } = req.params;

      const user = await authService.unblockUser(userId);

      // Log history
      await HistoryService.createEntry({
        userId,
        actionType: 'user_unblocked',
        description: `User account unblocked by admin ${req.user.email}`,
        oldValue: { isActive: false },
        newValue: { isActive: true },
        performedBy: req.user._id.toString(),
        performedByEmail: req.user.email,
      });

      res.json({
        success: true,
        message: 'User unblocked successfully',
        data: user,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Bulk block users (Admin only)
   * POST /api/admin/users/bulk/block
   */
  bulkBlockUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || req.user.role !== 'admin') {
        throw new ForbiddenError('Admin access required');
      }

      const { userIds } = req.body;

      if (!Array.isArray(userIds) || userIds.length === 0) {
        throw new ValidationError('User IDs array is required');
      }

      // Prevent admin from blocking themselves
      const filteredUserIds = userIds.filter((id: string) => id !== req.user!._id.toString());

      const results = {
        success: 0,
        failed: 0,
        errors: [] as string[],
      };

      for (const userId of filteredUserIds) {
        try {
          await authService.blockUser(userId);
          results.success++;

          // Log history
          await HistoryService.createEntry({
            userId,
            actionType: 'user_blocked',
            description: `User account blocked by admin ${req.user.email} (bulk operation)`,
            oldValue: { isActive: true },
            newValue: { isActive: false },
            performedBy: req.user._id.toString(),
            performedByEmail: req.user.email,
          });
        } catch (error: any) {
          results.failed++;
          results.errors.push(`${userId}: ${error.message}`);
        }
      }

      res.json({
        success: true,
        message: `Blocked ${results.success} user(s), ${results.failed} failed`,
        data: results,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Bulk unblock users (Admin only)
   * POST /api/admin/users/bulk/unblock
   */
  bulkUnblockUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || req.user.role !== 'admin') {
        throw new ForbiddenError('Admin access required');
      }

      const { userIds } = req.body;

      if (!Array.isArray(userIds) || userIds.length === 0) {
        throw new ValidationError('User IDs array is required');
      }

      const results = {
        success: 0,
        failed: 0,
        errors: [] as string[],
      };

      for (const userId of userIds) {
        try {
          await authService.unblockUser(userId);
          results.success++;

          // Log history
          await HistoryService.createEntry({
            userId,
            actionType: 'user_unblocked',
            description: `User account unblocked by admin ${req.user.email} (bulk operation)`,
            oldValue: { isActive: false },
            newValue: { isActive: true },
            performedBy: req.user._id.toString(),
            performedByEmail: req.user.email,
          });
        } catch (error: any) {
          results.failed++;
          results.errors.push(`${userId}: ${error.message}`);
        }
      }

      res.json({
        success: true,
        message: `Unblocked ${results.success} user(s), ${results.failed} failed`,
        data: results,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Bulk delete users (Admin only)
   * POST /api/admin/users/bulk/delete
   */
  bulkDeleteUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || req.user.role !== 'admin') {
        throw new ForbiddenError('Admin access required');
      }

      const { userIds } = req.body;

      if (!Array.isArray(userIds) || userIds.length === 0) {
        throw new ValidationError('User IDs array is required');
      }

      // Prevent admin from deleting themselves
      const filteredUserIds = userIds.filter((id: string) => id !== req.user!._id.toString());

      const results = {
        success: 0,
        failed: 0,
        errors: [] as string[],
      };

      for (const userId of filteredUserIds) {
        try {
          // Get user data for history
          const user = await authService.getUserById(userId);
          const userData = {
            email: user.email,
            name: user.name,
            role: user.role,
          };

          // Delete all MT5 accounts and copy links
          const accounts = await mt5AccountService.getUserAccounts(userId);
          const accountIds = accounts.map((acc: any) => acc._id.toString());

          if (accountIds.length > 0) {
            await CopyLink.deleteMany({
              $or: [
                { masterAccountId: { $in: accountIds } },
                { slaveAccountId: { $in: accountIds } },
              ],
            });

            for (const accountId of accountIds) {
              await mt5AccountService.deleteAccount(accountId, userId);
            }
          }

          // Cancel Stripe subscription if exists
          if (user.stripeSubscriptionId) {
            try {
              await stripeService.cancelSubscription(user.stripeSubscriptionId);
            } catch (error: any) {
              logger.error(`Failed to cancel Stripe subscription for ${userId}: ${error.message}`);
            }
          }

          // Cancel subscription in database
          try {
            await subscriptionService.cancelSubscription(userId);
          } catch (error: any) {
            logger.error(`Failed to cancel subscription for ${userId}: ${error.message}`);
          }

          // Log history
          await HistoryService.createEntry({
            userId,
            actionType: 'user_deleted',
            description: `User account deleted by admin ${req.user.email} (bulk operation). Deleted ${accounts.length} account(s).`,
            oldValue: userData,
            performedBy: req.user._id.toString(),
            performedByEmail: req.user.email,
            metadata: {
              accountsDeleted: accounts.length,
            },
          });

          // Delete the user
          await user.deleteOne();
          results.success++;
        } catch (error: any) {
          results.failed++;
          results.errors.push(`${userId}: ${error.message}`);
        }
      }

      res.json({
        success: true,
        message: `Deleted ${results.success} user(s), ${results.failed} failed`,
        data: results,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const userController = new UserController();

// Validation rules
export const updateProfileValidation = [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
];

export const changePasswordValidation = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .notEmpty()
    .withMessage('New password is required')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .custom((value) => {
      const validation = validatePasswordStrength(value);
      if (!validation.isValid) {
        throw new Error(validation.errors[0]);
      }
      return true;
    }),
];

export const updateUserValidation = [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('email').optional().isEmail().withMessage('Invalid email format'),
  body('role').optional().isIn(['admin', 'client', 'viewer']).withMessage('Invalid role'),
];

