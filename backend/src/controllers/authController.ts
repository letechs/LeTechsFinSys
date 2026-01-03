import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth/authService';
import { passwordResetService } from '../services/auth/passwordResetService';
import { emailVerificationService } from '../services/auth/emailVerificationService';
import { ValidationError } from '../utils/errors';
import { body } from 'express-validator';
import { validatePasswordStrength } from '../utils/passwordValidation';

export class AuthController {
  /**
   * Register new user
   * POST /api/auth/register
   */
  register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Validation is handled by runValidations middleware
      // Extract data from request body
      const { email, password, name } = req.body;
      
      console.log(`📝 [REGISTER] Registration attempt for: ${email}`);

      // Additional check for required fields (in case validation middleware didn't catch it)
      if (!email || !password || !name) {
        throw new ValidationError('Email, password, and name are required');
      }

      console.log(`📝 [REGISTER] Calling authService.register for: ${email}`);
      const result = await authService.register({
        email,
        password,
        name,
      });
      
      console.log(`✅ [REGISTER] Registration successful for: ${email}`);

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: result,
      });
    } catch (error: any) {
      console.error(`❌ [REGISTER] Registration error for ${req.body?.email || 'unknown'}:`, error?.message || error);
      next(error);
    }
  };

  /**
   * Login user
   * POST /api/auth/login
   */
  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Validation is handled by runValidations middleware
      // Extract data from request body
      const { email, password } = req.body;

      // Additional check for required fields (in case validation middleware didn't catch it)
      if (!email || !password) {
        throw new ValidationError('Email and password are required');
      }

      const result = await authService.login({
        email,
        password,
      });

      res.json({
        success: true,
        message: 'Login successful',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get current user
   * GET /api/auth/me
   */
  getMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ValidationError('User not authenticated');
      }

      res.json({
        success: true,
        data: req.user,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Request password reset
   * POST /api/auth/forgot-password
   */
  forgotPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email } = req.body;

      if (!email) {
        throw new ValidationError('Email is required');
      }

      await passwordResetService.requestPasswordReset(email);

      // Always return success to prevent email enumeration
      res.json({
        success: true,
        message: 'If an account exists with this email, a password reset link has been sent.',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Reset password with token
   * POST /api/auth/reset-password
   */
  resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        throw new ValidationError('Token and new password are required');
      }

      await passwordResetService.resetPassword(token, newPassword);

      res.json({
        success: true,
        message: 'Password reset successful. Please login with your new password.',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Verify email with token
   * POST /api/auth/verify-email
   */
  verifyEmail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { token } = req.body;

      if (!token) {
        throw new ValidationError('Verification token is required');
      }

      await emailVerificationService.verifyEmail(token);

      res.json({
        success: true,
        message: 'Email verified successfully.',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Resend verification email
   * POST /api/auth/resend-verification
   */
  resendVerification = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ValidationError('User not authenticated');
      }

      await emailVerificationService.resendVerificationEmail(req.user._id.toString());

      res.json({
        success: true,
        message: 'Verification email sent successfully.',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Verify reset token (for frontend validation)
   * GET /api/auth/verify-reset-token?token=xxx
   */
  verifyResetToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { token } = req.query;

      if (!token || typeof token !== 'string') {
        res.json({
          success: false,
          valid: false,
        });
        return;
      }

      const isValid = await passwordResetService.verifyResetToken(token);

      res.json({
        success: true,
        valid: isValid,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const authController = new AuthController();

// Validation rules
export const registerValidation = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .custom((value) => {
      const validation = validatePasswordStrength(value);
      if (!validation.isValid) {
        throw new Error(validation.errors[0]); // Return first error
      }
      return true;
    }),
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2 })
    .withMessage('Name must be at least 2 characters long'),
];

export const loginValidation = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
];

export const forgotPasswordValidation = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
];

export const resetPasswordValidation = [
  body('token')
    .notEmpty()
    .withMessage('Reset token is required'),
  body('newPassword')
    .notEmpty()
    .withMessage('New password is required')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .custom((value) => {
      const validation = validatePasswordStrength(value);
      if (!validation.isValid) {
        throw new Error(validation.errors[0]);
      }
      return true;
    }),
];

export const verifyEmailValidation = [
  body('token')
    .notEmpty()
    .withMessage('Verification token is required'),
];

