import mongoose from 'mongoose';
import { User, Subscription, ISubscription, MT5Account, CopyLink } from '../../models';
import { SUBSCRIPTION_STATUS, SUBSCRIPTION_PLANS, SUBSCRIPTION_TIERS, BASE_TIER_LIMITS, TRIAL_LIMITS, GRACE_PERIOD_DAYS } from '../../config/constants';
import { HistoryService } from '../history/historyService';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { config } from '../../config/env';
import { globalConfigService } from '../config/globalConfigService';

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  billingCycle: 'monthly' | 'yearly';
  maxAccounts: number;
  features: {
    copyTrading: boolean;
    remoteControl: boolean;
    templates: boolean;
    rulesEngine: boolean;
    multiMaster: boolean;
    apiAccess: boolean;
  };
}

// Get subscription plans from global config
async function getSubscriptionPlansConfig(): Promise<Record<string, SubscriptionPlan>> {
  const globalConfig = await globalConfigService.getConfig();
  const pricing = globalConfig.subscriptionPricing;
  const features = globalConfig.subscriptionPricing.features;

  return {
    basic_monthly: {
      id: 'basic_monthly',
      name: 'Basic Plan (Monthly)',
      price: pricing.basic.monthly,
      billingCycle: 'monthly',
      maxAccounts: pricing.basic.maxAccounts,
      features: features.basic,
    },
    basic_yearly: {
      id: 'basic_yearly',
      name: 'Basic Plan (Yearly)',
      price: pricing.basic.yearly,
      billingCycle: 'yearly',
      maxAccounts: pricing.basic.maxAccounts,
      features: features.basic,
    },
    pro_monthly: {
      id: 'pro_monthly',
      name: 'Pro Plan (Monthly)',
      price: pricing.pro.monthly,
      billingCycle: 'monthly',
      maxAccounts: pricing.pro.maxAccounts,
      features: features.pro,
    },
    pro_yearly: {
      id: 'pro_yearly',
      name: 'Pro Plan (Yearly)',
      price: pricing.pro.yearly,
      billingCycle: 'yearly',
      maxAccounts: pricing.pro.maxAccounts,
      features: features.pro,
    },
    enterprise_monthly: {
      id: 'enterprise_monthly',
      name: 'Enterprise Plan (Monthly)',
      price: pricing.enterprise.monthly,
      billingCycle: 'monthly',
      maxAccounts: pricing.enterprise.maxAccounts,
      features: features.enterprise,
    },
    enterprise_yearly: {
      id: 'enterprise_yearly',
      name: 'Enterprise Plan (Yearly)',
      price: pricing.enterprise.yearly,
      billingCycle: 'yearly',
      maxAccounts: pricing.enterprise.maxAccounts,
      features: features.enterprise,
    },
  };
}

export class SubscriptionService {
  /**
   * Get available subscription plans
   */
  async getAvailablePlans(): Promise<SubscriptionPlan[]> {
    const plansConfig = await getSubscriptionPlansConfig();
    return Object.values(plansConfig);
  }

  /**
   * Get plan by ID
   */
  async getPlanById(planId: string): Promise<SubscriptionPlan | null> {
    const plansConfig = await getSubscriptionPlansConfig();
    return plansConfig[planId] || null;
  }

  /**
   * Check if user has active subscription
   */
  async isSubscriptionActive(userId: string): Promise<boolean> {
    const subscription = await Subscription.findOne({
      userId,
      status: SUBSCRIPTION_STATUS.ACTIVE,
      currentPeriodEnd: { $gte: new Date() },
    });

    return !!subscription;
  }

  /**
   * Get user's current subscription
   */
  async getCurrentSubscription(userId: string): Promise<ISubscription | null> {
    try {
      // Check if MongoDB is connected
      const mongoose = require('mongoose');
      if (mongoose.connection.readyState !== 1) {
        logger.warn('MongoDB not connected, returning null subscription');
        return null;
      }

      let subscription = await Subscription.findOne({
        userId,
        status: SUBSCRIPTION_STATUS.ACTIVE,
        currentPeriodEnd: { $gte: new Date() },
      }).sort({ createdAt: -1 });

      // In development, create a default subscription if none exists
      if (!subscription && config.nodeEnv === 'development') {
        try {
          subscription = await this.createDefaultSubscription(userId) as Awaited<ReturnType<typeof Subscription.findOne>>;
        } catch (createError) {
          logger.error('Error creating default subscription:', createError);
          // Return null if creation fails
          return null;
        }
      }

      return subscription as ISubscription | null;
    } catch (error) {
      logger.error('Error getting current subscription:', error);
      return null; // Return null instead of throwing
    }
  }

  /**
   * Create default subscription for development/testing
   */
  private async createDefaultSubscription(userId: string): Promise<ISubscription> {
    // Check if MongoDB is connected
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
      throw new Error('MongoDB not connected');
    }

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setFullYear(periodEnd.getFullYear() + 1); // 1 year from now

    const defaultSubscription = new Subscription({
      userId,
      planType: 'pro',
      billingCycle: 'monthly',
      status: SUBSCRIPTION_STATUS.ACTIVE,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      maxAccounts: 5, // Default 5 accounts for testing
      features: {
        copyTrading: true,
        remoteControl: true,
        templates: true,
        rulesEngine: true,
        multiMaster: true,
        apiAccess: false,
      },
    });

    await defaultSubscription.save();
    logger.info(`Default subscription created for user: ${userId} (development mode)`);
    
    return defaultSubscription;
  }

  /**
   * Check if user has access to a feature
   */
  async hasFeatureAccess(userId: string, feature: string): Promise<boolean> {
    const subscription = await this.getCurrentSubscription(userId);

    if (!subscription) {
      return false;
    }

    const featureKey = feature as keyof typeof subscription.features;
    return subscription.features[featureKey] || false;
  }

  /**
   * Check if user can add more accounts
   */
  async canAddAccount(userId: string): Promise<boolean> {
    const subscription = await this.getCurrentSubscription(userId);

    if (!subscription) {
      return false;
    }

    const accountCount = await MT5Account.countDocuments({
      userId,
      status: { $in: ['active', 'offline'] },
    });

    return accountCount < subscription.maxAccounts;
  }

  /**
   * Create subscription (after Stripe payment)
   */
  async createSubscription(
    userId: string,
    planId: string,
    stripeData: {
      subscriptionId: string;
      customerId: string;
    }
  ): Promise<ISubscription> {
    const plan = await this.getPlanById(planId);

    if (!plan) {
      throw new ValidationError('Invalid plan ID');
    }

    // Cancel existing active subscriptions
    await Subscription.updateMany(
      {
        userId,
        status: SUBSCRIPTION_STATUS.ACTIVE,
      },
      {
        status: SUBSCRIPTION_STATUS.CANCELLED,
        cancelledAt: new Date(),
      }
    );

    // Calculate period dates
    const now = new Date();
    const periodStart = now;
    const periodEnd = new Date(now);

    if (plan.billingCycle === 'monthly') {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    } else {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    }

    // Create new subscription
    const subscription = new Subscription({
      userId,
      planType: plan.id.split('_')[0] as 'basic' | 'pro' | 'enterprise',
      billingCycle: plan.billingCycle,
      status: SUBSCRIPTION_STATUS.ACTIVE,
      stripeSubscriptionId: stripeData.subscriptionId,
      stripeCustomerId: stripeData.customerId,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      maxAccounts: plan.maxAccounts,
      features: plan.features,
    });

    await subscription.save();

    logger.info(`Subscription created for user: ${userId}, plan: ${planId}`);

    return subscription;
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(userId: string): Promise<void> {
    const subscription = await this.getCurrentSubscription(userId);

    if (!subscription) {
      throw new NotFoundError('No active subscription found');
    }

    subscription.status = SUBSCRIPTION_STATUS.CANCELLED;
    subscription.cancelledAt = new Date();
    await subscription.save();

    logger.info(`Subscription cancelled for user: ${userId}`);
  }

  /**
   * Update subscription from Stripe webhook
   */
  async updateFromWebhook(stripeEvent: any): Promise<void> {
    // This will be implemented when we add Stripe service
    // For now, just a placeholder
    logger.info('Subscription webhook received:', stripeEvent.type);
  }

  // ============================================
  // Hybrid Subscription Model Methods (Option D)
  // ============================================

  /**
   * Get hybrid subscription details for a user
   */
  async getHybridSubscription(userId: string): Promise<{
    subscriptionTier: 'BASIC' | 'EA_LICENSE' | 'FULL_ACCESS';
    baseTier: 'EA_LICENSE' | 'FULL_ACCESS' | null;
    additionalMasters: number;
    additionalSlaves: number;
    renewalDate: Date | null;
    startDate: Date | null;
    isExpired: boolean;
    gracePeriodEndDate: Date | null;
    trialClaimed: boolean;
    trialExpiryDate: Date | null;
    trialExpired: boolean;
    trialDisabled: boolean;
    trialEnabled: boolean;
    isClient: boolean;
    clientDiscountEnabled: boolean;
    clientDiscountPercentage: number;
    globalOffersEnabled: boolean;
    specialDiscountPercentage: number;
    specialDiscountExpiryDate: Date | null;
    specialDiscountDescription: string | null;
    limits: {
      totalMasters: number;
      totalSlaves: number;
    };
  }> {
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const now = new Date();
    const baseTier = (user.baseTier as 'EA_LICENSE' | 'FULL_ACCESS') || null;
    
    // Check subscription expiry and determine current tier dynamically
    const renewalDate = user.subscriptionRenewalDate || user.subscriptionExpiry;
    let isExpired = false;
    let gracePeriodEndDate: Date | null = null;
    let currentTier = (user.subscriptionTier as 'BASIC' | 'EA_LICENSE' | 'FULL_ACCESS') || SUBSCRIPTION_TIERS.BASIC;
    
    // If user has a base tier (paid subscription), check expiry
    if (baseTier && renewalDate) {
      const expiryDate = new Date(renewalDate);
      
      // Always calculate grace period end date dynamically from expiry date
      gracePeriodEndDate = new Date(expiryDate.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
      
      if (expiryDate < now) {
        // Subscription expired - check if grace period has ended
        if (now > gracePeriodEndDate) {
          // Grace period ended - user should be in BASIC tier
          currentTier = SUBSCRIPTION_TIERS.BASIC;
          isExpired = false; // No longer expired, just in BASIC tier
        } else {
          // Still in grace period - keep base tier but mark as expired
          currentTier = baseTier; // Keep the base tier during grace period
          isExpired = true;
        }
      } else {
        // Subscription is active (not expired yet)
        isExpired = false;
        // If user has base tier, they should be on that tier
        if (baseTier) {
          currentTier = baseTier;
        }
        // Grace period end date is not relevant for active subscriptions
        gracePeriodEndDate = null;
      }
    } else if (!baseTier) {
      // No base tier - user is in BASIC tier
      currentTier = SUBSCRIPTION_TIERS.BASIC;
      isExpired = false;
      gracePeriodEndDate = null;
    }
    
    // Get global config once for trial limits and other config values
    const globalConfig = await globalConfigService.getConfig();

    // Calculate limits
    let baseLimits;
    let additionalMasters = user.additionalMasters || 0;
    let additionalSlaves = user.additionalSlaves || 0;
    
    const hasActiveTrial = user.trialClaimed && 
                          user.trialExpiryDate && 
                          new Date(user.trialExpiryDate) > now;
    
    if (hasActiveTrial && currentTier === SUBSCRIPTION_TIERS.BASIC) {
      // Use trial limits from global config
      baseLimits = {
        masters: globalConfig.trial.masters,
        slaves: globalConfig.trial.slaves,
      };
      additionalMasters = 0;
      additionalSlaves = 0;
    } else if (baseTier && currentTier !== SUBSCRIPTION_TIERS.BASIC) {
      // User has active paid subscription
      baseLimits = BASE_TIER_LIMITS[baseTier];
    } else {
      // BASIC tier without trial
      baseLimits = BASE_TIER_LIMITS.BASIC;
      additionalMasters = 0;
      additionalSlaves = 0;
    }

    // Determine if trial expired
    const trialExpired = !!(user.trialClaimed && 
                            user.trialExpiryDate && 
                            new Date(user.trialExpiryDate) <= now);

    // Determine if client discount is enabled for this user
    // Check if globally enabled AND enabled for all users
    // Note: Groups not yet implemented, so we only check enabledForAllUsers for now
    // TODO: When user groups are implemented, also check if user.group is in enabledForGroups
    const clientDiscountEnabled = globalConfig.clientDiscount.enabled && 
                                  globalConfig.clientDiscount.enabledForAllUsers;

    // Determine if global offers (special discount) is enabled
    // Special discount should only be active if global offers are enabled
    const globalOffersEnabled = globalConfig.globalOffers.enabled;

    return {
      subscriptionTier: currentTier,
      baseTier,
      additionalMasters,
      additionalSlaves,
      renewalDate: renewalDate || null,
      startDate: user.subscriptionStartDate || null,
      isExpired,
      gracePeriodEndDate,
      trialClaimed: user.trialClaimed || false,
      trialExpiryDate: user.trialExpiryDate || null,
      trialExpired,
      trialDisabled: user.trialDisabled || false,
      trialEnabled: globalConfig.trial.enabled, // Add global trial enabled status
      isClient: user.isClient || false,
      clientDiscountEnabled, // Client discount enabled based on global config and user eligibility
      // Only return client discount percentage if enabled, otherwise return 0
      clientDiscountPercentage: clientDiscountEnabled ? (user.clientDiscountPercentage || globalConfig.clientDiscount.defaultPercentage) : 0,
      globalOffersEnabled, // Global offers enabled flag
      // Only return special discount if global offers are enabled, otherwise return 0
      specialDiscountPercentage: globalOffersEnabled ? (user.specialDiscountPercentage || 0) : 0,
      specialDiscountExpiryDate: globalOffersEnabled ? (user.specialDiscountExpiryDate || null) : null,
      specialDiscountDescription: globalOffersEnabled ? (user.specialDiscountDescription || null) : null,
      limits: {
        totalMasters: baseLimits.masters + additionalMasters,
        totalSlaves: baseLimits.slaves + additionalSlaves,
      },
    };
  }

  /**
   * Add add-on to subscription (master or slave)
   * Uses unified renewal date - no expiry change
   */
  async addAddOn(
    userId: string,
    type: 'master' | 'slave',
    quantity: number = 1
  ): Promise<void> {
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (quantity < 1) {
      throw new ValidationError('Quantity must be at least 1');
    }

    // Initialize base tier if not set
    if (!user.baseTier) {
      user.baseTier = (user.subscriptionTier as 'EA_LICENSE' | 'FULL_ACCESS') || SUBSCRIPTION_TIERS.EA_LICENSE;
    }

    // Initialize renewal date if not set
    if (!user.subscriptionRenewalDate) {
      const now = new Date();
      const globalConfig = await globalConfigService.getConfig();
      const defaultRenewalDays = globalConfig.defaultRenewalPeriod.days;
      user.subscriptionRenewalDate = user.subscriptionExpiry || new Date(now.getTime() + defaultRenewalDays * 24 * 60 * 60 * 1000);
    }

    // Initialize start date if not set
    if (!user.subscriptionStartDate) {
      user.subscriptionStartDate = new Date();
    }

    // Store old values for history
    const oldMasters = user.additionalMasters || 0;
    const oldSlaves = user.additionalSlaves || 0;

    // Add add-on
    if (type === 'master') {
      user.additionalMasters = (user.additionalMasters || 0) + quantity;
    } else {
      user.additionalSlaves = (user.additionalSlaves || 0) + quantity;
    }

    // Update last updated timestamp
    user.subscriptionLastUpdated = new Date();

    await user.save();

      // Log history
      await HistoryService.createEntry({
        userId: userId,
        actionType: 'addon_added',
        description: `Added ${quantity} ${type} add-on(s)`,
        oldValue: { additionalMasters: oldMasters, additionalSlaves: oldSlaves },
        newValue: { additionalMasters: user.additionalMasters, additionalSlaves: user.additionalSlaves },
      });

    // After adding add-ons, no need to remove accounts (limits increased)
    // But we still check to ensure consistency
    // await this.removeExcessAccounts(userId); // Not needed when adding

    logger.info(`Add-on added for user ${userId}: ${quantity} ${type}(s)`, {
      userId,
      type,
      quantity,
      additionalMasters: user.additionalMasters,
      additionalSlaves: user.additionalSlaves,
      renewalDate: user.subscriptionRenewalDate,
    });
  }

  /**
   * Remove add-on from subscription
   * Uses unified renewal date - no expiry change
   */
  async removeAddOn(
    userId: string,
    type: 'master' | 'slave',
    quantity: number = 1
  ): Promise<void> {
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (quantity < 1) {
      throw new ValidationError('Quantity must be at least 1');
    }

    // Store old values for history
    const oldMasters = user.additionalMasters || 0;
    const oldSlaves = user.additionalSlaves || 0;

    // Remove add-on
    if (type === 'master') {
      const current = user.additionalMasters || 0;
      user.additionalMasters = Math.max(0, current - quantity);
    } else {
      const current = user.additionalSlaves || 0;
      user.additionalSlaves = Math.max(0, current - quantity);
    }

    // Update last updated timestamp
    user.subscriptionLastUpdated = new Date();

    await user.save();

    // Log history
    await HistoryService.createEntry({
      userId: userId,
      actionType: 'addon_removed',
      description: `Removed ${quantity} ${type} add-on(s)`,
      oldValue: { additionalMasters: oldMasters, additionalSlaves: oldSlaves },
      newValue: { additionalMasters: user.additionalMasters, additionalSlaves: user.additionalSlaves },
    });

    logger.info(`Add-on removed for user ${userId}: ${quantity} ${type}(s)`, {
      userId,
      type,
      quantity,
      additionalMasters: user.additionalMasters,
      additionalSlaves: user.additionalSlaves,
    });

    // After removing add-ons, check and remove excess accounts
    await this.removeExcessAccounts(userId);
  }

  /**
   * Remove excess accounts when subscription limits decrease
   * Removes accounts in order: standalone first, then slaves, then masters (oldest first)
   */
  async removeExcessAccounts(userId: string): Promise<void> {
    const user = await User.findById(userId);
    if (!user) {
      logger.warn(`removeExcessAccounts: User ${userId} not found`);
      return;
    }

    // Get current subscription limits
    const subscription = await this.getHybridSubscription(userId);
    const maxMasters = subscription.limits.totalMasters;
    const maxSlaves = subscription.limits.totalSlaves;

    logger.info(`removeExcessAccounts: Checking user ${userId} - Limits: ${maxMasters} masters, ${maxSlaves} slaves`);

    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Get all accounts
    const allAccounts = await MT5Account.find({ userId: userObjectId })
      .sort({ createdAt: 1 }) // Oldest first
      .lean();

    logger.info(`removeExcessAccounts: Found ${allAccounts.length} total accounts for user ${userId}`);

    const masterAccounts = allAccounts.filter((acc: any) => acc.accountType === 'master');
    const slaveAccounts = allAccounts.filter((acc: any) => acc.accountType === 'slave');
    const standaloneAccounts = allAccounts.filter((acc: any) => acc.accountType === 'standalone');

    logger.info(`removeExcessAccounts: Breakdown - Masters: ${masterAccounts.length}, Slaves: ${slaveAccounts.length}, Standalone: ${standaloneAccounts.length}`);

    const accountsToDelete: any[] = [];

    // Remove excess master accounts (oldest first)
    if (masterAccounts.length > maxMasters) {
      const excess = masterAccounts.length - maxMasters;
      logger.info(`removeExcessAccounts: Found ${excess} excess master account(s)`);
      accountsToDelete.push(...masterAccounts.slice(0, excess));
    }

    // Remove excess slave accounts (oldest first)
    if (slaveAccounts.length > maxSlaves) {
      const excess = slaveAccounts.length - maxSlaves;
      logger.info(`removeExcessAccounts: Found ${excess} excess slave account(s)`);
      accountsToDelete.push(...slaveAccounts.slice(0, excess));
    }

    // If still over total limit, remove standalone accounts (oldest first)
    const totalLimit = maxMasters + maxSlaves;
    const currentTotal = masterAccounts.length + slaveAccounts.length + standaloneAccounts.length;
    if (currentTotal > totalLimit) {
      const excess = currentTotal - totalLimit;
      const standaloneToRemove = Math.min(excess, standaloneAccounts.length);
      accountsToDelete.push(...standaloneAccounts.slice(0, standaloneToRemove));
    }

    // Delete accounts and their copy links
    if (accountsToDelete.length > 0) {
      const accountIds = accountsToDelete.map((acc: any) => acc._id);
      
      // Get account IDs for copy link deletion
      const accountIdArray = accountIds.map((id: any) => new mongoose.Types.ObjectId(id));

      // Delete copy links first (where these accounts are master or slave)
      await CopyLink.deleteMany({
        $or: [
          { masterAccountId: { $in: accountIdArray } },
          { slaveAccountId: { $in: accountIdArray } },
        ],
      });

      // Delete the accounts
      await MT5Account.deleteMany({
        _id: { $in: accountIdArray },
      });

      // Log history for each deleted account
      for (const account of accountsToDelete) {
        await HistoryService.createEntry({
          userId: userId,
          actionType: 'account_deleted',
          description: `Account automatically removed due to subscription limit decrease: ${account.accountName} (${account.loginId}) - ${account.accountType}`,
          oldValue: {
            accountId: account._id,
            accountName: account.accountName,
            loginId: account.loginId,
            accountType: account.accountType,
          },
          metadata: {
            reason: 'subscription_limit_decreased',
            newLimits: { masters: maxMasters, slaves: maxSlaves },
          },
        });
      }

      logger.info(`Removed ${accountsToDelete.length} excess account(s) for user ${userId} due to limit decrease`, {
        userId,
        removedAccounts: accountsToDelete.length,
        newLimits: { masters: maxMasters, slaves: maxSlaves },
      });
    }
  }

  /**
   * Set base tier and initialize subscription
   */
  async setBaseTier(
    userId: string,
    baseTier: 'EA_LICENSE' | 'FULL_ACCESS',
    renewalDate?: Date
  ): Promise<void> {
    logger.debug('setBaseTier called', { userId, baseTier, renewalDate: renewalDate?.toISOString() });
    const user = await User.findById(userId);
    if (!user) {
      logger.error('User not found in setBaseTier', { userId });
      throw new NotFoundError('User not found');
    }

    logger.debug('User found in setBaseTier. Current state', {
      currentBaseTier: user.baseTier,
      currentSubscriptionTier: user.subscriptionTier,
      currentIsExpired: user.isExpired,
      currentRenewalDate: user.subscriptionRenewalDate?.toISOString(),
    });

    // Store old base tier to check if limits decreased (before updating)
    const oldBaseTier = user.baseTier;
    const oldAdditionalMasters = user.additionalMasters || 0;
    const oldAdditionalSlaves = user.additionalSlaves || 0;

    user.baseTier = baseTier;
    user.subscriptionTier = baseTier; // Keep for backward compatibility
    user.isExpired = false; // Reset expired status when setting base tier
    user.gracePeriodEndDate = undefined; // Clear grace period

    if (renewalDate) {
      user.subscriptionRenewalDate = renewalDate;
      user.subscriptionExpiry = renewalDate; // Keep for backward compatibility
      logger.debug('Setting renewal date', { renewalDate: renewalDate.toISOString() });
    } else if (!user.subscriptionRenewalDate) {
      // Set default renewal date if not provided
      const now = new Date();
      user.subscriptionRenewalDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
      user.subscriptionExpiry = user.subscriptionRenewalDate; // Keep for backward compatibility
      logger.debug('Setting default renewal date', { renewalDate: user.subscriptionRenewalDate.toISOString() });
    }

    if (!user.subscriptionStartDate) {
      user.subscriptionStartDate = new Date();
    }

    user.subscriptionLastUpdated = new Date();
    
    logger.debug('About to save user in setBaseTier', {
      baseTier: user.baseTier,
      subscriptionTier: user.subscriptionTier,
      isExpired: user.isExpired,
      subscriptionRenewalDate: user.subscriptionRenewalDate?.toISOString(),
      subscriptionExpiry: user.subscriptionExpiry?.toISOString(),
    });
    
    await user.save();
    
    logger.debug('User saved successfully in setBaseTier');

    // Check if moving to a lower tier (limits decreased) and remove excess accounts
    if (oldBaseTier && oldBaseTier !== baseTier) {
      const oldLimits = BASE_TIER_LIMITS[oldBaseTier];
      const newLimits = BASE_TIER_LIMITS[baseTier];
      const oldTotalMasters = oldLimits.masters + (user.additionalMasters || 0);
      const oldTotalSlaves = oldLimits.slaves + (user.additionalSlaves || 0);
      const newTotalMasters = newLimits.masters + (user.additionalMasters || 0);
      const newTotalSlaves = newLimits.slaves + (user.additionalSlaves || 0);
      
      // If limits decreased, remove excess accounts
      if (oldTotalMasters > newTotalMasters || oldTotalSlaves > newTotalSlaves) {
        await this.removeExcessAccounts(userId);
      }
    }

    logger.info(`Base tier set for user ${userId}: ${baseTier}`, {
      userId,
      baseTier,
      renewalDate: user.subscriptionRenewalDate,
    });
  }

  /**
   * Update renewal date (unified for all components)
   */
  async updateRenewalDate(userId: string, renewalDate: Date): Promise<void> {
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    user.subscriptionRenewalDate = renewalDate;
    user.subscriptionExpiry = renewalDate; // Keep for backward compatibility
    user.isExpired = false; // Reset expired status
    user.gracePeriodEndDate = undefined; // Clear grace period
    user.subscriptionLastUpdated = new Date();

    await user.save();

    logger.info(`Renewal date updated for user ${userId}: ${renewalDate.toISOString()}`);
  }

  // ============================================
  // Trial System Methods
  // ============================================

  /**
   * Claim free trial (duration and limits from global config)
   */
  async claimTrial(userId: string): Promise<void> {
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const now = new Date();
    const globalConfig = await globalConfigService.getConfig();

    // Check if trial is enabled globally
    if (!globalConfig.trial.enabled) {
      throw new ValidationError('Trial is currently disabled. Please contact admin.');
    }

    // Check if trial is disabled for this user by admin
    if (user.trialDisabled) {
      throw new ValidationError('Trial has been disabled for your account. Please contact admin.');
    }

    // Check if trial already claimed
    if (user.trialClaimed) {
      if (user.trialExpiryDate && new Date(user.trialExpiryDate) > now) {
        throw new ValidationError('Trial already active');
      }
      // Trial expired, can be reset by admin
      throw new ValidationError('Trial already claimed. Please contact admin to reset.');
    }

    // Set trial using global config values
    user.trialClaimed = true;
    user.trialStartDate = now;
    user.trialExpiryDate = new Date(now.getTime() + globalConfig.trial.durationDays * 24 * 60 * 60 * 1000);
    user.subscriptionTier = SUBSCRIPTION_TIERS.BASIC; // Ensure BASIC tier
    user.subscriptionLastUpdated = new Date();

    await user.save();

    // Log history
    await HistoryService.createEntry({
      userId: userId,
      actionType: 'trial_claimed',
      description: `Free trial claimed - expires on ${user.trialExpiryDate.toISOString()}`,
      newValue: { 
        trialStartDate: user.trialStartDate, 
        trialExpiryDate: user.trialExpiryDate,
        limits: { masters: globalConfig.trial.masters, slaves: globalConfig.trial.slaves }
      },
    });

    logger.info(`Trial claimed for user ${userId}, expires: ${user.trialExpiryDate.toISOString()}`);
  }

  /**
   * Reset trial (Admin only)
   * This clears trial fields and enables trial again (allows user to claim)
   */
  async resetTrial(userId: string): Promise<void> {
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const oldTrialExpiry = user.trialExpiryDate;
    
    user.trialClaimed = false;
    user.trialExpiryDate = undefined;
    user.trialStartDate = undefined;
    
    // Enable trial again (clear disabled flag)
    user.trialDisabled = false;
    
    user.subscriptionLastUpdated = new Date();

    await user.save();

    // Log history
    await HistoryService.createEntry({
      userId: userId,
      actionType: 'trial_reset',
      description: `Trial reset by admin`,
      oldValue: { trialExpiryDate: oldTrialExpiry },
      newValue: { trialClaimed: false },
    });

    logger.info(`Trial reset for user ${userId}`);
  }

  /**
   * Disable/Revoke trial (Admin only)
   * This revokes the trial immediately, moves user to BASIC tier if no paid subscription,
   * and prevents user from claiming trial again until re-enabled
   */
  async disableTrial(userId: string): Promise<void> {
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const oldTrialExpiry = user.trialExpiryDate;
    const oldTrialStart = user.trialStartDate;
    const hadActiveTrial = user.trialClaimed && user.trialExpiryDate && new Date(user.trialExpiryDate) > new Date();
    
    // Clear trial fields
    user.trialClaimed = false;
    user.trialExpiryDate = undefined;
    user.trialStartDate = undefined;
    
    // Disable trial - prevents user from claiming again
    user.trialDisabled = true;

    // If user has no paid subscription (baseTier), move to BASIC tier
    if (!user.baseTier) {
      user.subscriptionTier = SUBSCRIPTION_TIERS.BASIC;
    }

    user.subscriptionLastUpdated = new Date();

    await user.save();

    // If user had an active trial and no paid subscription, remove excess accounts
    if (hadActiveTrial && !user.baseTier) {
      try {
        await this.removeExcessAccounts(userId);
      } catch (error) {
        logger.error(`Error removing excess accounts after trial disable for user ${userId}:`, error);
        // Don't throw - account removal is best effort
      }
    }

    // Log history
    await HistoryService.createEntry({
      userId: userId,
      actionType: 'trial_disabled',
      description: `Trial disabled/revoked by admin. User moved to BASIC tier.`,
      oldValue: { 
        trialClaimed: true,
        trialStartDate: oldTrialStart,
        trialExpiryDate: oldTrialExpiry,
        subscriptionTier: user.subscriptionTier,
      },
      newValue: { 
        trialClaimed: false,
        subscriptionTier: SUBSCRIPTION_TIERS.BASIC,
      },
    });

    logger.info(`Trial disabled for user ${userId}, moved to BASIC tier`);
  }

  // ============================================
  // Grace Period Methods
  // ============================================

  /**
   * Check and process grace period (auto-move to BASIC after grace period)
   * This should be called periodically (e.g., via cron job)
   */
  async processGracePeriod(userId: string): Promise<boolean> {
    const user = await User.findById(userId);
    if (!user) {
      return false;
    }

    const now = new Date();
    const expiryDate = user.subscriptionRenewalDate || user.subscriptionExpiry;

    if (!expiryDate || expiryDate >= now) {
      // Not expired
      return false;
    }

    // Always calculate grace period end date dynamically from expiry date
    const gracePeriodEnd = new Date(expiryDate.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

    if (now > gracePeriodEnd) {
      // Grace period ended - move to BASIC
      // Store old values for history before modifying
      const oldTier = user.subscriptionTier;
      const oldBaseTier = user.baseTier;
      
      user.subscriptionTier = SUBSCRIPTION_TIERS.BASIC;
      user.baseTier = null;
      user.isExpired = false;
      user.gracePeriodEndDate = undefined;
      user.subscriptionRenewalDate = undefined;
      user.subscriptionExpiry = undefined;
      user.additionalMasters = 0;
      user.additionalSlaves = 0;
      user.subscriptionLastUpdated = new Date();

      // Delete all MT5 accounts and copy links (as per requirements)
      const userObjectId = new mongoose.Types.ObjectId(userId);
      
      // First, get all account IDs before deleting
      const accountIds = await MT5Account.find({ userId: userObjectId }).select('_id').lean();
      const accountCount = accountIds.length;
      if (accountIds.length > 0) {
        const accountIdArray = accountIds.map((acc: any) => acc._id);
        // Delete copy links first
        await CopyLink.deleteMany({
          $or: [
            { masterAccountId: { $in: accountIdArray } },
            { slaveAccountId: { $in: accountIdArray } },
          ],
        });
      }
      
      // Then delete accounts
      await MT5Account.deleteMany({ userId: userObjectId });

      await user.save();

      // Log history
      await HistoryService.createEntry({
        userId: userId,
        actionType: 'moved_to_basic',
        description: `Subscription expired and grace period ended - moved to BASIC tier. Deleted ${accountCount} account(s) and associated copy links.`,
        oldValue: { tier: oldTier, baseTier: oldBaseTier },
        newValue: { tier: SUBSCRIPTION_TIERS.BASIC, baseTier: null },
        metadata: { 
          gracePeriodEndDate: gracePeriodEnd.toISOString(),
          accountsDeleted: accountCount
        },
      });

      logger.info(`User ${userId} moved to BASIC tier after grace period ended`);
      return true;
    } else {
      // Still in grace period - mark as expired
      // gracePeriodEnd is already calculated above
      if (!user.isExpired) {
        user.isExpired = true;
        // Store grace period end date for reference (but calculation is always dynamic)
        user.gracePeriodEndDate = gracePeriodEnd;
        await user.save();
        logger.info(`User ${userId} marked as expired, grace period ends: ${gracePeriodEnd.toISOString()}`);
      }
      return false;
    }
  }

  // ============================================
  // Client & Discount Methods
  // ============================================

  /**
   * Set client status and discount (Admin only)
   */
  async setClientStatus(
    userId: string,
    isClient: boolean,
    discountPercentage?: number
  ): Promise<void> {
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    user.isClient = isClient;
    if (isClient && discountPercentage !== undefined) {
      user.clientDiscountPercentage = Math.max(0, Math.min(100, discountPercentage));
    } else if (!isClient) {
      user.clientDiscountPercentage = 5; // Reset to default
    }

    user.subscriptionLastUpdated = new Date();
    await user.save();

    logger.info(`Client status updated for user ${userId}: isClient=${isClient}, discount=${user.clientDiscountPercentage}%`);
  }

  /**
   * Set special discount (Admin only)
   */
  async setSpecialDiscount(
    userId: string,
    discountPercentage: number,
    expiryDate: Date,
    description?: string
  ): Promise<void> {
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    user.specialDiscountPercentage = Math.max(0, Math.min(100, discountPercentage));
    user.specialDiscountExpiryDate = expiryDate;
    user.specialDiscountDescription = description || undefined;
    user.subscriptionLastUpdated = new Date();

    await user.save();

    logger.info(`Special discount set for user ${userId}: ${discountPercentage}% until ${expiryDate.toISOString()}`);
  }

  /**
   * Remove special discount
   */
  async removeSpecialDiscount(userId: string): Promise<void> {
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    user.specialDiscountPercentage = 0;
    user.specialDiscountExpiryDate = undefined;
    user.specialDiscountDescription = undefined;
    user.subscriptionLastUpdated = new Date();

    await user.save();

    logger.info(`Special discount removed for user ${userId}`);
  }

  /**
   * Update user's Stripe IDs
   * Used by payment service to update Stripe customer/subscription IDs
   */
  async updateUserStripeIds(userId: string, stripeIds: { stripeCustomerId?: string; stripeSubscriptionId?: string }): Promise<void> {
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (stripeIds.stripeCustomerId) {
      user.stripeCustomerId = stripeIds.stripeCustomerId;
    }
    if (stripeIds.stripeSubscriptionId) {
      user.stripeSubscriptionId = stripeIds.stripeSubscriptionId;
    }

    await user.save();
    logger.info(`Updated Stripe IDs for user ${userId}`);
  }
}

export const subscriptionService = new SubscriptionService();

