import { Request, Response } from 'express';
import { licenseService } from '../services/license/licenseService';
import { logger } from '../utils/logger';

/**
 * License Controller
 * Handles license validation endpoints for EA License tier
 */
export class LicenseController {
  /**
   * Get license configuration (for EA)
   * GET /api/license/config?userId=xxx&mt5Login=xxx
   * 
   * Returns license status + account configuration
   * Used by EA to get all needed configuration
   */
  async getLicenseConfig(req: Request, res: Response): Promise<void> {
    try {
      const { userId, mt5Login } = req.query;

      if (!userId || !mt5Login) {
        res.status(400).json({
          success: false,
          error: 'userId and mt5Login are required',
        });
        return;
      }

      const result = await licenseService.getLicenseConfig({
        userId: userId as string,
        mt5Login: mt5Login as string,
      });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      logger.error('License config controller error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get license config',
        message: error.message || 'Unknown error',
      });
    }
  }

  /**
   * Validate license
   * POST /api/license/validate
   * 
   * Request body:
   * {
   *   "userId": "string",
   *   "mt5Accounts": ["12345", "67890"]
   * }
   * 
   * Response:
   * {
   *   "valid": true,
   *   "expiryDate": "2024-12-31T00:00:00.000Z",
   *   "allowedAccounts": ["12345", "67890"],
   *   "tier": "EA_LICENSE"
   * }
   */
  async validateLicense(req: Request, res: Response): Promise<void> {
    try {
      const { userId, mt5Accounts } = req.body;

      // Validate input
      if (!userId) {
        res.status(400).json({
          success: false,
          error: 'userId is required',
        });
        return;
      }

      if (!mt5Accounts || !Array.isArray(mt5Accounts) || mt5Accounts.length === 0) {
        res.status(400).json({
          success: false,
          error: 'mt5Accounts array is required and must not be empty',
        });
        return;
      }

      // Validate license
      const result = await licenseService.validateLicense({
        userId,
        mt5Accounts,
      });

      // Return result
      if (result.valid) {
        res.status(200).json({
          success: true,
          data: result,
        });
      } else {
        res.status(403).json({
          success: false,
          data: result,
        });
      }
    } catch (error: any) {
      logger.error('License validation controller error:', error);
      logger.error('Error stack:', error.stack);
      res.status(500).json({
        success: false,
        error: 'License validation failed',
        message: error.message || 'Unknown error',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      });
    }
  }
}

export const licenseController = new LicenseController();

