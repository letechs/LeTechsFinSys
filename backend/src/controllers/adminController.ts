import { Request, Response, NextFunction } from 'express';
import { User } from '../models';
import { Payment } from '../models';
import { ValidationError, ForbiddenError } from '../utils/errors';
import { logger } from '../utils/logger';
import { subscriptionService } from '../services/subscription/subscriptionService';

export class AdminController {
  /**
   * Get admin dashboard statistics
   * GET /api/admin/dashboard/stats
   */
  getDashboardStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || req.user.role !== 'admin') {
        throw new ForbiddenError('Admin access required');
      }

      const now = new Date();
      const startOfToday = new Date(now);
      startOfToday.setHours(0, 0, 0, 0);
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      const sevenDaysFromNow = new Date(now);
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

      // Total users count
      const totalUsers = await User.countDocuments({});
      const activeUsers = await User.countDocuments({ isActive: true });
      const blockedUsers = totalUsers - activeUsers;

      // Recent registrations (last 7 days)
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const recentRegistrations = await User.countDocuments({
        createdAt: { $gte: sevenDaysAgo },
      });

      // Active subscriptions count
      const usersWithSubscriptions = await User.find({
        $or: [
          { subscriptionTier: { $in: ['EA_LICENSE', 'FULL_ACCESS'] } },
          { baseTier: { $in: ['EA_LICENSE', 'FULL_ACCESS'] } },
        ],
      }).lean();

      let activeSubscriptions = 0;
      for (const user of usersWithSubscriptions) {
        try {
          const subscription = await subscriptionService.getHybridSubscription(user._id.toString());
          if (subscription.subscriptionTier !== 'BASIC' && !subscription.isExpired) {
            activeSubscriptions++;
          }
        } catch (error) {
          // Skip users with errors
          logger.debug(`Error getting subscription for user ${user._id}: ${error}`);
        }
      }

      // Expiring subscriptions (next 7 days)
      const expiringSubscriptions = await User.find({
        subscriptionRenewalDate: {
          $gte: now,
          $lte: sevenDaysFromNow,
        },
        subscriptionTier: { $in: ['EA_LICENSE', 'FULL_ACCESS'] },
      })
        .select('_id email name subscriptionRenewalDate subscriptionTier')
        .sort({ subscriptionRenewalDate: 1 })
        .limit(10)
        .lean();

      // Revenue statistics
      const allPayments = await Payment.find({
        status: 'succeeded',
      }).lean();

      const totalRevenue = allPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

      const monthlyPayments = allPayments.filter((p) => {
        const paymentDate = new Date(p.createdAt);
        return paymentDate >= startOfMonth;
      });
      const monthlyRevenue = monthlyPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

      const yearlyPayments = allPayments.filter((p) => {
        const paymentDate = new Date(p.createdAt);
        return paymentDate >= startOfYear;
      });
      const yearlyRevenue = yearlyPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

      // Recent payments (last 10)
      const recentPayments = await Payment.find({
        status: 'succeeded',
      })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('userId', 'email name')
        .lean();

      // Recent registrations (last 10)
      const recentUsers = await User.find({})
        .select('_id email name createdAt subscriptionTier')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

      // Subscription tier distribution
      const tierDistribution = {
        BASIC: await User.countDocuments({ subscriptionTier: 'BASIC', baseTier: null }),
        EA_LICENSE: await User.countDocuments({
          $or: [
            { subscriptionTier: 'EA_LICENSE' },
            { baseTier: 'EA_LICENSE' },
          ],
        }),
        FULL_ACCESS: await User.countDocuments({
          $or: [
            { subscriptionTier: 'FULL_ACCESS' },
            { baseTier: 'FULL_ACCESS' },
          ],
        }),
      };

      res.json({
        success: true,
        data: {
          users: {
            total: totalUsers,
            active: activeUsers,
            blocked: blockedUsers,
            recent: recentRegistrations,
          },
          subscriptions: {
            active: activeSubscriptions,
            expiring: expiringSubscriptions.map((sub) => ({
              _id: sub._id,
              email: sub.email,
              name: sub.name,
              renewalDate: sub.subscriptionRenewalDate,
              tier: sub.subscriptionTier,
            })),
          },
          revenue: {
            total: totalRevenue,
            monthly: monthlyRevenue,
            yearly: yearlyRevenue,
          },
          recentPayments: recentPayments.map((p) => ({
            _id: p._id,
            amount: p.amount,
            currency: p.currency,
            status: p.status,
            createdAt: p.createdAt,
            user: p.userId ? {
              email: (p.userId as any).email,
              name: (p.userId as any).name,
            } : null,
          })),
          recentRegistrations: recentUsers.map((u) => ({
            _id: u._id,
            email: u.email,
            name: u.name,
            createdAt: u.createdAt,
            tier: u.subscriptionTier,
          })),
          tierDistribution,
        },
      });
    } catch (error) {
      next(error);
    }
  };
}

export const adminController = new AdminController();

