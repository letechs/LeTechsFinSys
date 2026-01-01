import { GlobalConfig, IGlobalConfig } from '../../models/GlobalConfig';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { logger } from '../../utils/logger';

// Use the actual Mongoose document type
type GlobalConfigDocument = InstanceType<typeof GlobalConfig>;

export class GlobalConfigService {
  private static cache: GlobalConfigDocument | null = null;
  private static cacheTimestamp: number = 0;
  private static CACHE_TTL = 60000; // 1 minute cache

  /**
   * Get global config (with caching)
   */
  async getConfig(): Promise<GlobalConfigDocument> {
    const now = Date.now();
    
    // Return cached config if still valid
    if (GlobalConfigService.cache && (now - GlobalConfigService.cacheTimestamp) < GlobalConfigService.CACHE_TTL) {
      return GlobalConfigService.cache;
    }

    // Fetch from database
    let config: GlobalConfigDocument | null = await GlobalConfig.findOne();
    
    // If no config exists, create default one
    if (!config) {
      config = await this.initializeDefaultConfig();
    }

    // At this point, config is guaranteed to be non-null
    const nonNullConfig = config as GlobalConfigDocument;

    // Update cache
    GlobalConfigService.cache = nonNullConfig;
    GlobalConfigService.cacheTimestamp = now;

    return nonNullConfig;
  }

  /**
   * Get specific section of config
   */
  async getConfigSection(section: keyof IGlobalConfig): Promise<any> {
    const config = await this.getConfig();
    return config[section];
  }

  /**
   * Update global config (partial update supported)
   */
  async updateConfig(
    updates: Partial<IGlobalConfig>,
    updatedBy: string
  ): Promise<GlobalConfigDocument> {
    // Validate updates
    this.validateConfigUpdates(updates);

    let config: GlobalConfigDocument | null = await GlobalConfig.findOne();

    if (!config) {
      config = await this.initializeDefaultConfig();
    }

    // At this point, config is guaranteed to be non-null
    const nonNullConfig = config as GlobalConfigDocument;

    // Update fields - handle nested objects properly with deep merge
    const deepMerge = (target: any, source: any): any => {
      const output = { ...target };
      if (typeof source === 'object' && source !== null && !Array.isArray(source) && !(source instanceof Date)) {
        Object.keys(source).forEach((key) => {
          if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) && !(source[key] instanceof Date)) {
            output[key] = deepMerge(target[key] || {}, source[key]);
          } else {
            output[key] = source[key];
          }
        });
      }
      return output;
    };

    Object.keys(updates).forEach((key) => {
      if (key !== '_id' && key !== '__v' && key !== 'createdAt' && key !== 'updatedAt' && key !== 'lastUpdated' && key !== 'lastUpdatedBy' && key !== 'version') {
        const updateValue = (updates as any)[key];
        // If it's a nested object, deep merge it properly
        if (typeof updateValue === 'object' && updateValue !== null && !Array.isArray(updateValue) && !(updateValue instanceof Date)) {
          (nonNullConfig as any)[key] = deepMerge((nonNullConfig as any)[key] || {}, updateValue);
        } else {
          (nonNullConfig as any)[key] = updateValue;
        }
      }
    });

    // Update metadata
    nonNullConfig.lastUpdated = new Date();
    nonNullConfig.lastUpdatedBy = updatedBy;
    nonNullConfig.version = (nonNullConfig.version || 1) + 1;

    await nonNullConfig.save();

    // Invalidate cache
    GlobalConfigService.cache = null;
    GlobalConfigService.cacheTimestamp = 0;

    logger.info(`Global config updated by ${updatedBy}, version: ${nonNullConfig.version}`);

    return nonNullConfig;
  }

  /**
   * Update specific section of config
   */
  async updateConfigSection(
    section: keyof IGlobalConfig,
    sectionData: any,
    updatedBy: string
  ): Promise<GlobalConfigDocument> {
    // Get current config to merge nested objects properly
    const currentConfig = await this.getConfig();
    const currentSection = (currentConfig as any)[section];
    
    // Deep merge for nested objects
    let mergedData: any;
    if (typeof sectionData === 'object' && sectionData !== null && !Array.isArray(sectionData) && !(sectionData instanceof Date)) {
      mergedData = {
        ...currentSection,
        ...sectionData,
      };
      
      // Handle nested objects within the section (e.g., subscriptionPricing.basic, features, etc.)
      Object.keys(sectionData).forEach((key) => {
        if (typeof sectionData[key] === 'object' && sectionData[key] !== null && !Array.isArray(sectionData[key]) && !(sectionData[key] instanceof Date)) {
          mergedData[key] = {
            ...(currentSection[key] || {}),
            ...sectionData[key],
          };
        }
      });
    } else {
      mergedData = sectionData;
    }

    const updates: any = {};
    updates[section] = mergedData;

    return this.updateConfig(updates, updatedBy);
  }

  /**
   * Initialize default config
   */
  private async initializeDefaultConfig(): Promise<GlobalConfigDocument> {
    const defaultConfig = new GlobalConfig({
      lastUpdatedBy: 'system',
    });

    await defaultConfig.save();
    logger.info('Default global config initialized');

    return defaultConfig;
  }

  /**
   * Validate config updates
   */
  private validateConfigUpdates(updates: Partial<IGlobalConfig>): void {
    // Validate subscription pricing
    if (updates.subscriptionPricing) {
      const pricing = updates.subscriptionPricing;
      ['basic', 'pro', 'enterprise'].forEach((tier) => {
        const tierPricing = (pricing as any)[tier];
        if (tierPricing) {
          if (tierPricing.monthly !== undefined && tierPricing.monthly < 0) {
            throw new ValidationError(`${tier} monthly price must be >= 0`);
          }
          if (tierPricing.yearly !== undefined && tierPricing.yearly < 0) {
            throw new ValidationError(`${tier} yearly price must be >= 0`);
          }
          if (tierPricing.maxAccounts !== undefined && tierPricing.maxAccounts < 0) {
            throw new ValidationError(`${tier} maxAccounts must be >= 0`);
          }
        }
      });
    }

    // Validate trial
    if (updates.trial) {
      if (updates.trial.durationDays !== undefined && updates.trial.durationDays < 0) {
        throw new ValidationError('Trial duration must be >= 0');
      }
      if (updates.trial.masters !== undefined && updates.trial.masters < 0) {
        throw new ValidationError('Trial masters must be >= 0');
      }
      if (updates.trial.slaves !== undefined && updates.trial.slaves < 0) {
        throw new ValidationError('Trial slaves must be >= 0');
      }
    }

    // Validate grace period
    if (updates.gracePeriod?.days !== undefined && updates.gracePeriod.days < 0) {
      throw new ValidationError('Grace period days must be >= 0');
    }

    // Validate base tier limits
    if (updates.baseTierLimits) {
      ['BASIC', 'EA_LICENSE', 'FULL_ACCESS'].forEach((tier) => {
        const limits = (updates.baseTierLimits as any)[tier];
        if (limits) {
          if (limits.masters !== undefined && limits.masters < 0) {
            throw new ValidationError(`${tier} masters limit must be >= 0`);
          }
          if (limits.slaves !== undefined && limits.slaves < 0) {
            throw new ValidationError(`${tier} slaves limit must be >= 0`);
          }
        }
      });
    }

    // Validate default renewal period
    if (updates.defaultRenewalPeriod?.days !== undefined && updates.defaultRenewalPeriod.days < 0) {
      throw new ValidationError('Default renewal period days must be >= 0');
    }

    // Validate client discount
    if (updates.clientDiscount) {
      if (updates.clientDiscount.defaultPercentage !== undefined) {
        if (updates.clientDiscount.defaultPercentage < 0 || updates.clientDiscount.defaultPercentage > 100) {
          throw new ValidationError('Client discount percentage must be between 0 and 100');
        }
      }
    }

    // Validate global offers
    if (updates.globalOffers?.currentOffer) {
      const offer = updates.globalOffers.currentOffer;
      if (offer.percentage !== undefined) {
        if (offer.percentage < 0 || offer.percentage > 100) {
          throw new ValidationError('Global offer percentage must be between 0 and 100');
        }
      }
    }

    // Validate add-on pricing
    if (updates.addOnPricing) {
      if (updates.addOnPricing.masterPrice !== undefined && updates.addOnPricing.masterPrice < 0) {
        throw new ValidationError('Master add-on price must be >= 0');
      }
      if (updates.addOnPricing.slavePrice !== undefined && updates.addOnPricing.slavePrice < 0) {
        throw new ValidationError('Slave add-on price must be >= 0');
      }
    }

    // Validate EA defaults
    if (updates.eaDefaults) {
      if (updates.eaDefaults.defaultMasters !== undefined && updates.eaDefaults.defaultMasters < 0) {
        throw new ValidationError('Default masters must be >= 0');
      }
      if (updates.eaDefaults.defaultSlaves !== undefined && updates.eaDefaults.defaultSlaves < 0) {
        throw new ValidationError('Default slaves must be >= 0');
      }
    }
  }

  /**
   * Invalidate cache (call after updates)
   */
  invalidateCache(): void {
    GlobalConfigService.cache = null;
    GlobalConfigService.cacheTimestamp = 0;
  }

  /**
   * Apply global offer to all users or specific groups
   */
  async applyGlobalOfferToUsers(userIds?: string[]): Promise<void> {
    const config = await this.getConfig();
    const { User } = await import('../../models');

    if (!config.globalOffers.enabled || !config.globalOffers.currentOffer.percentage) {
      throw new ValidationError('Global offer is not enabled or has no percentage');
    }

    const offer = config.globalOffers.currentOffer;
    const query: any = {};

    if (userIds && userIds.length > 0) {
      // Apply to specific users
      query._id = { $in: userIds };
    } else if (offer.appliedToAllUsers) {
      // Apply to all users
      query._id = { $exists: true };
    } else if (offer.appliedToGroups.length > 0) {
      // Apply to specific groups (if group field exists in User model)
      // For now, we'll need to implement group logic based on your user model
      throw new ValidationError('User groups not yet implemented');
    } else {
      throw new ValidationError('No users or groups specified for offer');
    }

    // Update users with special discount
    const users = await User.find(query);
    const now = new Date();

    for (const user of users) {
      // Only apply if offer hasn't expired
      if (offer.expiryDate && new Date(offer.expiryDate) < now) {
        continue;
      }

      user.specialDiscountPercentage = offer.percentage;
      user.specialDiscountExpiryDate = offer.expiryDate ? new Date(offer.expiryDate) : undefined;
      user.specialDiscountDescription = offer.description || 'Global Offer';

      await user.save();
    }

    logger.info(`Global offer applied to ${users.length} users`);
  }

  /**
   * Enable/disable trial for all users or specific groups
   */
  async updateTrialForUsers(enabled: boolean, userIds?: string[]): Promise<void> {
    const { User } = await import('../../models');
    const query: any = {};

    if (userIds && userIds.length > 0) {
      query._id = { $in: userIds };
    } else {
      query._id = { $exists: true };
    }

    const users = await User.find(query);

    for (const user of users) {
      user.trialDisabled = !enabled;
      await user.save();
    }

    logger.info(`Trial ${enabled ? 'enabled' : 'disabled'} for ${users.length} users`);
  }
}

export const globalConfigService = new GlobalConfigService();

