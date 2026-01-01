import { Request, Response, NextFunction } from 'express';
import { User } from '../models/User';
import { SUBSCRIPTION_TIERS } from '../config/constants';
import { ForbiddenError, ValidationError } from '../utils/errors';

/**
 * Subscription Tier Check Middleware
 * 
 * Checks if user has required subscription tier
 * Can be used to restrict access to features based on tier
 * 
 * Usage:
 *   router.get('/feature', subscriptionTierCheck('FULL_ACCESS'), controller.method);
 */
export const subscriptionTierCheck = (requiredTier: 'EA_LICENSE' | 'FULL_ACCESS') => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ValidationError('User not authenticated');
      }

      // Get user with subscription tier
      const user = await User.findById(req.user._id).select('subscriptionTier subscriptionExpiry isActive').lean();
      
      if (!user) {
        throw new ValidationError('User not found');
      }

      if (!user.isActive) {
        throw new ForbiddenError('Account is inactive');
      }

      // Get user's tier (default to FULL_ACCESS if not set)
      const userTier = (user.subscriptionTier as 'EA_LICENSE' | 'FULL_ACCESS') || SUBSCRIPTION_TIERS.FULL_ACCESS;

      // Check if subscription is expired
      if (user.subscriptionExpiry && user.subscriptionExpiry < new Date()) {
        throw new ForbiddenError('Subscription expired');
      }

      // Check tier requirement
      if (requiredTier === SUBSCRIPTION_TIERS.FULL_ACCESS) {
        // FULL_ACCESS features require FULL_ACCESS tier
        if (userTier !== SUBSCRIPTION_TIERS.FULL_ACCESS) {
          throw new ForbiddenError('Full Access subscription required');
        }
      } else if (requiredTier === SUBSCRIPTION_TIERS.EA_LICENSE) {
        // EA_LICENSE features require EA_LICENSE or FULL_ACCESS tier
        if (userTier !== SUBSCRIPTION_TIERS.EA_LICENSE && userTier !== SUBSCRIPTION_TIERS.FULL_ACCESS) {
          throw new ForbiddenError('EA License subscription required');
        }
      }

      // Add tier info to request for use in controllers
      (req as any).userTier = userTier;
      (req as any).subscriptionExpiry = user.subscriptionExpiry;

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Check if subscription is expired
 * Returns true if expired, false otherwise
 */
export const isSubscriptionExpired = async (userId: string): Promise<boolean> => {
  try {
    const user = await User.findById(userId).select('subscriptionExpiry').lean();
    if (!user || !user.subscriptionExpiry) {
      return false; // No expiry set = not expired
    }
    return user.subscriptionExpiry < new Date();
  } catch (error) {
    return false; // On error, assume not expired
  }
};

