import { User } from '../../models';
import { EmailVerificationToken, hashVerificationToken, generateVerificationToken } from '../../models/EmailVerificationToken';
import { emailService } from '../email/emailService';
import { config } from '../../config/env';
import { ValidationError, UnauthorizedError } from '../../utils/errors';
import { logger } from '../../utils/logger';

export class EmailVerificationService {
  // Token expiry: 24 hours
  private readonly TOKEN_EXPIRY_HOURS = 24;

  /**
   * Generate and send verification email
   */
  async sendVerificationEmail(userId: string, email: string): Promise<void> {
    // Invalidate any existing unused tokens for this user
    await EmailVerificationToken.updateMany(
      { userId, used: false },
      { used: true }
    );

    // Generate new token
    const token = generateVerificationToken();
    const hashedToken = hashVerificationToken(token);

    // Set expiry time
    const expiresAt = new Date(Date.now() + this.TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

    // Save token to database
    await EmailVerificationToken.create({
      userId,
      token: hashedToken,
      email: email.toLowerCase(),
      expiresAt,
      used: false,
    });

    // Generate verification URL
    const verificationUrl = `${config.frontendUrl}/verify-email?token=${token}`;

    // Send email
    try {
      await emailService.sendVerificationEmail(email, token, verificationUrl);
      logger.info(`Verification email sent to: ${email}`);
    } catch (error: any) {
      logger.error(`Failed to send verification email to ${email}:`, error);
      // Don't throw - token is still valid, user can request resend
    }
  }

  /**
   * Verify email using token
   */
  async verifyEmail(token: string): Promise<void> {
    if (!token) {
      throw new ValidationError('Verification token is required');
    }

    // Hash the provided token to compare with stored hash
    const hashedToken = hashVerificationToken(token);

    // Find token in database
    const verificationToken = await EmailVerificationToken.findOne({
      token: hashedToken,
      used: false,
    }).populate('userId');

    if (!verificationToken) {
      throw new UnauthorizedError('Invalid or expired verification token');
    }

    // Check if token is expired
    if (verificationToken.isExpired()) {
      await verificationToken.markAsUsed();
      throw new UnauthorizedError('Verification token has expired');
    }

    // Get user
    const user = verificationToken.userId as any; // Populated user
    if (!user) {
      throw new ValidationError('User not found');
    }

    // Verify email matches
    if (user.email.toLowerCase() !== verificationToken.email.toLowerCase()) {
      throw new ValidationError('Email does not match verification token');
    }

    // Mark email as verified
    user.emailVerified = true;
    user.emailVerifiedAt = new Date();
    await user.save();

    // Mark token as used
    await verificationToken.markAsUsed();

    // Invalidate all other verification tokens for this user
    await EmailVerificationToken.updateMany(
      { userId: user._id, used: false },
      { used: true }
    );

    logger.info(`Email verified for user: ${user.email}`);
  }

  /**
   * Resend verification email
   */
  async resendVerificationEmail(userId: string): Promise<void> {
    const user = await User.findById(userId);
    if (!user) {
      throw new ValidationError('User not found');
    }

    if (user.emailVerified) {
      throw new ValidationError('Email is already verified');
    }

    await this.sendVerificationEmail(userId, user.email);
  }

  /**
   * Verify token (for frontend validation)
   */
  async verifyToken(token: string): Promise<boolean> {
    if (!token) {
      return false;
    }

    const hashedToken = hashVerificationToken(token);
    const verificationToken = await EmailVerificationToken.findOne({
      token: hashedToken,
      used: false,
    });

    if (!verificationToken || verificationToken.isExpired()) {
      return false;
    }

    return true;
  }
}

export const emailVerificationService = new EmailVerificationService();

