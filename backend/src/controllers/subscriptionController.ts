import { Request, Response, NextFunction } from 'express';
import { subscriptionService } from '../services/subscription/subscriptionService';
import { ValidationError } from '../utils/errors';
import { User } from '../models/User';
import { SUBSCRIPTION_TIERS } from '../config/constants';
import { logger } from '../utils/logger';
import { HistoryService } from '../services/history/historyService';
import { globalConfigService } from '../services/config/globalConfigService';

export class SubscriptionController {
  /**
   * Get public add-on pricing (accessible to all authenticated users)
   * GET /api/subscriptions/addon-pricing
   */
  getAddOnPricing = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const config = await globalConfigService.getConfig();
      
      res.json({
        success: true,
        data: {
          addOnPricing: config.addOnPricing,
          trial: {
            durationDays: config.trial.durationDays,
            masters: config.trial.masters,
            slaves: config.trial.slaves,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  };
  /**
   * Get available subscription plans
   * GET /api/subscriptions/plans
   */
  getPlans = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const plans = await subscriptionService.getAvailablePlans();

      res.json({
        success: true,
        data: plans,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get current subscription
   * GET /api/subscriptions/current
   */
  getCurrent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ValidationError('User not authenticated');
      }

      const subscription = await subscriptionService.getCurrentSubscription(req.user._id.toString());

      // Return null if no subscription (instead of error)
      res.json({
        success: true,
        data: subscription || null,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Create Stripe checkout session
   * POST /api/subscriptions/create-checkout
   */
  createCheckout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ValidationError('User not authenticated');
      }

      const { planId } = req.body;

      if (!planId) {
        throw new ValidationError('Plan ID is required');
      }

      const plan = await subscriptionService.getPlanById(planId);

      if (!plan) {
        throw new ValidationError('Invalid plan ID');
      }

      // TODO: Integrate with Stripe service
      // For now, return a placeholder
      res.json({
        success: true,
        message: 'Stripe integration coming soon',
        data: {
          planId,
          plan,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Cancel subscription
   * POST /api/subscriptions/cancel
   */
  cancel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ValidationError('User not authenticated');
      }

      await subscriptionService.cancelSubscription(req.user._id.toString());

      res.json({
        success: true,
        message: 'Subscription cancelled successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Update user subscription tier (Admin only)
   * PUT /api/subscriptions/admin/:userId/tier
   * 
   * Body: {
   *   tier: 'BASIC' | 'EA_LICENSE' | 'FULL_ACCESS',
   *   expiryDate?: string (ISO date string)
   * }
   */
  updateUserTier = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Check if user is admin
      if (!req.user || req.user.role !== 'admin') {
        throw new ValidationError('Admin access required');
      }

      const { userId } = req.params;
      const { tier, expiryDate } = req.body;

      if (!userId) {
        throw new ValidationError('User ID is required');
      }

      if (!tier || !Object.values(SUBSCRIPTION_TIERS).includes(tier)) {
        throw new ValidationError('Valid tier is required (BASIC, EA_LICENSE, or FULL_ACCESS)');
      }

      // Find user
      const user = await User.findById(userId);
      if (!user) {
        throw new ValidationError('User not found');
      }

      // Handle tier update based on hybrid subscription model
      if (tier === SUBSCRIPTION_TIERS.BASIC) {
        // Moving to BASIC tier
        user.subscriptionTier = SUBSCRIPTION_TIERS.BASIC;
        user.baseTier = null; // Clear base tier
        user.isExpired = false;
        user.gracePeriodEndDate = undefined;
        user.additionalMasters = 0;
        user.additionalSlaves = 0;
        // Clear renewal date if moving to BASIC
        if (!expiryDate) {
          user.subscriptionRenewalDate = undefined;
          user.subscriptionExpiry = undefined;
        }
      } else {
        // Moving to EA_LICENSE or FULL_ACCESS
        user.subscriptionTier = tier as 'EA_LICENSE' | 'FULL_ACCESS';
        user.baseTier = tier as 'EA_LICENSE' | 'FULL_ACCESS'; // Set base tier
        user.isExpired = false;
        user.gracePeriodEndDate = undefined;
      }

      // Update expiry if provided
      if (expiryDate) {
        const expiry = new Date(expiryDate);
        if (isNaN(expiry.getTime())) {
          throw new ValidationError('Invalid expiry date format');
        }
        user.subscriptionExpiry = expiry;
        user.subscriptionRenewalDate = expiry; // Also update renewal date for hybrid model
      }

      // Store old values for history
      const oldTier = user.subscriptionTier;
      const oldBaseTier = user.baseTier;
      const oldExpiry = user.subscriptionExpiry;

      // Update last updated timestamp (for EA polling)
      user.subscriptionLastUpdated = new Date();

      await user.save();

      // Check if limits decreased and remove excess accounts
      // This happens when moving to a lower tier or when add-ons are reduced
      if (tier !== SUBSCRIPTION_TIERS.BASIC) {
        await subscriptionService.removeExcessAccounts(userId);
      }

      // Log history
      await HistoryService.createEntry({
        userId: userId,
        actionType: 'subscription_tier_changed',
        description: `Subscription tier changed from ${oldTier || 'None'} to ${tier}${expiryDate ? ` with expiry ${expiryDate}` : ''}`,
        oldValue: { tier: oldTier, baseTier: oldBaseTier, expiry: oldExpiry },
        newValue: { tier: user.subscriptionTier, baseTier: user.baseTier, expiry: user.subscriptionExpiry },
        performedBy: req.user._id.toString(),
        performedByEmail: req.user.email,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      logger.info(`Admin ${req.user._id} updated user ${userId} tier to ${tier}`);

      // Return updated subscription data
      const updatedSubscription = await subscriptionService.getHybridSubscription(userId);

      res.json({
        success: true,
        message: `User tier updated to ${tier} successfully`,
        data: updatedSubscription,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Bulk update user subscription tiers (Admin only)
   * POST /api/subscriptions/admin/bulk/update-tier
   */
  bulkUpdateUserTiers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Check if user is admin
      if (!req.user || req.user.role !== 'admin') {
        throw new ValidationError('Admin access required');
      }

      const { userIds, tier, expiryDate } = req.body;

      if (!Array.isArray(userIds) || userIds.length === 0) {
        throw new ValidationError('User IDs array is required');
      }

      if (!tier || !['BASIC', 'EA_LICENSE', 'FULL_ACCESS'].includes(tier)) {
        throw new ValidationError('Valid tier is required (BASIC, EA_LICENSE, FULL_ACCESS)');
      }

      const results = {
        success: 0,
        failed: 0,
        errors: [] as string[],
      };

      for (const userId of userIds) {
        try {
          // Find user
          const user = await User.findById(userId);
          if (!user) {
            throw new ValidationError('User not found');
          }

          // Store old values for history
          const oldTier = user.subscriptionTier;
          const oldBaseTier = user.baseTier;
          const oldExpiry = user.subscriptionExpiry;

          // Handle tier update based on hybrid subscription model
          if (tier === SUBSCRIPTION_TIERS.BASIC) {
            // Moving to BASIC tier
            user.subscriptionTier = SUBSCRIPTION_TIERS.BASIC;
            user.baseTier = null; // Clear base tier
            user.isExpired = false;
            user.gracePeriodEndDate = undefined;
            user.additionalMasters = 0;
            user.additionalSlaves = 0;
            // Clear renewal date if moving to BASIC
            if (!expiryDate) {
              user.subscriptionRenewalDate = undefined;
              user.subscriptionExpiry = undefined;
            }
          } else {
            // Moving to EA_LICENSE or FULL_ACCESS
            user.subscriptionTier = tier as 'EA_LICENSE' | 'FULL_ACCESS';
            user.baseTier = tier as 'EA_LICENSE' | 'FULL_ACCESS'; // Set base tier
            user.isExpired = false;
            user.gracePeriodEndDate = undefined;
          }

          // Update expiry if provided
          if (expiryDate) {
            const expiry = new Date(expiryDate);
            if (isNaN(expiry.getTime())) {
              throw new ValidationError('Invalid expiry date format');
            }
            user.subscriptionExpiry = expiry;
            user.subscriptionRenewalDate = expiry; // Also update renewal date for hybrid model
          }

          // Update last updated timestamp
          user.subscriptionLastUpdated = new Date();

          await user.save();

          // Check if limits decreased and remove excess accounts
          if (tier !== SUBSCRIPTION_TIERS.BASIC) {
            await subscriptionService.removeExcessAccounts(userId);
          }

          // Log history
          await HistoryService.createEntry({
            userId,
            actionType: 'subscription_tier_changed',
            description: `Subscription tier updated to ${tier} by admin ${req.user.email} (bulk operation)`,
            oldValue: { tier: oldTier, baseTier: oldBaseTier, expiry: oldExpiry },
            newValue: { tier: user.subscriptionTier, baseTier: user.baseTier, expiry: user.subscriptionExpiry },
            performedBy: req.user._id.toString(),
            performedByEmail: req.user.email,
          });

          results.success++;
        } catch (error: any) {
          results.failed++;
          results.errors.push(`${userId}: ${error.message}`);
        }
      }

      res.json({
        success: true,
        message: `Updated ${results.success} user(s), ${results.failed} failed`,
        data: results,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get user subscription tier (Admin only)
   * GET /api/subscriptions/admin/:userId/tier
   */
  getUserTier = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Check if user is admin
      if (!req.user || req.user.role !== 'admin') {
        throw new ValidationError('Admin access required');
      }

      const { userId } = req.params;

      if (!userId) {
        throw new ValidationError('User ID is required');
      }

      // Find user
      const user = await User.findById(userId).select('subscriptionTier subscriptionExpiry email name').lean();
      if (!user) {
        throw new ValidationError('User not found');
      }

      res.json({
        success: true,
        data: {
          userId: user._id,
          tier: user.subscriptionTier || SUBSCRIPTION_TIERS.FULL_ACCESS,
          expiryDate: user.subscriptionExpiry,
          email: user.email,
          name: user.name,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * List all users with subscription info (Admin only)
   * GET /api/subscriptions/admin/users
   */
  listUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Check if user is admin
      if (!req.user || req.user.role !== 'admin') {
        throw new ValidationError('Admin access required');
      }

      const { 
        page = 1, 
        limit = 50, 
        search = '', 
        tier = '',
        status = '', // 'active', 'blocked', 'expired'
        userId = '',
        dateFrom = '',
        dateTo = '',
      } = req.query;

      // Build query
      const query: any = {};
      const andConditions: any[] = [];
      
      // Search by email, name, or user ID
      if (search) {
        const searchStr = String(search);
        const searchRegex = { $regex: searchStr, $options: 'i' };
        const searchConditions: any[] = [
          { email: searchRegex },
          { name: searchRegex },
        ];
        
        // If search looks like an ObjectId, also search by _id
        if (searchStr.match(/^[0-9a-fA-F]{24}$/)) {
          searchConditions.push({ _id: searchStr });
        }
        
        andConditions.push({ $or: searchConditions });
      }

      // Search by specific user ID
      if (userId) {
        const userIdStr = String(userId);
        if (userIdStr.match(/^[0-9a-fA-F]{24}$/)) {
          query._id = userIdStr;
        }
      }

      // Filter by subscription tier
      if (tier && (tier === SUBSCRIPTION_TIERS.EA_LICENSE || tier === SUBSCRIPTION_TIERS.FULL_ACCESS || tier === SUBSCRIPTION_TIERS.BASIC)) {
        if (tier === SUBSCRIPTION_TIERS.BASIC) {
          andConditions.push({
            $or: [
              { subscriptionTier: SUBSCRIPTION_TIERS.BASIC, baseTier: null },
              { subscriptionTier: { $exists: false } },
            ],
          });
        } else {
          andConditions.push({
            $or: [
              { subscriptionTier: tier },
              { baseTier: tier },
            ],
          });
        }
      }

      // Filter by status
      if (status) {
        if (status === 'blocked') {
          query.isActive = false;
        } else if (status === 'active') {
          query.isActive = true;
        }
        // 'expired' status will be handled after fetching users
      }

      // Filter by registration date range
      if (dateFrom || dateTo) {
        const dateFilter: any = {};
        if (dateFrom) {
          const fromDate = new Date(dateFrom as string);
          fromDate.setHours(0, 0, 0, 0);
          dateFilter.$gte = fromDate;
        }
        if (dateTo) {
          const toDate = new Date(dateTo as string);
          toDate.setHours(23, 59, 59, 999);
          dateFilter.$lte = toDate;
        }
        query.createdAt = dateFilter;
      }

      // Combine all conditions with $and if we have multiple $or conditions
      if (andConditions.length > 0) {
        if (Object.keys(query).length > 0 || andConditions.length > 1) {
          query.$and = andConditions;
        } else {
          // If only one $or condition and no other query params, merge it directly
          Object.assign(query, andConditions[0]);
        }
      }

      // Get users with pagination
      const skip = (Number(page) - 1) * Number(limit);
      const users = await User.find(query)
        .select('_id email name subscriptionTier subscriptionExpiry subscriptionRenewalDate baseTier isActive emailVerified role createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean();

      const total = await User.countDocuments(query);

      // Format response with dynamic tier calculation (same logic as getHybridSubscription)
      const now = new Date();
      const formattedUsers = await Promise.all(users.map(async (user) => {
        // Use the same dynamic calculation logic as getHybridSubscription
        const subscription = await subscriptionService.getHybridSubscription(user._id.toString());
        
        // Determine if user had expired subscription (moved to BASIC after expiry)
        const hadExpiredSubscription = subscription.subscriptionTier === 'BASIC' && subscription.baseTier !== null;
        
        // Calculate expiry status: check if expiry date has passed
        const expiryDate = subscription.renewalDate || user.subscriptionExpiry;
        const isExpiredByDate = expiryDate ? new Date(expiryDate) < now : false;
        
        // For admin view: show expired if expiry date has passed OR if in grace period OR moved to BASIC after expiry
        const isExpired = isExpiredByDate || subscription.isExpired || hadExpiredSubscription;
        
        return {
          _id: user._id,
          email: user.email,
          name: user.name,
          tier: subscription.subscriptionTier, // Use dynamically calculated tier
          expiryDate: expiryDate,
          isExpired: isExpired, // Show expired if expiry date passed, in grace period, OR moved to BASIC after expiry
          baseTier: subscription.baseTier, // Include baseTier to help frontend determine status
          isActive: user.isActive,
          emailVerified: user.emailVerified,
          role: user.role,
          createdAt: user.createdAt,
        };
      }));

      // Filter by expired status if requested
      let filteredUsers = formattedUsers;
      if (status === 'expired') {
        filteredUsers = formattedUsers.filter((u: any) => u.isExpired);
      } else if (status === 'active' && !query.isActive) {
        // If status is 'active', also filter out expired subscriptions
        filteredUsers = formattedUsers.filter((u: any) => u.isActive && !u.isExpired);
      }

      // Recalculate total if we filtered by expired status
      const finalTotal = status === 'expired' ? filteredUsers.length : total;

      res.json({
        success: true,
        data: {
          users: filteredUsers,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total: finalTotal,
            pages: Math.ceil(finalTotal / Number(limit)),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  };

  // ============================================
  // Hybrid Subscription Model Endpoints (Option D)
  // ============================================

  /**
   * Get hybrid subscription details
   * GET /api/subscriptions/hybrid
   */
  getHybridSubscription = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ValidationError('User not authenticated');
      }

      const subscription = await subscriptionService.getHybridSubscription(req.user._id.toString());

      res.json({
        success: true,
        data: subscription,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Add add-on to subscription
   * POST /api/subscriptions/add-ons
   * Body: { type: 'master' | 'slave', quantity: number }
   */
  addAddOn = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ValidationError('User not authenticated');
      }

      const { type, quantity = 1 } = req.body;

      if (!type || (type !== 'master' && type !== 'slave')) {
        throw new ValidationError('Type must be "master" or "slave"');
      }

      if (typeof quantity !== 'number' || quantity < 1) {
        throw new ValidationError('Quantity must be a positive number');
      }

      await subscriptionService.addAddOn(req.user._id.toString(), type, quantity);

      const updated = await subscriptionService.getHybridSubscription(req.user._id.toString());

      res.json({
        success: true,
        message: `Added ${quantity} ${type} add-on(s) successfully`,
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Remove add-on from subscription
   * DELETE /api/subscriptions/add-ons
   * Body: { type: 'master' | 'slave', quantity: number }
   */
  removeAddOn = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ValidationError('User not authenticated');
      }

      const { type, quantity = 1 } = req.body;

      if (!type || (type !== 'master' && type !== 'slave')) {
        throw new ValidationError('Type must be "master" or "slave"');
      }

      if (typeof quantity !== 'number' || quantity < 1) {
        throw new ValidationError('Quantity must be a positive number');
      }

      await subscriptionService.removeAddOn(req.user._id.toString(), type, quantity);

      const updated = await subscriptionService.getHybridSubscription(req.user._id.toString());

      res.json({
        success: true,
        message: `Removed ${quantity} ${type} add-on(s) successfully`,
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Set base tier (Admin only)
   * PUT /api/subscriptions/admin/:userId/base-tier
   * Body: { baseTier: 'EA_LICENSE' | 'FULL_ACCESS', renewalDate?: string }
   */
  setBaseTier = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || req.user.role !== 'admin') {
        throw new ValidationError('Admin access required');
      }

      const { userId } = req.params;
      const { baseTier, renewalDate } = req.body;

      if (!userId) {
        throw new ValidationError('User ID is required');
      }

      if (!baseTier || !Object.values(SUBSCRIPTION_TIERS).includes(baseTier)) {
        throw new ValidationError('Valid baseTier is required (EA_LICENSE or FULL_ACCESS)');
      }

      let renewal: Date | undefined;
      if (renewalDate) {
        renewal = new Date(renewalDate);
        if (isNaN(renewal.getTime())) {
          throw new ValidationError('Invalid renewal date format');
        }
      }

      await subscriptionService.setBaseTier(userId, baseTier as 'EA_LICENSE' | 'FULL_ACCESS', renewal);

      const updated = await subscriptionService.getHybridSubscription(userId);

      logger.info(`Admin ${req.user._id} set base tier for user ${userId} to ${baseTier}`);

      res.json({
        success: true,
        message: 'Base tier set successfully',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Update renewal date (Admin only)
   * PUT /api/subscriptions/admin/:userId/renewal-date
   * Body: { renewalDate: string (ISO date) }
   */
  updateRenewalDate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || req.user.role !== 'admin') {
        throw new ValidationError('Admin access required');
      }

      const { userId } = req.params;
      const { renewalDate } = req.body;

      if (!userId) {
        throw new ValidationError('User ID is required');
      }

      if (!renewalDate) {
        throw new ValidationError('Renewal date is required');
      }

      const renewal = new Date(renewalDate);
      if (isNaN(renewal.getTime())) {
        throw new ValidationError('Invalid renewal date format');
      }

      await subscriptionService.updateRenewalDate(userId, renewal);

      logger.info(`Admin ${req.user._id} updated renewal date for user ${userId} to ${renewalDate}`);

      res.json({
        success: true,
        message: 'Renewal date updated successfully',
        data: {
          renewalDate: renewal.toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get hybrid subscription for a user (Admin only)
   * GET /api/subscriptions/admin/:userId/hybrid
   */
  getHybridSubscriptionAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || req.user.role !== 'admin') {
        throw new ValidationError('Admin access required');
      }

      const { userId } = req.params;

      if (!userId) {
        throw new ValidationError('User ID is required');
      }

      const subscription = await subscriptionService.getHybridSubscription(userId);

      res.json({
        success: true,
        data: subscription,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Add add-on for a user (Admin only)
   * POST /api/subscriptions/admin/:userId/add-ons
   * Body: { type: 'master' | 'slave', quantity: number }
   */
  addAddOnAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || req.user.role !== 'admin') {
        throw new ValidationError('Admin access required');
      }

      const { userId } = req.params;
      const { type, quantity = 1 } = req.body;

      if (!userId) {
        throw new ValidationError('User ID is required');
      }

      if (!type || (type !== 'master' && type !== 'slave')) {
        throw new ValidationError('Type must be "master" or "slave"');
      }

      if (typeof quantity !== 'number' || quantity < 1) {
        throw new ValidationError('Quantity must be a positive number');
      }

      await subscriptionService.addAddOn(userId, type, quantity);

      const updated = await subscriptionService.getHybridSubscription(userId);

      logger.info(`Admin ${req.user._id} added ${quantity} ${type} add-on(s) for user ${userId}`);

      res.json({
        success: true,
        message: `Added ${quantity} ${type} add-on(s) successfully`,
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Remove add-on for a user (Admin only)
   * DELETE /api/subscriptions/admin/:userId/add-ons
   * Body: { type: 'master' | 'slave', quantity: number }
   */
  removeAddOnAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || req.user.role !== 'admin') {
        throw new ValidationError('Admin access required');
      }

      const { userId } = req.params;
      const { type, quantity = 1 } = req.body;

      if (!userId) {
        throw new ValidationError('User ID is required');
      }

      if (!type || (type !== 'master' && type !== 'slave')) {
        throw new ValidationError('Type must be "master" or "slave"');
      }

      if (typeof quantity !== 'number' || quantity < 1) {
        throw new ValidationError('Quantity must be a positive number');
      }

      await subscriptionService.removeAddOn(userId, type, quantity);

      const updated = await subscriptionService.getHybridSubscription(userId);

      logger.info(`Admin ${req.user._id} removed ${quantity} ${type} add-on(s) for user ${userId}`);

      res.json({
        success: true,
        message: `Removed ${quantity} ${type} add-on(s) successfully`,
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  };

  // ============================================
  // Trial System Endpoints
  // ============================================

  /**
   * Claim free trial (User)
   * POST /api/subscriptions/claim-trial
   */
  claimTrial = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ValidationError('User not authenticated');
      }

      await subscriptionService.claimTrial(req.user._id.toString());

      res.json({
        success: true,
        message: 'Free trial activated successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Reset trial for a user (Admin only)
   * POST /api/subscriptions/admin/:userId/reset-trial
   */
  resetTrialAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || req.user.role !== 'admin') {
        throw new ValidationError('Admin access required');
      }

      const { userId } = req.params;

      if (!userId) {
        throw new ValidationError('User ID is required');
      }

      await subscriptionService.resetTrial(userId);

      logger.info(`Admin ${req.user._id} reset trial for user ${userId}`);

      res.json({
        success: true,
        message: 'Trial reset successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Disable/Revoke trial for a user (Admin only)
   * POST /api/subscriptions/admin/:userId/disable-trial
   */
  disableTrialAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || req.user.role !== 'admin') {
        throw new ValidationError('Admin access required');
      }

      const { userId } = req.params;

      if (!userId) {
        throw new ValidationError('User ID is required');
      }

      await subscriptionService.disableTrial(userId);

      const updated = await subscriptionService.getHybridSubscription(userId);

      logger.info(`Admin ${req.user._id} disabled trial for user ${userId}`);

      res.json({
        success: true,
        message: 'Trial disabled successfully. User moved to BASIC tier.',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  };

  // ============================================
  // Client & Discount Endpoints
  // ============================================

  /**
   * Set client status and discount (Admin only)
   * PUT /api/subscriptions/admin/:userId/client-status
   * Body: { isClient: boolean, clientDiscountPercentage?: number }
   */
  setClientStatusAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || req.user.role !== 'admin') {
        throw new ValidationError('Admin access required');
      }

      const { userId } = req.params;
      const { isClient, clientDiscountPercentage } = req.body;

      if (!userId) {
        throw new ValidationError('User ID is required');
      }

      if (typeof isClient !== 'boolean') {
        throw new ValidationError('isClient must be a boolean');
      }

      await subscriptionService.setClientStatus(userId, isClient, clientDiscountPercentage);

      const updated = await subscriptionService.getHybridSubscription(userId);

      logger.info(`Admin ${req.user._id} updated client status for user ${userId}`);

      res.json({
        success: true,
        message: 'Client status updated successfully',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Set special discount (Admin only)
   * PUT /api/subscriptions/admin/:userId/special-discount
   * Body: { discountPercentage: number, expiryDate: string, description?: string }
   */
  setSpecialDiscountAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || req.user.role !== 'admin') {
        throw new ValidationError('Admin access required');
      }

      const { userId } = req.params;
      const { discountPercentage, expiryDate, description } = req.body;

      if (!userId) {
        throw new ValidationError('User ID is required');
      }

      if (typeof discountPercentage !== 'number' || discountPercentage < 0 || discountPercentage > 100) {
        throw new ValidationError('discountPercentage must be a number between 0 and 100');
      }

      if (!expiryDate) {
        throw new ValidationError('expiryDate is required');
      }

      const expiry = new Date(expiryDate);
      if (isNaN(expiry.getTime())) {
        throw new ValidationError('Invalid expiryDate format');
      }

      await subscriptionService.setSpecialDiscount(userId, discountPercentage, expiry, description);

      const updated = await subscriptionService.getHybridSubscription(userId);

      logger.info(`Admin ${req.user._id} set special discount for user ${userId}`);

      res.json({
        success: true,
        message: 'Special discount set successfully',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Remove special discount (Admin only)
   * DELETE /api/subscriptions/admin/:userId/special-discount
   */
  removeSpecialDiscountAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || req.user.role !== 'admin') {
        throw new ValidationError('Admin access required');
      }

      const { userId } = req.params;

      if (!userId) {
        throw new ValidationError('User ID is required');
      }

      await subscriptionService.removeSpecialDiscount(userId);

      const updated = await subscriptionService.getHybridSubscription(userId);

      logger.info(`Admin ${req.user._id} removed special discount for user ${userId}`);

      res.json({
        success: true,
        message: 'Special discount removed successfully',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const subscriptionController = new SubscriptionController();

