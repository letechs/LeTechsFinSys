import { User } from '../../models';
import { PasswordResetToken, hashResetToken, generateResetToken } from '../../models/PasswordResetToken';
import { emailService } from '../email/emailService';
import { config } from '../../config/env';
import { ValidationError, UnauthorizedError } from '../../utils/errors';
import { logger } from '../../utils/logger';

export class PasswordResetService {
  // Token expiry: 1 hour
  private readonly TOKEN_EXPIRY_HOURS = 1;
  // Rate limiting: Max 3 reset requests per email per hour
  private readonly MAX_REQUESTS_PER_HOUR = 3;

  /**
   * Request password reset - sends email with reset link
   */
  async requestPasswordReset(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();

    // Find user
    const user = await User.findOne({ email: normalizedEmail });

    // Always return success to prevent email enumeration
    // But log for security monitoring
    if (!user) {
      logger.warn(`Password reset requested for non-existent email: ${normalizedEmail}`);
      // Return success anyway to prevent email enumeration
      return;
    }

    // Check rate limiting: Count requests in last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentRequests = await PasswordResetToken.countDocuments({
      userId: user._id,
      createdAt: { $gte: oneHourAgo },
    });

    if (recentRequests >= this.MAX_REQUESTS_PER_HOUR) {
      logger.warn(`Password reset rate limit exceeded for user: ${user.email}`);
      // Still return success to prevent timing attacks
      return;
    }

    // Invalidate any existing unused tokens for this user
    await PasswordResetToken.updateMany(
      { userId: user._id, used: false },
      { used: true }
    );

    // Generate new token
    const token = generateResetToken();
    const hashedToken = hashResetToken(token);

    // Set expiry time
    const expiresAt = new Date(Date.now() + this.TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

    // Save token to database
    await PasswordResetToken.create({
      userId: user._id,
      token: hashedToken,
      expiresAt,
      used: false,
    });

    // Generate reset URL
    const resetUrl = `${config.frontendUrl}/reset-password?token=${token}`;

    // Send email
    try {
      await emailService.sendPasswordResetEmail(user.email, token, resetUrl);
      logger.info(`Password reset email sent to: ${user.email}`);
    } catch (error: any) {
      logger.error(`Failed to send password reset email to ${user.email}:`, error);
      // Don't throw error - we don't want to reveal if email sending failed
      // Token is still valid, user can request again
    }
  }

  /**
   * Reset password using token
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    if (!token || !newPassword) {
      throw new ValidationError('Token and new password are required');
    }

    // Hash the provided token to compare with stored hash
    const hashedToken = hashResetToken(token);

    // Find token in database
    const resetToken = await PasswordResetToken.findOne({
      token: hashedToken,
      used: false,
    }).populate('userId');

    if (!resetToken) {
      throw new UnauthorizedError('Invalid or expired reset token');
    }

    // Check if token is expired
    if (resetToken.isExpired()) {
      await resetToken.markAsUsed();
      throw new UnauthorizedError('Reset token has expired');
    }

    // Get user
    const user = resetToken.userId as any; // Populated user
    if (!user) {
      throw new ValidationError('User not found');
    }

    // Check if user is active
    if (!user.isActive) {
      throw new UnauthorizedError('Account is inactive');
    }

    // Update password
    user.password = newPassword;
    // Reset failed login attempts and unlock account
    user.failedLoginAttempts = 0;
    user.accountLockedUntil = undefined;
    await user.save();

    // Mark token as used
    await resetToken.markAsUsed();

    // Invalidate all other reset tokens for this user
    await PasswordResetToken.updateMany(
      { userId: user._id, used: false },
      { used: true }
    );

    logger.info(`Password reset successful for user: ${user.email}`);
  }

  /**
   * Verify reset token (for frontend validation)
   */
  async verifyResetToken(token: string): Promise<boolean> {
    if (!token) {
      return false;
    }

    const hashedToken = hashResetToken(token);
    const resetToken = await PasswordResetToken.findOne({
      token: hashedToken,
      used: false,
    });

    if (!resetToken || resetToken.isExpired()) {
      return false;
    }

    return true;
  }
}

export const passwordResetService = new PasswordResetService();

