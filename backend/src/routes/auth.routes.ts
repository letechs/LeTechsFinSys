import { Router } from 'express';
import {
  authController,
  registerValidation,
  loginValidation,
  forgotPasswordValidation,
  resetPasswordValidation,
  verifyEmailValidation,
} from '../controllers/authController';
import { authenticate } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimit';
import { runValidations } from '../middleware/validator';

const router = Router();

// Public routes
router.post(
  '/register',
  authLimiter,
  runValidations(registerValidation),
  authController.register
);

router.post(
  '/login',
  authLimiter,
  runValidations(loginValidation),
  authController.login
);

// Password reset routes
router.post(
  '/forgot-password',
  authLimiter,
  runValidations(forgotPasswordValidation),
  authController.forgotPassword
);

router.post(
  '/reset-password',
  authLimiter,
  runValidations(resetPasswordValidation),
  authController.resetPassword
);

router.get('/verify-reset-token', authController.verifyResetToken);

// Email verification routes
router.post(
  '/verify-email',
  runValidations(verifyEmailValidation),
  authController.verifyEmail
);

// Protected routes
router.get('/me', authenticate, authController.getMe);
router.post('/resend-verification', authenticate, authController.resendVerification);

export default router;

