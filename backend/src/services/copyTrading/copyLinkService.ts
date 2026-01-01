import { CopyLink, ICopyLink, MT5Account } from '../../models';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { logger } from '../../utils/logger';

export interface CreateCopyLinkData {
  masterAccountId: string;
  slaveAccountId: string;
  lotMultiplier?: number;
  riskMode?: 'fixed' | 'percentage' | 'balance_ratio';
  riskPercent?: number;
  copySymbols?: string[];
  excludeSymbols?: string[];
  copyPendingOrders?: boolean;
  copyModifications?: boolean;
  priority?: number;
}

export class CopyLinkService {
  /**
   * Create a copy link between master and slave accounts
   */
  async createCopyLink(userId: string, data: CreateCopyLinkData): Promise<ICopyLink> {
    // Verify master account exists and belongs to user
    const masterAccount = await MT5Account.findOne({
      _id: data.masterAccountId,
      userId,
      accountType: 'master',
    });

    if (!masterAccount) {
      throw new NotFoundError('Master account not found or is not a master account');
    }

    // Verify slave account exists and belongs to user
    const slaveAccount = await MT5Account.findOne({
      _id: data.slaveAccountId,
      userId,
      accountType: 'slave',
    });

    if (!slaveAccount) {
      throw new NotFoundError('Slave account not found or is not a slave account');
    }

    // Check if link already exists
    const existingLink = await CopyLink.findOne({
      masterAccountId: data.masterAccountId,
      slaveAccountId: data.slaveAccountId,
    });

    if (existingLink) {
      throw new ValidationError('Copy link already exists between these accounts');
    }

    // Create copy link
    const copyLink = new CopyLink({
      masterAccountId: data.masterAccountId,
      slaveAccountId: data.slaveAccountId,
      lotMultiplier: data.lotMultiplier || 1.0,
      riskMode: data.riskMode || 'fixed',
      riskPercent: data.riskPercent || 0,
      copySymbols: data.copySymbols || [],
      excludeSymbols: data.excludeSymbols || [],
      copyPendingOrders: data.copyPendingOrders || false,
      copyModifications: data.copyModifications !== undefined ? data.copyModifications : true,
      priority: data.priority || 1,
      status: 'active',
    });

    await copyLink.save();

    logger.info(`Copy link created: ${copyLink._id} (Master: ${data.masterAccountId}, Slave: ${data.slaveAccountId})`);

    return copyLink;
  }

  /**
   * Get all copy links for a user
   */
  async getUserCopyLinks(userId: string): Promise<ICopyLink[]> {
    // Get user's account IDs
    const userAccounts = await MT5Account.find({ userId }).select('_id');
    const accountIds = userAccounts.map(acc => acc._id);

    // Find all copy links where master or slave belongs to user
    const copyLinks = await CopyLink.find({
      $or: [
        { masterAccountId: { $in: accountIds } },
        { slaveAccountId: { $in: accountIds } },
      ],
    })
      .populate('masterAccountId', 'accountName broker loginId')
      .populate('slaveAccountId', 'accountName broker loginId')
      .sort({ createdAt: -1 });

    return copyLinks;
  }

  /**
   * Get copy link by ID
   */
  async getCopyLinkById(userId: string, linkId: string): Promise<ICopyLink> {
    const copyLink = await CopyLink.findById(linkId)
      .populate('masterAccountId', 'accountName broker loginId')
      .populate('slaveAccountId', 'accountName broker loginId');

    if (!copyLink) {
      throw new NotFoundError('Copy link not found');
    }

    // Verify user owns either master or slave account
    const masterAccount = await MT5Account.findById(copyLink.masterAccountId);
    const slaveAccount = await MT5Account.findById(copyLink.slaveAccountId);

    if (!masterAccount || !slaveAccount) {
      throw new NotFoundError('Associated account not found');
    }

    if (masterAccount.userId.toString() !== userId && slaveAccount.userId.toString() !== userId) {
      throw new ValidationError('You do not have permission to access this copy link');
    }

    return copyLink;
  }

  /**
   * Update copy link
   */
  async updateCopyLink(userId: string, linkId: string, data: Partial<CreateCopyLinkData>): Promise<ICopyLink> {
    const copyLink = await this.getCopyLinkById(userId, linkId);

    // Update fields
    if (data.lotMultiplier !== undefined) copyLink.lotMultiplier = data.lotMultiplier;
    if (data.riskMode !== undefined) copyLink.riskMode = data.riskMode;
    if (data.riskPercent !== undefined) copyLink.riskPercent = data.riskPercent;
    if (data.copySymbols !== undefined) copyLink.copySymbols = data.copySymbols;
    if (data.excludeSymbols !== undefined) copyLink.excludeSymbols = data.excludeSymbols;
    if (data.copyPendingOrders !== undefined) copyLink.copyPendingOrders = data.copyPendingOrders;
    if (data.copyModifications !== undefined) copyLink.copyModifications = data.copyModifications;
    if (data.priority !== undefined) copyLink.priority = data.priority;

    await copyLink.save();

    logger.info(`Copy link updated: ${linkId}`);

    return copyLink;
  }

  /**
   * Pause copy link
   */
  async pauseCopyLink(userId: string, linkId: string): Promise<ICopyLink> {
    const copyLink = await this.getCopyLinkById(userId, linkId);

    copyLink.status = 'paused';
    copyLink.pausedAt = new Date();

    await copyLink.save();

    logger.info(`Copy link paused: ${linkId}`);

    return copyLink;
  }

  /**
   * Resume copy link
   */
  async resumeCopyLink(userId: string, linkId: string): Promise<ICopyLink> {
    const copyLink = await this.getCopyLinkById(userId, linkId);

    copyLink.status = 'active';
    copyLink.pausedAt = undefined;

    await copyLink.save();

    logger.info(`Copy link resumed: ${linkId}`);

    return copyLink;
  }

  /**
   * Delete copy link
   */
  async deleteCopyLink(userId: string, linkId: string): Promise<void> {
    const copyLink = await this.getCopyLinkById(userId, linkId);

    await CopyLink.deleteOne({ _id: linkId });

    logger.info(`Copy link deleted: ${linkId}`);
  }
}

export const copyLinkService = new CopyLinkService();

