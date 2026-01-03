import { config } from '../../config/env';
import { logger } from '../../utils/logger';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export class EmailService {
  private brevoApiKey: string | null = null;
  private fromEmail: string | null = null;
  private fromName: string = 'LeTechs Copy Trading';
  private isInitialized: boolean = false;

  constructor() {
    this.initializeBrevoApi();
  }

  private initializeBrevoApi(): void {
    console.log('📧 [BREVO] Starting Brevo API initialization...');
    console.log('📧 [BREVO] NODE_ENV:', config.nodeEnv);
    
    // Brevo API configuration - require BREVO_API_KEY
    const brevoApiKey = process.env.BREVO_API_KEY;
    const fromEmail = process.env.SMTP_FROM_EMAIL;
    const fromName = process.env.SMTP_FROM_NAME || 'LeTechs Copy Trading';

    console.log('📧 [BREVO] Config check:', {
      BREVO_API_KEY: brevoApiKey ? 'SET' : 'MISSING',
      SMTP_FROM_EMAIL: fromEmail || 'MISSING',
      SMTP_FROM_NAME: fromName || 'MISSING',
    });

    // In development, allow graceful degradation if API key not configured
    if (config.nodeEnv === 'development' && !brevoApiKey) {
      console.warn('📧 [BREVO] Email service not configured (development mode). Emails will be logged but not sent.');
      logger.warn('📧 Email service not configured. Emails will be logged but not sent.');
      logger.warn('To enable email sending, set BREVO_API_KEY in .env file');
      return;
    }

    // In production, fail explicitly if API key is not configured
    if (!brevoApiKey) {
      const errorMsg = '❌ BREVO_API_KEY MISSING — REFUSING TO START';
      console.error('📧 [BREVO]', errorMsg);
      console.error('📧 [BREVO] Required: BREVO_API_KEY');
      logger.error(errorMsg);
      logger.error('Required: BREVO_API_KEY');
      logger.error('Get your API key from: https://app.brevo.com/settings/keys/api');
      
      // In production, throw error to prevent server from starting without email
      if (config.nodeEnv === 'production') {
        console.error('📧 [BREVO] Throwing error in production - server should not start');
        throw new Error(errorMsg);
      }
      
      console.warn('📧 [BREVO] Setting API client to null (development mode)');
      return;
    }

    if (!fromEmail) {
      const errorMsg = '❌ SMTP_FROM_EMAIL MISSING — REQUIRED FOR EMAIL SENDING';
      console.error('📧 [BREVO]', errorMsg);
      logger.error(errorMsg);
      logger.error('Required: SMTP_FROM_EMAIL (must be verified in Brevo dashboard)');
      
      if (config.nodeEnv === 'production') {
        throw new Error(errorMsg);
      }
      return;
    }

    // Store configuration
    this.brevoApiKey = brevoApiKey;
    this.fromEmail = fromEmail;
    this.fromName = fromName;
    this.isInitialized = true;

    const apiKeyPreview = brevoApiKey.substring(0, 10) + '...';
    console.log(`📧 [BREVO] ✅ API key configured: ${apiKeyPreview}`);
    console.log('📧 [BREVO] ✅ Brevo API client initialized successfully (using REST API)');
    console.log(`📧 [BREVO] From email: ${fromEmail} (${fromName})`);
    logger.info('✅ Brevo API initialized & ready to send emails (REST API)');
    logger.info(`From email: ${fromEmail} (${fromName})`);
  }

  /**
   * Verify Brevo API connection
   */
  async verifyConnection(): Promise<boolean> {
    if (!this.isInitialized || !this.brevoApiKey) {
      logger.warn('Brevo API not initialized. Cannot verify connection.');
      return false;
    }

    // For REST API, we can't easily verify without making a test request
    // Just check if we have the API key
    return this.brevoApiKey !== null;
  }

  /**
   * Check if email service is ready to send emails
   */
  isReady(): boolean {
    return this.isInitialized && this.brevoApiKey !== null && this.fromEmail !== null;
  }

  /**
   * Send email using Brevo REST API
   */
  async sendEmail(options: EmailOptions): Promise<void> {
    logger.info(`📧 [EMAIL] Attempting to send email to: ${options.to}, Subject: ${options.subject}`);
    
    if (!this.isReady()) {
      const errorMsg = 'Brevo API not initialized. Cannot send email.';
      logger.error(`❌ ${errorMsg}`);
      logger.error('This usually means BREVO_API_KEY is missing or invalid.');
      logger.error('Config Check:', {
        BREVO_API_KEY: process.env.BREVO_API_KEY ? 'SET' : 'MISSING',
        SMTP_FROM_EMAIL: this.fromEmail || 'MISSING',
        SMTP_FROM_NAME: this.fromName || 'MISSING',
      });
      
      // In production, throw error so it's caught and logged properly
      if (config.nodeEnv === 'production') {
        throw new Error(errorMsg);
      }
      
      // In development, just log (don't throw to allow testing)
      logger.warn('📧 EMAIL (NOT SENT - Brevo API not configured):');
      logger.warn(`   To: ${options.to}`);
      logger.warn(`   Subject: ${options.subject}`);
      return;
    }

    try {
      // Prepare email payload for Brevo API
      const emailPayload = {
        sender: {
          name: this.fromName!,
          email: this.fromEmail!,
        },
        to: [
          {
            email: options.to,
          },
        ],
        subject: options.subject,
        htmlContent: options.html,
        textContent: options.text || options.html.replace(/<[^>]*>/g, ''), // Strip HTML for text version
      };

      console.log(`📧 [EMAIL] Sending email to ${options.to} from ${this.fromEmail}`);
      console.log(`📧 [EMAIL] Subject: ${options.subject}`);
      logger.info(`📤 [EMAIL] Sending email to ${options.to} from ${this.fromEmail}`);

      // Send email via Brevo REST API
      const apiUrl = 'https://api.brevo.com/v3/smtp/email';
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': this.brevoApiKey!,
          'content-type': 'application/json',
        },
        body: JSON.stringify(emailPayload),
      });

      // Handle response
      if (!response.ok) {
        const errorData: any = await response.json().catch(() => ({}));
        const statusText = response.statusText || 'Unknown error';
        const status = response.status;
        
        console.error(`❌ [EMAIL] Brevo API error: ${status} ${statusText}`);
        console.error(`❌ [EMAIL] Error response:`, JSON.stringify(errorData, null, 2));
        
        logger.error(`❌ Failed to send email to ${options.to}:`, {
          status,
          statusText,
          error: errorData,
        });

        let errorMessage = errorData?.message || errorData?.error || statusText;
        
        // Provide helpful error messages
        if (status === 401) {
          errorMessage = 'Brevo API authentication failed (401 Unauthorized). Please verify your BREVO_API_KEY is correct and has proper permissions. Also check IP authorization in Brevo dashboard (Settings → Security → Authorized IPs).';
        } else if (status === 400) {
          errorMessage = `Brevo API bad request (400). ${errorData?.message || 'Check email format and sender verification.'}`;
        } else if (status === 402) {
          errorMessage = 'Brevo account limit reached. Please check your Brevo account quota.';
        } else if (status === 403) {
          errorMessage = 'Brevo API access forbidden. Check your API key permissions and sender verification.';
        }
        
        throw new Error(`Failed to send email: ${errorMessage}`);
      }

      const responseData: any = await response.json();
      const messageId = responseData?.messageId || 'N/A';
      
      console.log(`✅ [EMAIL] Email sent successfully to ${options.to}: ${messageId}`);
      logger.info(`✅ [EMAIL] Email sent successfully to ${options.to}: ${messageId}`);
    } catch (error: any) {
      console.error(`❌ [EMAIL] Failed to send email to ${options.to}:`, error?.message || error);
      console.error(`❌ [EMAIL] Error code: ${error?.code || 'unknown'}`);
      
      // Log full error details for debugging
      if (error?.stack) {
        console.error(`❌ [EMAIL] Error stack:`, error.stack);
      }
      logger.error(`❌ Failed to send email to ${options.to}:`, error);
      logger.error('Email error details:', {
        message: error?.message || error,
        code: error?.code,
        stack: error?.stack,
      });
      
      throw new Error(`Failed to send email: ${error?.message || 'Unknown error'}`);
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

// Initialize email service
console.log('📧 [EMAIL] Initializing EmailService...');
export const emailService = new EmailService();
console.log('📧 [EMAIL] EmailService instance created');
