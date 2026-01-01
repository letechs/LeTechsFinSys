import { Router } from 'express';
import { licenseController } from '../controllers/licenseController';

const router = Router();

/**
 * License Routes
 * Separate routes for EA License tier validation
 * These routes are independent of existing system
 */

/**
 * POST /api/license/validate
 * Validate user license for EA License tier
 * 
 * Body: {
 *   userId: string,
 *   mt5Accounts: string[]
 * }
 * 
 * Response: {
 *   success: boolean,
 *   data: {
 *     valid: boolean,
 *     expiryDate?: string,
 *     allowedAccounts: string[],
 *     tier: 'EA_LICENSE' | 'FULL_ACCESS',
 *     message?: string
 *   }
 * }
 */
router.post('/validate', licenseController.validateLicense.bind(licenseController));

/**
 * GET /api/license/config
 * Get license configuration for EA (includes account config)
 * 
 * Query: {
 *   userId: string,
 *   mt5Login: string
 * }
 * 
 * Response: {
 *   success: boolean,
 *   data: {
 *     valid: boolean,
 *     expiryDate?: string,
 *     lastUpdated?: string,
 *     allowedAccounts: string[],
 *     tier: 'EA_LICENSE' | 'FULL_ACCESS',
 *     accountConfig: {
 *       [loginId: string]: {
 *         role: 'master' | 'slave' | 'standalone',
 *         masterLogin?: string,
 *         accountName: string
 *       }
 *     }
 *   }
 * }
 */
router.get('/config', licenseController.getLicenseConfig.bind(licenseController));

export default router;

