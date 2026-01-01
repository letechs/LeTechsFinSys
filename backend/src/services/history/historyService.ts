import { UserHistory, HistoryActionType } from '../../models/UserHistory';
import { User } from '../../models/User';
import { logger } from '../../utils/logger';
import { ValidationError } from '../../utils/errors';
import mongoose from 'mongoose';

export interface CreateHistoryEntryParams {
  userId: string;
  actionType: HistoryActionType;
  description: string;
  oldValue?: any;
  newValue?: any;
  performedBy?: string;
  performedByEmail?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

export class HistoryService {
  // Batch buffer for history entries (reduces database writes)
  private static batchBuffer: CreateHistoryEntryParams[] = [];
  private static batchTimeout: NodeJS.Timeout | null = null;
  private static readonly BATCH_SIZE = 10; // Flush after 10 entries
  private static readonly BATCH_TIMEOUT_MS = 5000; // Or flush after 5 seconds

  /**
   * Create a history entry (buffered for batch insertion)
   */
  static async createEntry(params: CreateHistoryEntryParams): Promise<void> {
    try {
      // Add to batch buffer
      this.batchBuffer.push(params);

      // Flush if batch size reached
      if (this.batchBuffer.length >= this.BATCH_SIZE) {
        await this.flushBatch();
      } else if (!this.batchTimeout) {
        // Set timeout to flush after delay
        this.batchTimeout = setTimeout(() => {
          this.flushBatch().catch((error) => {
            logger.error(`Error flushing history batch: ${error}`);
          });
        }, this.BATCH_TIMEOUT_MS);
      }

      logger.debug(`History entry queued: ${params.actionType} for user ${params.userId}`);
    } catch (error) {
      logger.error(`Failed to queue history entry: ${error}`);
      // Don't throw - history logging should not break main functionality
    }
  }

  /**
   * Flush batch buffer to database
   */
  private static async flushBatch(): Promise<void> {
    if (this.batchBuffer.length === 0) {
      return;
    }

    const entriesToInsert = [...this.batchBuffer];
    this.batchBuffer = [];

    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }

    try {
      const documents = entriesToInsert.map((params) => {
        // Validate userId is a valid ObjectId
        if (!mongoose.Types.ObjectId.isValid(params.userId)) {
          throw new Error(`Invalid userId format: ${params.userId}`);
        }
        
        // Validate performedBy if provided
        let performedBy: mongoose.Types.ObjectId | undefined;
        if (params.performedBy) {
          if (!mongoose.Types.ObjectId.isValid(params.performedBy)) {
            // If performedBy is not a valid ObjectId (e.g., 'system'), skip it
            logger.debug(`Skipping invalid performedBy value: ${params.performedBy}`);
            performedBy = undefined;
          } else {
            performedBy = new mongoose.Types.ObjectId(params.performedBy);
          }
        }
        
        return {
          userId: new mongoose.Types.ObjectId(params.userId),
          actionType: params.actionType,
          description: params.description,
          oldValue: params.oldValue,
          newValue: params.newValue,
          performedBy,
          performedByEmail: params.performedByEmail,
          metadata: params.metadata,
          ipAddress: params.ipAddress,
          userAgent: params.userAgent,
        };
      });

      await UserHistory.insertMany(documents, { ordered: false }); // ordered: false prevents one failure from stopping all inserts
      logger.debug(`Flushed ${entriesToInsert.length} history entries to database`);
    } catch (error) {
      logger.error(`Failed to flush history batch: ${error}`);
      // Re-queue entries for retry (optional - could lose some history on persistent errors)
    }
  }

  /**
   * Create a history entry immediately (bypasses batch buffer)
   * Use for critical actions that must be logged immediately
   */
  static async createEntryImmediate(params: CreateHistoryEntryParams): Promise<void> {
    try {
      // Validate userId is a valid ObjectId
      if (!mongoose.Types.ObjectId.isValid(params.userId)) {
        throw new Error(`Invalid userId format: ${params.userId}`);
      }
      
      // Validate performedBy if provided
      let performedBy: mongoose.Types.ObjectId | undefined;
      if (params.performedBy) {
        if (!mongoose.Types.ObjectId.isValid(params.performedBy)) {
          // If performedBy is not a valid ObjectId (e.g., 'system'), skip it
          logger.debug(`Skipping invalid performedBy value: ${params.performedBy}`);
          performedBy = undefined;
        } else {
          performedBy = new mongoose.Types.ObjectId(params.performedBy);
        }
      }
      
      await UserHistory.create({
        userId: new mongoose.Types.ObjectId(params.userId),
        actionType: params.actionType,
        description: params.description,
        oldValue: params.oldValue,
        newValue: params.newValue,
        performedBy,
        performedByEmail: params.performedByEmail,
        metadata: params.metadata,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      });

      logger.debug(`History entry created immediately: ${params.actionType} for user ${params.userId}`);
    } catch (error) {
      logger.error(`Failed to create history entry: ${error}`);
      // Don't throw - history logging should not break main functionality
    }
  }

  /**
   * Get user history
   */
  static async getUserHistory(
    userId: string,
    options?: {
      limit?: number;
      skip?: number;
      actionType?: HistoryActionType;
      startDate?: Date;
      endDate?: Date;
    }
  ) {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new ValidationError('Invalid user ID format');
    }

    const query: any = {
      userId: new mongoose.Types.ObjectId(userId),
    };

    if (options?.actionType) {
      query.actionType = options.actionType;
    }

    if (options?.startDate || options?.endDate) {
      query.createdAt = {};
      if (options.startDate) {
        query.createdAt.$gte = options.startDate;
      }
      if (options.endDate) {
        query.createdAt.$lte = options.endDate;
      }
    }

    const history = await UserHistory.find(query)
      .populate('performedBy', 'email name')
      .sort({ createdAt: -1 })
      .limit(options?.limit || 100)
      .skip(options?.skip || 0)
      .lean();

    const total = await UserHistory.countDocuments(query);

    return {
      history,
      total,
    };
  }

  /**
   * Get all history (admin only)
   */
  static async getAllHistory(
    options?: {
      limit?: number;
      skip?: number;
      userId?: string;
      search?: string;
      actionType?: HistoryActionType;
      startDate?: Date;
      endDate?: Date;
    }
  ) {
    const query: any = {};

    // Handle search parameter - search by user email, name, or user ID
    if (options?.search && options.search.trim()) {
      const searchStr = options.search.trim();
      const searchRegex = { $regex: searchStr, $options: 'i' };
      const searchConditions: any[] = [];

      // Search in User model by email and name
      const users = await User.find({
        $or: [
          { email: searchRegex },
          { name: searchRegex },
        ],
      }).select('_id').lean();

      const userIds = users.map(u => u._id);

      // If search looks like an ObjectId, also include it
      if (mongoose.Types.ObjectId.isValid(searchStr)) {
        userIds.push(new mongoose.Types.ObjectId(searchStr));
      }

      if (userIds.length > 0) {
        query.userId = { $in: userIds };
      } else {
        // If no users found, return empty result
        query.userId = new mongoose.Types.ObjectId('000000000000000000000000');
      }
    } else if (options?.userId && mongoose.Types.ObjectId.isValid(options.userId)) {
      // Legacy userId filter (still supported)
      query.userId = new mongoose.Types.ObjectId(options.userId);
    }

    if (options?.actionType) {
      query.actionType = options.actionType;
    }

    if (options?.startDate || options?.endDate) {
      query.createdAt = {};
      if (options.startDate) {
        query.createdAt.$gte = options.startDate;
      }
      if (options.endDate) {
        query.createdAt.$lte = options.endDate;
      }
    }

    const history = await UserHistory.find(query)
      .populate('userId', 'email name')
      .populate('performedBy', 'email name')
      .sort({ createdAt: -1 })
      .limit(options?.limit || 100)
      .skip(options?.skip || 0)
      .lean();

    const total = await UserHistory.countDocuments(query);

    return {
      history,
      total,
    };
  }

  /**
   * Clean up old history records manually (TTL index handles automatic cleanup, but this is for manual cleanup)
   * @param olderThanDays - Delete records older than this many days (default: 365)
   */
  static async cleanupOldHistory(olderThanDays: number = 365): Promise<{ deleted: number }> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const result = await UserHistory.deleteMany({
        createdAt: { $lt: cutoffDate },
      });

      logger.info(`Cleaned up ${result.deletedCount} history records older than ${olderThanDays} days`);
      return { deleted: result.deletedCount || 0 };
    } catch (error) {
      logger.error(`Failed to cleanup old history: ${error}`);
      throw error;
    }
  }

  /**
   * Get database statistics for monitoring
   */
  static async getStatistics(): Promise<{
    totalRecords: number;
    oldestRecord: Date | null;
    newestRecord: Date | null;
    recordsByActionType: Record<string, number>;
    estimatedSizeMB: number;
  }> {
    try {
      const totalRecords = await UserHistory.countDocuments();
      
      const oldest = await UserHistory.findOne().sort({ createdAt: 1 }).lean();
      const newest = await UserHistory.findOne().sort({ createdAt: -1 }).lean();

      // Get counts by action type
      const actionTypeCounts = await UserHistory.aggregate([
        {
          $group: {
            _id: '$actionType',
            count: { $sum: 1 },
          },
        },
      ]);

      const recordsByActionType: Record<string, number> = {};
      actionTypeCounts.forEach((item) => {
        recordsByActionType[item._id] = item.count;
      });

      // Estimate size (rough calculation: ~500 bytes per record average)
      const estimatedSizeMB = (totalRecords * 500) / (1024 * 1024);

      return {
        totalRecords,
        oldestRecord: oldest?.createdAt || null,
        newestRecord: newest?.createdAt || null,
        recordsByActionType,
        estimatedSizeMB: Math.round(estimatedSizeMB * 100) / 100,
      };
    } catch (error) {
      logger.error(`Failed to get history statistics: ${error}`);
      throw error;
    }
  }

  /**
   * Force flush any pending batch entries
   * Call this before server shutdown to ensure no data loss
   */
  static async flushPendingEntries(): Promise<void> {
    await this.flushBatch();
  }
}

