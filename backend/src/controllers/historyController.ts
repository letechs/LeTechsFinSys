import { Request, Response, NextFunction } from 'express';
import { HistoryService } from '../services/history/historyService';
import { ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';

export class HistoryController {
  /**
   * Get user history (Admin only - can view any user's history)
   * GET /api/history/admin/:userId
   */
  getUserHistoryAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || req.user.role !== 'admin') {
        throw new ValidationError('Admin access required');
      }

      const { userId } = req.params;
      const { limit = 100, skip = 0, actionType, startDate, endDate } = req.query;

      if (!userId) {
        throw new ValidationError('User ID is required');
      }

      const history = await HistoryService.getUserHistory(userId, {
        limit: Number(limit),
        skip: Number(skip),
        actionType: actionType && String(actionType).trim() ? (actionType as any) : undefined,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
      });

      res.json({
        success: true,
        data: history,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get all history (Admin only)
   * GET /api/history/admin
   */
  getAllHistoryAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || req.user.role !== 'admin') {
        throw new ValidationError('Admin access required');
      }

      const { limit = 100, skip = 0, userId, search, actionType, startDate, endDate } = req.query;

      const history = await HistoryService.getAllHistory({
        limit: Number(limit),
        skip: Number(skip),
        userId: userId && String(userId).trim() ? String(userId).trim() : undefined,
        search: search && String(search).trim() ? String(search).trim() : undefined,
        actionType: actionType && String(actionType).trim() ? (actionType as any) : undefined,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
      });

      res.json({
        success: true,
        data: history,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get own history (User)
   * GET /api/history/me
   */
  getMyHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ValidationError('User not authenticated');
      }

      const { limit = 100, skip = 0, actionType, startDate, endDate } = req.query;

      const history = await HistoryService.getUserHistory(req.user._id.toString(), {
        limit: Number(limit),
        skip: Number(skip),
        actionType: actionType && String(actionType).trim() ? (actionType as any) : undefined,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
      });

      res.json({
        success: true,
        data: history,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get history statistics (Admin only)
   * GET /api/history/admin/statistics
   */
  getStatistics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || req.user.role !== 'admin') {
        throw new ValidationError('Admin access required');
      }

      const statistics = await HistoryService.getStatistics();

      res.json({
        success: true,
        data: statistics,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Cleanup old history records (Admin only)
   * POST /api/history/admin/cleanup
   * Body: { olderThanDays?: number } (default: 365)
   */
  cleanupOldHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || req.user.role !== 'admin') {
        throw new ValidationError('Admin access required');
      }

      const { olderThanDays = 365 } = req.body;

      if (typeof olderThanDays !== 'number' || olderThanDays < 1) {
        throw new ValidationError('olderThanDays must be a positive number');
      }

      const result = await HistoryService.cleanupOldHistory(olderThanDays);

      logger.info(`Admin ${req.user._id} cleaned up ${result.deleted} old history records`);

      res.json({
        success: true,
        message: `Cleaned up ${result.deleted} history records older than ${olderThanDays} days`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const historyController = new HistoryController();

