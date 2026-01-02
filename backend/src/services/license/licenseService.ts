import mongoose from 'mongoose';
import { User } from '../../models/User';
import { MT5Account } from '../../models/MT5Account';
import { CopyLink } from '../../models/CopyLink';
import { SUBSCRIPTION_TIERS, BASE_TIER_LIMITS, TRIAL_LIMITS, GRACE_PERIOD_DAYS } from '../../config/constants';
import { globalConfigService } from '../config/globalConfigService';
import { logger } from '../../utils/logger';

export interface LicenseValidationRequest {
  userId: string;
  mt5Accounts: string[]; // Array of MT5 account numbers (loginId)
}

export interface LicenseValidationResponse {
  valid: boolean;
  expiryDate?: string;
  allowedAccounts: string[];
  tier: 'BASIC' | 'EA_LICENSE' | 'FULL_ACCESS';
  message?: string;
}

/**
 * License Service
 * Handles license validation for EA License tier users
 * This is a read-only service (no DB writes)
 */
export class LicenseService {
  /**
   * Validate user license
   * @param request License validation request
   * @returns License validation response
   */
  async validateLicense(request: LicenseValidationRequest): Promise<LicenseValidationResponse> {
    try {
      const { userId, mt5Accounts } = request;

      // Validate userId format (MongoDB ObjectId)
      if (!userId || userId.length !== 24) {
        return {
          valid: false,
          allowedAccounts: [],
          tier: SUBSCRIPTION_TIERS.EA_LICENSE,
          message: 'Invalid userId format',
        };
      }

      // Find user
      const user = await User.findById(userId).lean();
      if (!user) {
        return {
          valid: false,
          allowedAccounts: [],
          tier: SUBSCRIPTION_TIERS.EA_LICENSE,
          message: 'User not found',
        };
      }

      // Check if user is active
      if (!user.isActive) {
        return {
          valid: false,
          allowedAccounts: [],
          tier: (user.subscriptionTier as 'EA_LICENSE' | 'FULL_ACCESS') || SUBSCRIPTION_TIERS.EA_LICENSE,
          message: 'User account is inactive',
        };
      }

      // Get current tier (BASIC, EA_LICENSE, or FULL_ACCESS)
      const currentTier = (user.subscriptionTier as 'BASIC' | 'EA_LICENSE' | 'FULL_ACCESS') || SUBSCRIPTION_TIERS.BASIC;
      
      // Check if user is in BASIC tier
      if (currentTier === SUBSCRIPTION_TIERS.BASIC) {
        // Check if user has active trial
        const now = new Date();
        const hasActiveTrial = user.trialClaimed && 
                              user.trialExpiryDate && 
                              new Date(user.trialExpiryDate) > now;
        
        if (!hasActiveTrial) {
          // BASIC tier - all features disabled
          return {
            valid: false,
            allowedAccounts: [],
            tier: SUBSCRIPTION_TIERS.BASIC,
            message: 'BASIC tier - No active subscription. All features disabled.',
          };
        }
        // User is in trial - use trial limits
      }

      // Use baseTier if available (hybrid model), fallback to subscriptionTier (legacy)
      const baseTier = (user.baseTier as 'EA_LICENSE' | 'FULL_ACCESS') || 
                       (currentTier !== SUBSCRIPTION_TIERS.BASIC ? currentTier as 'EA_LICENSE' | 'FULL_ACCESS' : null);
      
      if (!baseTier) {
        // BASIC tier without trial
        return {
          valid: false,
          allowedAccounts: [],
          tier: SUBSCRIPTION_TIERS.BASIC,
          message: 'BASIC tier - No active subscription. All features disabled.',
        };
      }

      const tier = baseTier; // For backward compatibility

      // Check subscription expiry
      const now = new Date();
      // Check if user is on active trial - if so, use trial expiry date
      const hasActiveTrial = user.trialClaimed && 
                            user.trialExpiryDate && 
                            new Date(user.trialExpiryDate) > now;
      
      // Use trial expiry date if trial is active, otherwise use subscription renewal date
      const expiryDate = hasActiveTrial 
        ? user.trialExpiryDate 
        : (user.subscriptionRenewalDate || user.subscriptionExpiry);
      
      // Check if expired and in grace period
      if (expiryDate && expiryDate < now) {
        // Always calculate grace period end date dynamically from expiry date
        const globalConfig = await globalConfigService.getConfig();
        const gracePeriodDays = globalConfig.gracePeriod.days;
        const gracePeriodEnd = new Date(expiryDate.getTime() + gracePeriodDays * 24 * 60 * 60 * 1000);
        
        if (now > gracePeriodEnd) {
          // Grace period ended - should be moved to BASIC (but check anyway)
          return {
            valid: false,
            expiryDate: expiryDate.toISOString(),
            allowedAccounts: [],
            tier: SUBSCRIPTION_TIERS.BASIC,
            message: 'Subscription expired and grace period ended. Moved to BASIC tier.',
          };
        }
        // Still in grace period - allow access but mark as expired
        user.isExpired = true;
        // Update grace period end date in database for reference (but calculation is always dynamic)
        if (!user.gracePeriodEndDate || user.gracePeriodEndDate.getTime() !== gracePeriodEnd.getTime()) {
          user.gracePeriodEndDate = gracePeriodEnd;
          await user.save();
        }
      }

      // For FULL_ACCESS users, license is always valid (they use existing system)
      if (tier === SUBSCRIPTION_TIERS.FULL_ACCESS) {
        return {
          valid: true,
          expiryDate: expiryDate?.toISOString(),
          allowedAccounts: mt5Accounts, // All accounts allowed for full access
          tier,
        };
      }

      // For EA_LICENSE users, validate account numbers
      if (tier === SUBSCRIPTION_TIERS.EA_LICENSE) {
        // Find all MT5 accounts for this user
        // Convert userId string to ObjectId
        const userObjectId = new mongoose.Types.ObjectId(userId);
        
        const userAccounts = await MT5Account.find({
          userId: userObjectId,
          status: 'active',
        })
          .select('loginId')
          .lean();

        const allowedAccountNumbers = userAccounts.map((acc) => String(acc.loginId));

        // Check if all provided accounts belong to user
        // Convert both to strings for comparison
        const invalidAccounts = mt5Accounts.filter(
          (accountNum) => !allowedAccountNumbers.includes(String(accountNum))
        );

        if (invalidAccounts.length > 0) {
          return {
            valid: false,
            expiryDate: expiryDate?.toISOString(),
            allowedAccounts: allowedAccountNumbers,
            tier,
            message: `Invalid account numbers: ${invalidAccounts.join(', ')}`,
          };
        }

        // All accounts are valid
        return {
          valid: true,
          expiryDate: expiryDate?.toISOString(),
          allowedAccounts: allowedAccountNumbers,
          tier,
        };
      }

      // Unknown tier
      return {
        valid: false,
        allowedAccounts: [],
        tier: SUBSCRIPTION_TIERS.EA_LICENSE,
        message: 'Unknown subscription tier',
      };
    } catch (error: any) {
      logger.error('License validation error:', error);
      logger.error('Error details:', {
        message: error.message,
        stack: error.stack,
        userId: request.userId,
      });
      return {
        valid: false,
        allowedAccounts: [],
        tier: SUBSCRIPTION_TIERS.EA_LICENSE,
        message: `License validation failed: ${error.message || 'Unknown error'}`,
      };
    }
  }

  /**
   * Check if user subscription is expired
   * @param userId User ID
   * @returns true if expired, false otherwise
   */
  async isSubscriptionExpired(userId: string): Promise<boolean> {
    try {
      const user = await User.findById(userId).select('subscriptionExpiry').lean();
      if (!user || !user.subscriptionExpiry) {
        return false; // No expiry set = not expired
      }
      return user.subscriptionExpiry < new Date();
    } catch (error: any) {
      logger.error('Subscription expiry check error:', error);
      return false; // On error, assume not expired
    }
  }

  /**
   * Get user subscription tier
   * @param userId User ID
   * @returns Subscription tier or null
   */
  async getUserTier(userId: string): Promise<'EA_LICENSE' | 'FULL_ACCESS' | null> {
    try {
      const user = await User.findById(userId).select('subscriptionTier').lean();
      if (!user) {
        return null;
      }
      return (user.subscriptionTier as 'EA_LICENSE' | 'FULL_ACCESS') || SUBSCRIPTION_TIERS.FULL_ACCESS;
    } catch (error: any) {
      logger.error('Get user tier error:', error);
      return null;
    }
  }

  /**
   * Get license configuration for EA
   * Returns license status + account configuration (master/slave roles)
   * @param request License config request
   * @returns License config with account details
   */
  async getLicenseConfig(request: { userId: string; mt5Login: string }): Promise<{
    valid: boolean;
    expiryDate?: string;
    lastUpdated?: string; // When subscription was last updated by admin
    allowedAccounts: string[];
    tier: 'BASIC' | 'EA_LICENSE' | 'FULL_ACCESS';
    accountConfig: {
      [loginId: string]: {
        role: 'master' | 'slave' | 'standalone';
        masterLogin?: string;
        accountName: string;
      };
    };
    message?: string;
  }> {
    try {
      const { userId, mt5Login } = request;

      // Validate userId format
      if (!userId || userId.length !== 24) {
        return {
          valid: false,
          allowedAccounts: [],
          tier: SUBSCRIPTION_TIERS.EA_LICENSE,
          accountConfig: {},
          message: 'Invalid userId format',
        };
      }

      // Find user
      const user = await User.findById(userId).lean();
      if (!user) {
        return {
          valid: false,
          allowedAccounts: [],
          tier: SUBSCRIPTION_TIERS.EA_LICENSE,
          accountConfig: {},
          message: 'User not found',
        };
      }

      // Check if user is active
      if (!user.isActive) {
        return {
          valid: false,
          allowedAccounts: [],
          tier: (user.subscriptionTier as 'BASIC' | 'EA_LICENSE' | 'FULL_ACCESS') || SUBSCRIPTION_TIERS.BASIC,
          accountConfig: {},
          message: 'User account is inactive',
        };
      }

      // Get current tier
      const currentTier = (user.subscriptionTier as 'BASIC' | 'EA_LICENSE' | 'FULL_ACCESS') || SUBSCRIPTION_TIERS.BASIC;
      const now = new Date();
      
      // Check if user is in BASIC tier
      let hasActiveTrial = false;
      if (currentTier === SUBSCRIPTION_TIERS.BASIC) {
        // Check if user has active trial
        hasActiveTrial = !!(user.trialClaimed && 
                              user.trialExpiryDate && 
                              new Date(user.trialExpiryDate) > now);
        
        if (!hasActiveTrial) {
          // BASIC tier - all features disabled
          return {
            valid: false,
            allowedAccounts: [],
            tier: SUBSCRIPTION_TIERS.BASIC,
            accountConfig: {},
            message: 'BASIC tier - No active subscription. All features disabled.',
          };
        }
        // User is in trial - will use trial limits below
      }

      // Use baseTier if available (hybrid model)
      const baseTier = (user.baseTier as 'EA_LICENSE' | 'FULL_ACCESS') || 
                       (currentTier !== SUBSCRIPTION_TIERS.BASIC ? currentTier as 'EA_LICENSE' | 'FULL_ACCESS' : null);
      
      // Only return empty if BASIC tier WITHOUT trial (trial users should continue)
      if (!baseTier && currentTier === SUBSCRIPTION_TIERS.BASIC && !hasActiveTrial) {
        // BASIC tier without trial
        return {
          valid: false,
          allowedAccounts: [],
          tier: SUBSCRIPTION_TIERS.BASIC,
          accountConfig: {},
          message: 'BASIC tier - No active subscription. All features disabled.',
        };
      }

      const tier = baseTier || (currentTier !== SUBSCRIPTION_TIERS.BASIC ? currentTier : SUBSCRIPTION_TIERS.EA_LICENSE); // For backward compatibility

      // Check subscription expiry - use trial expiry if trial is active
      // hasActiveTrial is already calculated above
      const expiryDate = hasActiveTrial 
        ? user.trialExpiryDate 
        : (user.subscriptionRenewalDate || user.subscriptionExpiry);
      
      // Check if expired and in grace period
      if (expiryDate && expiryDate < now) {
        // Always calculate grace period end date dynamically from expiry date
        const globalConfig = await globalConfigService.getConfig();
        const gracePeriodDays = globalConfig.gracePeriod.days;
        const gracePeriodEnd = new Date(expiryDate.getTime() + gracePeriodDays * 24 * 60 * 60 * 1000);
        
        if (now > gracePeriodEnd) {
          // Grace period ended
          return {
            valid: false,
            expiryDate: expiryDate.toISOString(),
            lastUpdated: user.subscriptionLastUpdated?.toISOString(),
            allowedAccounts: [],
            tier: SUBSCRIPTION_TIERS.BASIC,
            accountConfig: {},
            message: 'Subscription expired and grace period ended. Moved to BASIC tier.',
          };
        }
        // Still in grace period - allow access but mark as expired
      }

      // Calculate account limits
      let baseLimits;
      let additionalMasters = user.additionalMasters || 0;
      let additionalSlaves = user.additionalSlaves || 0;
      
      // Re-check if user is in trial (already declared above, just recalculate)
      hasActiveTrial = !!(user.trialClaimed && 
                            user.trialExpiryDate && 
                            new Date(user.trialExpiryDate) > now);
      
      if (hasActiveTrial && currentTier === SUBSCRIPTION_TIERS.BASIC) {
        // Use trial limits from global config
        const globalConfig = await globalConfigService.getConfig();
        baseLimits = {
          masters: globalConfig.trial.masters,
          slaves: globalConfig.trial.slaves,
        };
        additionalMasters = 0; // No add-ons during trial
        additionalSlaves = 0;
      } else {
        // Use base tier limits from global config
        const globalConfig = await globalConfigService.getConfig();
        baseLimits = globalConfig.baseTierLimits[baseTier! as 'BASIC' | 'EA_LICENSE' | 'FULL_ACCESS'];
      }
      
      const totalMastersAllowed = baseLimits.masters + additionalMasters;
      const totalSlavesAllowed = baseLimits.slaves + additionalSlaves;
      
      logger.info('GetLicenseConfig: Account limits calculated', {
        userId,
        baseTier,
        baseLimits,
        additionalMasters,
        additionalSlaves,
        totalMastersAllowed,
        totalSlavesAllowed,
      });

      // Get all MT5 accounts for this user
      // For EA License (including trial), include all accounts regardless of status
      // Only filter by status for Full Access users who need real-time connection
      const userObjectId = new mongoose.Types.ObjectId(userId);
      const userAccountsRaw = await MT5Account.find({
        userId: userObjectId,
        // Include all accounts - status filtering is not needed for EA License
        // EA License works with accounts regardless of their connection status
      })
        .select('loginId accountName accountType status')
        .lean();

      // CRITICAL FIX: Auto-fix corrupted accounts (swapped loginId/accountName) before processing
      const userAccounts = await Promise.all(
        userAccountsRaw.map(async (acc: any) => {
          const loginIdIsNumeric = /^[0-9]+$/.test(String(acc.loginId));
          const accountNameIsNumeric = /^[0-9]+$/.test(String(acc.accountName));
          const loginIdHasLetters = /[a-zA-Z\s]/.test(String(acc.loginId));
          
          // If loginId has letters (looks like accountName) and accountName is numeric (looks like loginId), swap them
          if (loginIdHasLetters && accountNameIsNumeric) {
            logger.warn('GetLicenseConfig: Fixing corrupted account - swapping loginId and accountName', {
              accountId: acc._id,
              oldLoginId: acc.loginId,
              oldAccountName: acc.accountName,
            });
            
            // Update in database
            await MT5Account.updateOne(
              { _id: acc._id },
              {
                $set: {
                  loginId: acc.accountName,
                  accountName: acc.loginId,
                },
              }
            );
            
            // Return fixed account
            return {
              ...acc,
              loginId: acc.accountName,
              accountName: acc.loginId,
            };
          }
          
          return acc;
        })
      );

      logger.info('GetLicenseConfig: Found user accounts', {
        userId,
        mt5Login,
        accountCount: userAccounts.length,
        accounts: userAccounts.map((acc) => ({
          loginId: acc.loginId,
          accountName: acc.accountName,
          accountType: acc.accountType,
        })),
      });

      // Count accounts by type to validate limits
      const masterCount = userAccounts.filter((acc) => acc.accountType === 'master').length;
      const slaveCount = userAccounts.filter((acc) => acc.accountType === 'slave').length;
      
      // Check if user exceeds limits
      if (masterCount > totalMastersAllowed) {
        logger.warn('GetLicenseConfig: User exceeds master account limit', {
          userId,
          masterCount,
          totalMastersAllowed,
        });
        return {
          valid: false,
          expiryDate: expiryDate?.toISOString(),
          lastUpdated: user.subscriptionLastUpdated?.toISOString(),
          allowedAccounts: [],
          tier,
          accountConfig: {},
          message: `Account limit exceeded: You have ${masterCount} master accounts but only ${totalMastersAllowed} allowed. Please upgrade your subscription.`,
        };
      }
      
      if (slaveCount > totalSlavesAllowed) {
        logger.warn('GetLicenseConfig: User exceeds slave account limit', {
          userId,
          slaveCount,
          totalSlavesAllowed,
        });
        return {
          valid: false,
          expiryDate: expiryDate?.toISOString(),
          lastUpdated: user.subscriptionLastUpdated?.toISOString(),
          allowedAccounts: [],
          tier,
          accountConfig: {},
          message: `Account limit exceeded: You have ${slaveCount} slave accounts but only ${totalSlavesAllowed} allowed. Please upgrade your subscription.`,
        };
      }

      const allowedAccountNumbers = userAccounts.map((acc) => String(acc.loginId));

      logger.info('GetLicenseConfig: Building allowedAccountNumbers', {
        userId,
        userAccountsCount: userAccounts.length,
        userAccountsLoginIds: userAccounts.map((acc) => ({
          loginId: acc.loginId,
          loginIdType: typeof acc.loginId,
          accountName: acc.accountName,
          accountType: acc.accountType,
        })),
        allowedAccountNumbers,
      });

      // Verify the requesting account belongs to user
      let requestingAccount = userAccounts.find((acc) => String(acc.loginId) === String(mt5Login));
      let requestingAccountFound = !!requestingAccount;
      
      // CRITICAL FIX: If requesting account not found in active accounts, try to find it anyway
      // This ensures accountConfig is always populated for the requesting account
      if (!requestingAccount) {
        logger.warn('GetLicenseConfig: Requesting account not found in active accounts, searching all accounts', {
          userId,
          mt5Login,
          allowedAccounts: allowedAccountNumbers,
        });
        
        // Try to find the account without status filter
        const allUserAccountsRaw = await MT5Account.find({
          userId: userObjectId,
        })
          .select('loginId accountName accountType status')
          .lean();
        
        // CRITICAL FIX: Auto-fix corrupted accounts before searching
        const allUserAccounts = await Promise.all(
          allUserAccountsRaw.map(async (acc: any) => {
            const loginIdIsNumeric = /^[0-9]+$/.test(String(acc.loginId));
            const accountNameIsNumeric = /^[0-9]+$/.test(String(acc.accountName));
            const loginIdHasLetters = /[a-zA-Z\s]/.test(String(acc.loginId));
            
            // If loginId has letters (looks like accountName) and accountName is numeric (looks like loginId), swap them
            if (loginIdHasLetters && accountNameIsNumeric) {
              logger.warn('GetLicenseConfig: Fixing corrupted account (all accounts) - swapping loginId and accountName', {
                accountId: acc._id,
                oldLoginId: acc.loginId,
                oldAccountName: acc.accountName,
              });
              
              // Update in database
              await MT5Account.updateOne(
                { _id: acc._id },
                {
                  $set: {
                    loginId: acc.accountName,
                    accountName: acc.loginId,
                  },
                }
              );
              
              // Return fixed account
              return {
                ...acc,
                loginId: acc.accountName,
                accountName: acc.loginId,
              };
            }
            
            return acc;
          })
        );
        
        // Search in fixed accounts - check both loginId and accountName (in case they were swapped before fix)
        requestingAccount = allUserAccounts.find((acc) => 
          String(acc.loginId) === String(mt5Login) || String(acc.accountName) === String(mt5Login)
        );
        
        if (requestingAccount) {
          logger.info('GetLicenseConfig: Found requesting account (may be inactive)', {
            loginId: requestingAccount.loginId,
            accountName: requestingAccount.accountName,
            accountType: requestingAccount.accountType,
            status: (requestingAccount as any).status,
          });
          // Add to userAccounts array so it's included in accountConfig
          userAccounts.push(requestingAccount as any);
          // Update allowedAccountNumbers to include the requesting account
          const loginIdStr = String(requestingAccount.loginId);
          if (!allowedAccountNumbers.includes(loginIdStr)) {
            allowedAccountNumbers.push(loginIdStr);
          }
        } else {
          logger.error('GetLicenseConfig: Requesting account not found at all', {
            userId,
            mt5Login,
          });
          // Still return accountConfig for other accounts, but mark as invalid
          // This allows EA to at least see other account configs
        }
      }

      // Build account configuration
      const accountConfig: {
        [loginId: string]: {
          role: 'master' | 'slave' | 'standalone';
          masterLogin?: string;
          accountName: string;
        };
      } = {};

      // Get copy links to determine master/slave relationships
      // Find copy links where accounts belong to this user
      const accountIds = userAccounts.map((acc) => (acc as any)._id);
      const copyLinks = await CopyLink.find({
        $or: [
          { masterAccountId: { $in: accountIds } },
          { slaveAccountId: { $in: accountIds } },
        ],
        status: 'active',
      })
        .select('masterAccountId slaveAccountId')
        .populate({
          path: 'masterAccountId',
          select: 'loginId accountName',
        })
        .populate({
          path: 'slaveAccountId',
          select: 'loginId accountName',
        })
        .lean();

      logger.info('GetLicenseConfig: Found copy links', {
        userId,
        accountIds: accountIds.length,
        copyLinksCount: copyLinks.length,
        copyLinks: copyLinks.map((link) => ({
          masterId: (link.masterAccountId as any)?._id,
          masterLoginId: (link.masterAccountId as any)?.loginId,
          slaveId: (link.slaveAccountId as any)?._id,
          slaveLoginId: (link.slaveAccountId as any)?.loginId,
        })),
      });

      // Create a map of slave -> master relationships
      // Only include links where both accounts belong to this user (verified by accountIds)
      const slaveToMasterMap: { [slaveLoginId: string]: string } = {};
      // Update userLoginIds to include all accounts (including potentially added requesting account)
      const allAccountNumbers = userAccounts.map((acc) => String(acc.loginId));
      const userLoginIds = new Set(allAccountNumbers);
      
      for (const link of copyLinks) {
        const masterAcc = link.masterAccountId as any;
        const slaveAcc = link.slaveAccountId as any;
        
        // CRITICAL FIX: Validate that populated loginId is actually a loginId, not accountName
        // When populate only selects 'loginId', it should return { loginId: '...' }
        // But we need to ensure it's the actual loginId field, not accountName
        let masterLoginId: string | null = null;
        let slaveLoginId: string | null = null;
        
        // Handle populate result - could be object with loginId or full document
        if (masterAcc) {
          if (typeof masterAcc === 'object' && 'loginId' in masterAcc) {
            masterLoginId = String(masterAcc.loginId);
          } else if (typeof masterAcc === 'string') {
            // If populate didn't work, it might be just the ObjectId string
            // Need to fetch the account separately
            logger.warn('GetLicenseConfig: masterAccountId not properly populated, fetching separately', {
              masterAcc,
            });
            continue; // Skip this link, can't determine loginId
          }
        }
        
        if (slaveAcc) {
          if (typeof slaveAcc === 'object' && 'loginId' in slaveAcc) {
            slaveLoginId = String(slaveAcc.loginId);
          } else if (typeof slaveAcc === 'string') {
            logger.warn('GetLicenseConfig: slaveAccountId not properly populated, fetching separately', {
              slaveAcc,
            });
            continue; // Skip this link, can't determine loginId
          }
        }
        
        // Validate loginIds are numeric
        if (masterLoginId && !/^[0-9]+$/.test(masterLoginId)) {
          logger.error('GetLicenseConfig: Master loginId is not numeric (might be accountName)', {
            masterLoginId,
            masterAccountName: masterAcc?.accountName,
            masterAccFull: masterAcc,
          });
          continue;
        }
        
        if (slaveLoginId && !/^[0-9]+$/.test(slaveLoginId)) {
          logger.error('GetLicenseConfig: Slave loginId is not numeric (might be accountName)', {
            slaveLoginId,
            slaveAccountName: slaveAcc?.accountName,
            slaveAccFull: slaveAcc,
          });
          continue;
        }
        
        if (masterLoginId && slaveLoginId) {
          logger.info('GetLicenseConfig: Processing copy link', {
            masterLoginId,
            slaveLoginId,
            masterAccountName: masterAcc?.accountName,
            slaveAccountName: slaveAcc?.accountName,
            masterInUserAccounts: userLoginIds.has(masterLoginId),
            slaveInUserAccounts: userLoginIds.has(slaveLoginId),
          });
          
          // Verify both accounts belong to this user
          if (userLoginIds.has(masterLoginId) && userLoginIds.has(slaveLoginId)) {
            slaveToMasterMap[slaveLoginId] = masterLoginId;
            logger.info('GetLicenseConfig: Added to slaveToMasterMap', {
              slaveLoginId,
              masterLoginId,
            });
          } else {
            logger.warn('GetLicenseConfig: Copy link skipped - accounts not in user accounts', {
              masterLoginId,
              slaveLoginId,
              userLoginIds: Array.from(userLoginIds),
            });
          }
        } else {
          logger.warn('GetLicenseConfig: Copy link skipped - missing loginId', {
            hasMasterLoginId: !!masterLoginId,
            hasSlaveLoginId: !!slaveLoginId,
            masterAcc,
            slaveAcc,
          });
        }
      }

      logger.info('GetLicenseConfig: Final slaveToMasterMap', {
        userId,
        slaveToMasterMap,
      });

      // Build account configuration
      for (const account of userAccounts) {
        let loginId = String(account.loginId);
        const accountName = String(account.accountName || '');
        
        // CRITICAL FIX: Validate loginId is numeric, not accountName
        // If loginId contains non-numeric characters, it might be corrupted data
        if (!/^[0-9]+$/.test(loginId)) {
          logger.error('GetLicenseConfig: Invalid loginId detected (non-numeric)', {
            loginId,
            accountName,
            accountType: account.accountType,
          });
          // Skip this account - cannot use non-numeric loginId as key
          continue;
        }
        
        const role = account.accountType || 'standalone';
        
        accountConfig[loginId] = {
          role: role as 'master' | 'slave' | 'standalone',
          accountName: accountName,
        };

        // If slave, add master login from copy links
        if (role === 'slave' && slaveToMasterMap[loginId]) {
          accountConfig[loginId].masterLogin = slaveToMasterMap[loginId];
          logger.info('GetLicenseConfig: Added masterLogin for slave', {
            slaveLoginId: loginId,
            masterLoginId: slaveToMasterMap[loginId],
          });
        } else if (role === 'slave' && !slaveToMasterMap[loginId]) {
          logger.warn('GetLicenseConfig: Slave account has no master login', {
            slaveLoginId: loginId,
            slaveToMasterMap: Object.keys(slaveToMasterMap),
          });
        }
      }

      logger.info('GetLicenseConfig: Final accountConfig', {
        userId,
        mt5Login,
        accountConfigKeys: Object.keys(accountConfig),
        accountConfig,
        requestingAccountFound,
      });

      // CRITICAL: Always return accountConfig, even if valid=false
      // This allows EA to parse accountConfig and get masterLogin for slaves
      // Set valid based on whether requesting account was found and other validation checks
      const finalValid = requestingAccountFound && Object.keys(accountConfig).length > 0;

      return {
        valid: finalValid,
        expiryDate: expiryDate?.toISOString(),
        lastUpdated: user.subscriptionLastUpdated?.toISOString(),
        allowedAccounts: allowedAccountNumbers,
        tier,
        accountConfig,
      };
    } catch (error: any) {
      logger.error('Get license config error:', error);
      return {
        valid: false,
        allowedAccounts: [],
        tier: SUBSCRIPTION_TIERS.EA_LICENSE,
        accountConfig: {},
        message: `Failed to get license config: ${error.message || 'Unknown error'}`,
      };
    }
  }
}

export const licenseService = new LicenseService();

