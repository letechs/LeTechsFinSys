import { Request, Response, NextFunction } from 'express';
import { copyLinkService } from '../services/copyTrading/copyLinkService';
import { ValidationError } from '../utils/errors';
import { body } from 'express-validator';
import { MT5Account } from '../models';
import { HistoryService } from '../services/history/historyService';

export class CopyLinkController {
  /**
   * Create a copy link
   * POST /api/copy-links
   */
  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ValidationError('User not authenticated');
      }

      const {
        masterAccountId,
        slaveAccountId,
        lotMultiplier,
        riskMode,
        riskPercent,
        copySymbols,
        excludeSymbols,
        copyPendingOrders,
        copyModifications,
        priority,
      } = req.body;

      if (!masterAccountId || !slaveAccountId) {
        throw new ValidationError('Master account ID and slave account ID are required');
      }

      // Auto-update account types if they are standalone
      const masterAccount = await MT5Account.findOne({
        _id: masterAccountId,
        userId: req.user._id,
      });

      const slaveAccount = await MT5Account.findOne({
        _id: slaveAccountId,
        userId: req.user._id,
      });

      if (!masterAccount || !slaveAccount) {
        throw new ValidationError('One or both accounts not found');
      }

      // Update account types if needed
      if (masterAccount.accountType === 'standalone') {
        masterAccount.accountType = 'master';
        await masterAccount.save();
      }

      if (slaveAccount.accountType === 'standalone') {
        slaveAccount.accountType = 'slave';
        await slaveAccount.save();
      }

      const copyLink = await copyLinkService.createCopyLink(req.user._id.toString(), {
        masterAccountId,
        slaveAccountId,
        lotMultiplier,
        riskMode,
        riskPercent,
        copySymbols,
        excludeSymbols,
        copyPendingOrders,
        copyModifications,
        priority,
      });

      // Log history
      await HistoryService.createEntry({
        userId: req.user._id.toString(),
        actionType: 'copy_link_created',
        description: `Copy trading link created: Master ${masterAccountId} → Slave ${slaveAccountId}`,
        newValue: {
          linkId: copyLink._id,
          masterAccountId,
          slaveAccountId,
          lotMultiplier,
          riskMode,
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.status(201).json({
        success: true,
        message: 'Copy link created successfully',
        data: copyLink,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get all copy links for user
   * GET /api/copy-links
   */
  getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ValidationError('User not authenticated');
      }

      const copyLinks = await copyLinkService.getUserCopyLinks(req.user._id.toString());

      res.json({
        success: true,
        data: copyLinks,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get copy link by ID
   * GET /api/copy-links/:id
   */
  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ValidationError('User not authenticated');
      }

      const copyLink = await copyLinkService.getCopyLinkById(
        req.user._id.toString(),
        req.params.id
      );

      res.json({
        success: true,
        data: copyLink,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Update copy link
   * PUT /api/copy-links/:id
   */
  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ValidationError('User not authenticated');
      }

      // Get old link data for history
      const oldLink = await copyLinkService.getCopyLinkById(req.user._id.toString(), req.params.id);

      const copyLink = await copyLinkService.updateCopyLink(
        req.user._id.toString(),
        req.params.id,
        req.body
      );

      // Log history
      await HistoryService.createEntry({
        userId: req.user._id.toString(),
        actionType: 'copy_link_updated',
        description: `Copy trading link updated: ${req.params.id}`,
        oldValue: oldLink,
        newValue: copyLink,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.json({
        success: true,
        message: 'Copy link updated successfully',
        data: copyLink,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Pause copy link
   * POST /api/copy-links/:id/pause
   */
  pause = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ValidationError('User not authenticated');
      }

      const copyLink = await copyLinkService.pauseCopyLink(
        req.user._id.toString(),
        req.params.id
      );

      res.json({
        success: true,
        message: 'Copy link paused successfully',
        data: copyLink,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Resume copy link
   * POST /api/copy-links/:id/resume
   */
  resume = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ValidationError('User not authenticated');
      }

      const copyLink = await copyLinkService.resumeCopyLink(
        req.user._id.toString(),
        req.params.id
      );

      res.json({
        success: true,
        message: 'Copy link resumed successfully',
        data: copyLink,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Delete copy link
   * DELETE /api/copy-links/:id
   */
  delete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ValidationError('User not authenticated');
      }

      // Get link data before deletion for history
      const link = await copyLinkService.getCopyLinkById(req.user._id.toString(), req.params.id);

      await copyLinkService.deleteCopyLink(req.user._id.toString(), req.params.id);

      // Log history
      await HistoryService.createEntry({
        userId: req.user._id.toString(),
        actionType: 'copy_link_deleted',
        description: `Copy trading link deleted: Master ${link.masterAccountId} → Slave ${link.slaveAccountId}`,
        oldValue: {
          linkId: link._id,
          masterAccountId: link.masterAccountId,
          slaveAccountId: link.slaveAccountId,
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.json({
        success: true,
        message: 'Copy link deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  };
}

export const copyLinkController = new CopyLinkController();

// Validation rules
export const createCopyLinkValidation = [
  body('masterAccountId').notEmpty().withMessage('Master account ID is required'),
  body('slaveAccountId').notEmpty().withMessage('Slave account ID is required'),
  body('lotMultiplier').optional().isFloat({ min: 0.01, max: 10 }).withMessage('Lot multiplier must be between 0.01 and 10'),
  body('riskMode').optional().isIn(['fixed', 'percentage', 'balance_ratio']).withMessage('Invalid risk mode'),
  body('riskPercent').optional().isFloat({ min: 0, max: 100 }).withMessage('Risk percent must be between 0 and 100'),
  body('priority').optional().isInt({ min: 1 }).withMessage('Priority must be at least 1'),
];

