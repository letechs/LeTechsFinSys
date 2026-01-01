import { Request, Response, NextFunction } from 'express';
import { MT5Account, User, Subscription } from '../models';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';
import { logger } from '../utils/logger';
import { config } from '../config/env';
import { SUBSCRIPTION_STATUS, ACCOUNT_STATUS } from '../config/constants';
import mongoose from 'mongoose';

export const authenticateEA = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {

    // Check MongoDB connection first
    if (mongoose.connection.readyState !== 1) {
      logger.error('EA authentication failed: MongoDB not connected');
      res.status(401).json({
        success: false,
        message: 'Database connection unavailable',
      });
      return;
    }

    // Get EA token from header (case-insensitive)
    const eaToken = (req.headers['x-ea-token'] || req.headers['X-EA-Token']) as string;

    if (!eaToken || eaToken.trim() === '') {
      logger.warn('EA authentication failed: No token provided');
      res.status(401).json({
        success: false,
        message: 'EA Token required',
      });
      return;
    }

    // Find account by token
    let account;
    try {
      account = await MT5Account.findOne({ eaToken }).exec();
    } catch (dbError: any) {
      logger.error('Database error finding EA account:', {
        message: dbError?.message || String(dbError),
        stack: dbError?.stack,
        tokenPrefix: eaToken.substring(0, 8),
        errorName: dbError?.name,
        errorCode: dbError?.code,
      });
      res.status(500).json({
        success: false,
        message: 'Database error during authentication',
      });
      return;
    }

    if (!account) {
      logger.warn(`Invalid EA token attempted: ${eaToken.substring(0, 8)}...`);
      res.status(401).json({
        success: false,
        message: 'Invalid EA Token',
      });
      return;
    }
    

    // Check account status
    if (account.status === ACCOUNT_STATUS.SUSPENDED || account.status === ACCOUNT_STATUS.INACTIVE) {
      res.status(403).json({
        success: false,
        message: 'Account is suspended or inactive',
      });
      return;
    }

    // Get user
    let user;
    try {
      user = await User.findById(account.userId);
    } catch (dbError: any) {
      logger.error('Database error finding user:', {
        message: dbError?.message || String(dbError),
        stack: dbError?.stack,
        accountId: account._id,
      });
      res.status(500).json({
        success: false,
        message: 'Database error during authentication',
      });
      return;
    }

    if (!user || !user.isActive) {
      res.status(403).json({
        success: false,
        message: 'User account is inactive',
      });
      return;
    }

    // Check subscription (allow in development mode)
    const isDevelopment = process.env.NODE_ENV === 'development';
    let subscription = null;
    
    try {
      if (!isDevelopment) {
        subscription = await Subscription.findOne({
          userId: user._id,
          status: SUBSCRIPTION_STATUS.ACTIVE,
          currentPeriodEnd: { $gte: new Date() },
        });

        if (!subscription) {
          logger.warn(`EA connection attempt with expired subscription: ${account._id}`);
          res.status(403).json({
            success: false,
            message: 'Subscription expired or inactive',
          });
          return;
        }
      } else {
        // In development, try to find subscription but don't require it
        subscription = await Subscription.findOne({
          userId: user._id,
          status: SUBSCRIPTION_STATUS.ACTIVE,
          currentPeriodEnd: { $gte: new Date() },
        });
      }
    } catch (subError: any) {
      // Log but continue (subscription check is optional in dev)
      logger.debug('Subscription lookup error (non-critical):', {
        message: subError?.message || String(subError),
        accountId: account._id,
      });
    }

    // Attach to request
    req.eaAccount = account;
    req.eaUser = user;
    if (subscription) {
      req.eaSubscription = subscription;
    }

    // Update last heartbeat timestamp (don't fail if this errors)
    try {
      // Use findByIdAndUpdate instead of save() to avoid validation issues
      await MT5Account.findByIdAndUpdate(
        account._id,
        {
          lastHeartbeat: new Date(),
          connectionStatus: 'online',
        },
        { 
          new: false, // Don't return updated doc
          runValidators: false, // Skip validators for performance
        }
      );
    } catch (saveError: any) {
      // Log but don't fail authentication if save fails
      logger.warn(`Failed to update account heartbeat timestamp for ${account._id}:`, {
        message: saveError?.message || String(saveError),
        error: saveError,
      });
    }

    next();
  } catch (error: any) {
    logger.error('EA authentication unexpected error:', {
      message: error?.message || String(error),
      stack: error?.stack,
      path: req.path,
      token: req.headers['x-ea-token'] ? `${(req.headers['x-ea-token'] as string).substring(0, 8)}...` : 'none',
    });
    
    // Return error response directly instead of calling next()
    // This prevents the error from going to the global error handler
    // and ensures we return a proper status code
    if (!res.headersSent) {
      if (error instanceof UnauthorizedError) {
        res.status(401).json({
          success: false,
          message: error.message,
        });
        return;
      }
      if (error instanceof ForbiddenError) {
        res.status(403).json({
          success: false,
          message: error.message,
        });
        return;
      }
      
      // For unexpected errors, return 500 but with a clear message
      // Clean error message to avoid JSON parsing issues
      const errorMessage = config.nodeEnv === 'development' 
        ? (error?.message || 'Authentication error').substring(0, 200)
        : 'Authentication error';
      
      res.status(500).json({
        success: false,
        message: errorMessage,
      });
      return;
    }
  }
};

