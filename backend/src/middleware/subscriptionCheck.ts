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

      // Get active subscription (will auto-create in development if none exists)
      // Add timeout to prevent hanging
      const subscription = await Promise.race([
        subscriptionService.getCurrentSubscription(req.user._id.toString()),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)) // 5 second timeout
      ]);

      // In development, allow users without subscription (with default limits)
      if (!subscription) {
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

      // Check feature access
      if (options.requireFeature) {
        const feature = options.requireFeature as keyof typeof subscription.features;
        
        if (!subscription.features[feature]) {
          throw new ForbiddenError(`Feature '${options.requireFeature}' is not available in your plan`);
        }
      }

      // Check account limit
      if (options.checkAccountLimit) {
        const accountCount = await MT5Account.countDocuments({
          userId: req.user._id,
          status: { $in: ['active', 'offline'] },
        });

        if (accountCount >= subscription.maxAccounts) {
          throw new ForbiddenError(
            `Account limit reached. Maximum ${subscription.maxAccounts} accounts allowed.`
          );
        }
      }

      // Attach subscription to request (optional, for use in controllers)
      (req as any).subscription = subscription;

      next();
    } catch (error) {
      next(error);
    }
  };
};

