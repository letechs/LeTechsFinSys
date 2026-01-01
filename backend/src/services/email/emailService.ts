import nodemailer from 'nodemailer';
import { config } from '../../config/env';
import { logger } from '../../utils/logger';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export class EmailService {
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    this.initializeTransporter();
  }

  private initializeTransporter(): void {
    // Use Gmail SMTP (free) or custom SMTP from environment
    const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
    const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
    const smtpUser = process.env.SMTP_USER || process.env.SMTP_EMAIL;
    const smtpPass = process.env.SMTP_PASSWORD || process.env.SMTP_APP_PASSWORD;
    
    // For Gmail: secure MUST be false for port 587 (STARTTLS), true only for port 465 (SSL)
    // This is critical for Railway/cloud deployments
    const smtpSecure = smtpPort === 465;

    // In development, if no SMTP configured, log warning but don't fail
    if (config.nodeEnv === 'development' && !smtpUser && !smtpPass) {
      logger.warn('Email service not configured. Emails will be logged but not sent.');
      logger.warn('To enable email sending, set SMTP_EMAIL and SMTP_PASSWORD in .env file');
      logger.warn('For Gmail: Use App Password (not regular password) - https://support.google.com/accounts/answer/185833');
      return;
    }

    if (!smtpUser || !smtpPass) {
      logger.warn('SMTP credentials not fully configured. Email service will log emails but not send.');
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure, // false for 587 (STARTTLS), true for 465 (SSL)
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
        // TLS configuration for Gmail
        tls: {
          rejectUnauthorized: false, // Accept self-signed certs (required for some cloud providers)
        },
      });

      logger.info(`Email service initialized: ${smtpHost}:${smtpPort} (secure: ${smtpSecure}, user: ${smtpUser})`);
      
      // Verify SMTP connection on startup (for debugging)
      this.transporter.verify((error: any, success: any) => {
        if (error) {
          logger.error('❌ SMTP connection verification failed:', error);
          logger.error('SMTP verify error details:', {
            message: error.message,
            code: error.code,
            command: error.command,
            response: error.response,
            responseCode: error.responseCode,
          });
        } else {
          logger.info('✅ SMTP connection verified successfully - ready to send emails');
        }
      });
    } catch (error: any) {
      logger.error('Failed to initialize email transporter:', error);
      logger.error('Error details:', {
        message: error.message,
        code: error.code,
        stack: error.stack,
      });
    }
  }

  /**
   * Verify SMTP connection
   */
  async verifyConnection(): Promise<boolean> {
    if (!this.transporter) {
      logger.warn('Email transporter not initialized. Cannot verify connection.');
      return false;
    }

    try {
      await this.transporter.verify();
      logger.info('✅ SMTP connection verified successfully');
      return true;
    } catch (error: any) {
      logger.error('❌ SMTP connection verification failed:', error);
      logger.error('Verification error details:', {
        message: error.message,
        code: error.code,
        command: error.command,
        response: error.response,
        responseCode: error.responseCode,
      });
      return false;
    }
  }

  /**
   * Send email
   */
  async sendEmail(options: EmailOptions): Promise<void> {
    const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_EMAIL || 'noreply@letechs.com';
    const fromName = process.env.SMTP_FROM_NAME || 'LeTechs Copy Trading';

    // In development without SMTP, just log the email
    if (!this.transporter) {
      logger.info('📧 EMAIL (NOT SENT - SMTP not configured):');
      logger.info(`   To: ${options.to}`);
      logger.info(`   Subject: ${options.subject}`);
      logger.info(`   Body: ${options.text || options.html.substring(0, 200)}...`);
      return;
    }

    try {
      const mailOptions = {
        from: `"${fromName}" <${fromEmail}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || options.html.replace(/<[^>]*>/g, ''), // Strip HTML for text version
      };

      logger.debug(`Attempting to send email to ${options.to} from ${fromEmail}`);
      const info = await this.transporter.sendMail(mailOptions);
      logger.info(`✅ Email sent successfully to ${options.to}: ${info.messageId}`);
    } catch (error: any) {
      logger.error(`❌ Failed to send email to ${options.to}:`, error);
      logger.error('Email error details:', {
        message: error.message,
        code: error.code,
        command: error.command,
        response: error.response,
        responseCode: error.responseCode,
        stack: error.stack,
      });
      
      // Provide more helpful error messages for common Gmail errors
      let errorMessage = error.message || 'Unknown error';
      if (error.responseCode === 535) {
        errorMessage = 'Gmail authentication failed. Please check your App Password.';
      } else if (error.responseCode === 550 || error.responseCode === 553) {
        errorMessage = `Gmail rejected the email. From address (${fromEmail}) must match the authenticated email address.`;
      } else if (error.code === 'EAUTH') {
        errorMessage = 'Email authentication failed. Check your SMTP credentials.';
      } else if (error.code === 'ECONNECTION') {
        errorMessage = 'Could not connect to SMTP server. Check your network connection.';
      }
      
      throw new Error(`Failed to send email: ${errorMessage}`);
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(email: string, resetToken: string, resetUrl: string): Promise<void> {
    const subject = 'Reset Your Password - LeTechs Copy Trading';
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your Password</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h1 style="color: #2563eb; margin-top: 0;">Password Reset Request</h1>
          <p>Hello,</p>
          <p>You requested to reset your password for your LeTechs Copy Trading account.</p>
          <p>Click the button below to reset your password. This link will expire in 1 hour.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Reset Password</a>
          </div>
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #2563eb;">${resetUrl}</p>
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            If you didn't request this password reset, please ignore this email. Your password will remain unchanged.
          </p>
          <p style="color: #666; font-size: 14px;">
            This link expires in 1 hour for security reasons.
          </p>
        </div>
        <div style="text-align: center; color: #999; font-size: 12px; margin-top: 30px;">
          <p>LeTechs Copy Trading Platform</p>
          <p>This is an automated message, please do not reply.</p>
        </div>
      </body>
      </html>
    `;

    await this.sendEmail({
      to: email,
      subject,
      html,
    });
  }

  /**
   * Send email verification email
   */
  async sendVerificationEmail(email: string, verificationToken: string, verificationUrl: string): Promise<void> {
    const subject = 'Verify Your Email - LeTechs Copy Trading';
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify Your Email</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h1 style="color: #2563eb; margin-top: 0;">Verify Your Email Address</h1>
          <p>Hello,</p>
          <p>Thank you for registering with LeTechs Copy Trading!</p>
          <p>Please verify your email address by clicking the button below:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" style="background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Verify Email</a>
          </div>
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #2563eb;">${verificationUrl}</p>
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            This verification link will expire in 24 hours.
          </p>
          <p style="color: #666; font-size: 14px;">
            If you didn't create an account, please ignore this email.
          </p>
        </div>
        <div style="text-align: center; color: #999; font-size: 12px; margin-top: 30px;">
          <p>LeTechs Copy Trading Platform</p>
          <p>This is an automated message, please do not reply.</p>
        </div>
      </body>
      </html>
    `;

    await this.sendEmail({
      to: email,
      subject,
      html,
    });
  }
}

export const emailService = new EmailService();

