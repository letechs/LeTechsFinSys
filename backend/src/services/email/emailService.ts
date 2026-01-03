import * as brevo from '@getbrevo/brevo';
import { config } from '../../config/env';
import { logger } from '../../utils/logger';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export class EmailService {
  private apiClient: any = null;
  private transactionalEmailsApi: any = null;
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

    try {
      // Initialize Brevo API client
      const defaultClient = (brevo as any).ApiClient?.instance;
      if (defaultClient) {
        this.apiClient = defaultClient;
        const apiKeyAuth = defaultClient.authentications['api-key'];
        if (apiKeyAuth) {
          apiKeyAuth.apiKey = brevoApiKey;
        }
      }

      // Initialize Transactional Emails API
      this.transactionalEmailsApi = new (brevo as any).TransactionalEmailsApi();

      this.isInitialized = true;
      console.log('📧 [BREVO] ✅ Brevo API client initialized successfully');
      console.log(`📧 [BREVO] From email: ${fromEmail} (${fromName})`);
      logger.info('✅ Brevo API initialized & ready to send emails');
      logger.info(`From email: ${fromEmail} (${fromName})`);
    } catch (error: any) {
      console.error('📧 [BREVO] ❌ Failed to initialize API client:', error.message);
      logger.error('❌ Failed to initialize Brevo API client:', error);
      logger.error('Error details:', {
        message: error.message,
        stack: error.stack,
      });
      this.isInitialized = false;
    }
  }

  /**
   * Verify Brevo API connection
   */
  async verifyConnection(): Promise<boolean> {
    if (!this.isInitialized || !this.transactionalEmailsApi) {
      logger.warn('Brevo API not initialized. Cannot verify connection.');
      return false;
    }

    // Brevo API doesn't have a direct "verify" endpoint
    // We'll test by checking if API client is configured
    try {
      if (this.apiClient && this.apiClient.authentications['api-key']?.apiKey) {
        logger.info('✅ Brevo API client is configured');
        return true;
      }
      return false;
    } catch (error: any) {
      logger.error('❌ Brevo API verification failed:', error);
      return false;
    }
  }

  /**
   * Check if email service is ready to send emails
   */
  isReady(): boolean {
    return this.isInitialized && this.transactionalEmailsApi !== null;
  }

  /**
   * Send email using Brevo API
   */
  async sendEmail(options: EmailOptions): Promise<void> {
    logger.info(`📧 [EMAIL] Attempting to send email to: ${options.to}, Subject: ${options.subject}`);
    
    const fromEmail = process.env.SMTP_FROM_EMAIL;
    const fromName = process.env.SMTP_FROM_NAME || 'LeTechs Copy Trading';

    if (!fromEmail) {
      logger.error('❌ SMTP_FROM_EMAIL not set - cannot send email');
      throw new Error('SMTP_FROM_EMAIL environment variable is required');
    }

    // Check if API is initialized
    if (!this.isReady()) {
      const errorMsg = 'Brevo API not initialized. Cannot send email.';
      logger.error(`❌ ${errorMsg}`);
      logger.error('This usually means BREVO_API_KEY is missing or invalid.');
      logger.error('Config Check:', {
        BREVO_API_KEY: process.env.BREVO_API_KEY ? 'SET' : 'MISSING',
        SMTP_FROM_EMAIL: fromEmail || 'MISSING',
        SMTP_FROM_NAME: fromName || 'MISSING',
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
      // Create email object for Brevo API
      const sendSmtpEmail = new (brevo as any).SendSmtpEmail();
      sendSmtpEmail.subject = options.subject;
      sendSmtpEmail.htmlContent = options.html;
      sendSmtpEmail.textContent = options.text || options.html.replace(/<[^>]*>/g, ''); // Strip HTML for text version
      sendSmtpEmail.sender = {
        name: fromName,
        email: fromEmail,
      };
      sendSmtpEmail.to = [
        {
          email: options.to,
        },
      ];

      console.log(`📧 [EMAIL] Sending email to ${options.to} from ${fromEmail}`);
      console.log(`📧 [EMAIL] Subject: ${options.subject}`);
      logger.info(`📤 [EMAIL] Sending email to ${options.to} from ${fromEmail}`);

      // Send email via Brevo API with timeout
      const sendPromise = this.transactionalEmailsApi!.sendTransacEmail(sendSmtpEmail);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Email send timeout after 30 seconds')), 30000);
      });

      const response = await Promise.race([sendPromise, timeoutPromise]) as any;
      
      console.log(`✅ [EMAIL] Email sent successfully to ${options.to}: ${response.messageId || 'N/A'}`);
      logger.info(`✅ [EMAIL] Email sent successfully to ${options.to}: ${response.messageId || 'N/A'}`);
    } catch (error: any) {
      console.error(`❌ [EMAIL] Failed to send email to ${options.to}:`, error?.message || error);
      console.error(`❌ [EMAIL] Error code: ${error?.code || 'unknown'}`);
      logger.error(`❌ Failed to send email to ${options.to}:`, error);
      
      // Extract detailed error information
      let errorMessage = error?.message || 'Unknown error';
      let errorCode = error?.code || 'unknown';
      
      // Brevo API specific error handling
      if (error?.response?.body) {
        const errorBody = error.response.body;
        errorMessage = errorBody.message || errorMessage;
        errorCode = errorBody.code || errorCode;
        
        logger.error('Brevo API error details:', {
          message: errorBody.message,
          code: errorBody.code,
          id: errorBody.id,
        });
      } else {
        logger.error('Email error details:', {
          message: error?.message || error,
          code: error?.code,
          stack: error?.stack,
        });
      }

      // Provide helpful error messages
      if (errorCode === 401 || errorMessage?.includes('Invalid API key')) {
        errorMessage = 'Brevo API authentication failed. Please check your BREVO_API_KEY.';
      } else if (errorMessage?.includes('timeout')) {
        errorMessage = 'Email send timeout - Brevo API did not respond in time.';
      } else if (errorMessage?.includes('sender')) {
        errorMessage = `Sender email (${fromEmail}) must be verified in Brevo dashboard.`;
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

// Initialize email service
console.log('📧 [EMAIL] Initializing EmailService...');
export const emailService = new EmailService();
console.log('📧 [EMAIL] EmailService instance created');
