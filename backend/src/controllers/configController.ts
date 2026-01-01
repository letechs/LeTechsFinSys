import { Request, Response, NextFunction } from 'express';
import { globalConfigService } from '../services/config/globalConfigService';
import { ValidationError } from '../utils/errors';
import { HistoryService } from '../services/history/historyService';
import { logger } from '../utils/logger';

export class ConfigController {
  /**
   * Get all global configuration
   * GET /api/admin/config
   */
  getConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || req.user.role !== 'admin') {
        throw new ValidationError('Admin access required');
      }

      const config = await globalConfigService.getConfig();

      res.json({
        success: true,
        data: config,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get specific config section
   * GET /api/admin/config/:section
   */
  getConfigSection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || req.user.role !== 'admin') {
        throw new ValidationError('Admin access required');
      }

      const { section } = req.params;
      const validSections = [
        'subscriptionPricing',
        'trial',
        'gracePeriod',
        'baseTierLimits',
        'defaultRenewalPeriod',
        'clientDiscount',
        'globalOffers',
        'addOnPricing',
        'eaDefaults',
      ];

      if (!validSections.includes(section)) {
        throw new ValidationError(`Invalid config section: ${section}`);
      }

      const sectionData = await globalConfigService.getConfigSection(section as any);

      res.json({
        success: true,
        data: sectionData,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Update global configuration (full or partial)
   * PUT /api/admin/config
   */
  updateConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || req.user.role !== 'admin') {
        throw new ValidationError('Admin access required');
      }

      const updates = req.body;
      const adminId = req.user._id.toString();
      const adminEmail = req.user.email;

      // Store old config for history
      const oldConfig = await globalConfigService.getConfig();

      // Update config
      const updatedConfig = await globalConfigService.updateConfig(updates, adminId);

      // Log history
      await HistoryService.createEntry({
        userId: adminId,
        actionType: 'config_updated',
        description: `Global configuration updated by admin ${adminEmail}`,
        oldValue: oldConfig.toObject(),
        newValue: updatedConfig.toObject(),
        performedBy: adminId,
        performedByEmail: adminEmail,
        metadata: {
          version: updatedConfig.version,
          sectionsUpdated: Object.keys(updates),
        },
      });

      logger.info(`Global config updated by admin ${adminEmail}`);

      res.json({
        success: true,
        message: 'Configuration updated successfully',
        data: updatedConfig,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Update specific config section
   * PUT /api/admin/config/:section
   */
  updateConfigSection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || req.user.role !== 'admin') {
        throw new ValidationError('Admin access required');
      }

      const { section } = req.params;
      const validSections = [
        'subscriptionPricing',
        'trial',
        'gracePeriod',
        'baseTierLimits',
        'defaultRenewalPeriod',
        'clientDiscount',
        'globalOffers',
        'addOnPricing',
        'eaDefaults',
      ];

      if (!validSections.includes(section)) {
        throw new ValidationError(`Invalid config section: ${section}`);
      }

      const sectionData = req.body;
      const adminId = req.user._id.toString();
      const adminEmail = req.user.email;

      // Store old config for history
      const oldConfig = await globalConfigService.getConfig();

      // Update config section
      const updatedConfig = await globalConfigService.updateConfigSection(
        section as any,
        sectionData,
        adminId
      );

      // Log history
      await HistoryService.createEntry({
        userId: adminId,
        actionType: 'config_updated',
        description: `Global configuration section '${section}' updated by admin ${adminEmail}`,
        oldValue: { [section]: (oldConfig as any)[section] },
        newValue: { [section]: sectionData },
        performedBy: adminId,
        performedByEmail: adminEmail,
        metadata: {
          version: updatedConfig.version,
          section,
        },
      });

      logger.info(`Global config section '${section}' updated by admin ${adminEmail}`);

      res.json({
        success: true,
        message: `Configuration section '${section}' updated successfully`,
        data: updatedConfig,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Apply global offer to users
   * POST /api/admin/config/apply-offer
   */
  applyGlobalOffer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || req.user.role !== 'admin') {
        throw new ValidationError('Admin access required');
      }

      const { userIds } = req.body; // Optional: specific user IDs, or apply to all

      await globalConfigService.applyGlobalOfferToUsers(userIds);

      res.json({
        success: true,
        message: userIds
          ? `Global offer applied to ${userIds.length} users`
          : 'Global offer applied to all eligible users',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Update trial for users (enable/disable)
   * POST /api/admin/config/update-trial
   */
  updateTrialForUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || req.user.role !== 'admin') {
        throw new ValidationError('Admin access required');
      }

      const { enabled, userIds } = req.body; // enabled: boolean, userIds: optional array

      await globalConfigService.updateTrialForUsers(enabled, userIds);

      res.json({
        success: true,
        message: `Trial ${enabled ? 'enabled' : 'disabled'} for ${userIds?.length || 'all'} users`,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const configController = new ConfigController();

