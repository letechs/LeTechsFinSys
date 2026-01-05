import { Request, Response, NextFunction } from 'express';
import { Subscription, MT5Account } from '../models';
import { ForbiddenError } from '../utils/errors';
import { SUBSCRIPTION_STATUS } from '../config/constants';
import { subscriptionService } from '../services/subscription/subscriptionService';
import { config } from '../config/env';

interface SubscriptionCheckOptions {
  requireFeature?: string; // e.g., 'copyTrading', 'remoteControl'
  checkAccountLimit?: boolean;
}

export const checkSubscription = (options: SubscriptionCheckOptions = {}) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ForbiddenError('Authentication required');
      }

      // Get hybrid subscription (checks User model fields - baseTier, subscriptionTier, trial, etc.)
      // This is the same method used by accountService.createAccount() for consistency
      // Add timeout to prevent hanging
      const hybridSubscription = await Promise.race([
        subscriptionService.getHybridSubscription(req.user._id.toString()),
        new Promise<any>((resolve) => setTimeout(() => resolve(null), 5000)) // 5 second timeout
      ]);

      // In development, allow users without subscription (with default limits)
      if (!hybridSubscription) {
        if (config.nodeEnv === 'development') {
          // In development, create a mock subscription object with default limits
          (req as any).subscription = {
            maxAccounts: 5, // Default limit for development
            features: {
              copyTrading: true,
              remoteControl: true,
              templates: false,
              rulesEngine: false,
              multiMaster: false,
              apiAccess: false,
            },
          };
          // Skip to account limit check if needed
          if (options.checkAccountLimit) {
            const accountCount = await MT5Account.countDocuments({
              userId: req.user._id,
              status: { $in: ['active', 'offline'] },
            });
            if (accountCount >= 5) {
              throw new ForbiddenError('Account limit reached. Maximum 5 accounts allowed in development.');
            }
          }
          return next();
        }
        throw new ForbiddenError('No active subscription found');
      }

      // Check if user has active subscription
      // User has active subscription if:
      // 1. subscriptionTier is not BASIC, OR
      // 2. subscriptionTier is BASIC but has active trial
      const hasActiveTrial = hybridSubscription.trialClaimed && 
                            hybridSubscription.trialExpiryDate && 
                            new Date(hybridSubscription.trialExpiryDate) > new Date();
      const hasActiveSubscription = hybridSubscription.subscriptionTier !== 'BASIC' || hasActiveTrial;

      if (!hasActiveSubscription) {
        throw new ForbiddenError('No active subscription found');
      }

      // Check feature access (if needed)
      // Note: getHybridSubscription doesn't return features, so we check based on tier
      if (options.requireFeature) {
        // For now, EA_LICENSE and FULL_ACCESS tiers have all features
        // BASIC tier without trial has no features
        if (hybridSubscription.subscriptionTier === 'BASIC' && !hasActiveTrial) {
          throw new ForbiddenError(`Feature '${options.requireFeature}' is not available in your plan`);
        }
      }

      // Check account limit
      if (options.checkAccountLimit) {
        const accountCount = await MT5Account.countDocuments({
          userId: req.user._id,
          status: { $in: ['active', 'offline'] },
        });

        // Total account limit = totalMasters + totalSlaves
        const totalLimit = hybridSubscription.limits.totalMasters + hybridSubscription.limits.totalSlaves;

        if (accountCount >= totalLimit) {
          throw new ForbiddenError(
            `Account limit reached. You have ${totalLimit} total account license(s). ` +
            `Please purchase additional add-ons or upgrade your subscription to add more accounts.`
          );
        }
      }

      // Attach subscription to request (optional, for use in controllers)
      // Convert hybrid subscription format to match expected format for backward compatibility
      (req as any).subscription = {
        maxAccounts: hybridSubscription.limits.totalMasters + hybridSubscription.limits.totalSlaves,
        features: {
          copyTrading: hasActiveSubscription,
          remoteControl: hasActiveSubscription,
          templates: hybridSubscription.subscriptionTier === 'FULL_ACCESS',
          rulesEngine: hybridSubscription.subscriptionTier === 'FULL_ACCESS',
          multiMaster: hybridSubscription.subscriptionTier === 'FULL_ACCESS',
          apiAccess: false, // API access not available yet
        },
      };

      next();
    } catch (error) {
      next(error);
    }
  };
};

