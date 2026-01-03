import jwt, { SignOptions } from 'jsonwebtoken';
import { User, IUser } from '../../models';
import { config } from '../../config/env';
import { UnauthorizedError, ConflictError, ValidationError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { emailVerificationService } from './emailVerificationService';
import { validatePasswordStrength } from '../../utils/passwordValidation';
import { waitForConnection } from '../../config/database';

export interface RegisterData {
  email: string;
  password: string;
  name: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: IUser;
  token: string;
}

export class AuthService {
  /**
   * Register a new user
   */
  async register(data: RegisterData): Promise<AuthResponse> {
    try {
      // Wait for MongoDB connection (will wait up to 5 seconds for reconnection)
      await waitForConnection(5000);

      // Check if user already exists
      const existingUser = await User.findOne({ email: data.email.toLowerCase() });
      
      if (existingUser) {
        throw new ConflictError('User with this email already exists');
      }

      // Validate password strength
      const passwordValidation = validatePasswordStrength(data.password);
      if (!passwordValidation.isValid) {
        throw new ValidationError(passwordValidation.errors.join('. '));
      }

      // Create user (emailVerified defaults to false)
      const user = new User({
        email: data.email.toLowerCase(),
        password: data.password,
        name: data.name,
        role: 'client',
        isActive: true,
        emailVerified: false,
        failedLoginAttempts: 0,
      });

      await user.save();

      // Send verification email (don't block registration if email fails)
      emailVerificationService.sendVerificationEmail(user._id.toString(), user.email).catch((error) => {
        logger.error(`Failed to send verification email to ${user.email}:`, error);
        // Don't throw - user is already registered
      });

      // Generate JWT token
      const token = this.generateToken(user);

      logger.info(`New user registered: ${user.email}`);

      return {
        user,
        token,
      };
    } catch (error: any) {
      logger.error('Registration error:', error);
      if (error.message?.includes('Database connection')) {
        throw new ValidationError('Database connection is not available. Please ensure MongoDB is running.');
      }
      throw error;
    }
  }

  /**
   * Create user (Admin only) - similar to register but allows admin to set role and skip email verification requirement
   */
  async createUser(data: {
    email: string;
    password: string;
    name: string;
    role?: 'client' | 'admin' | 'viewer';
    emailVerified?: boolean;
    isActive?: boolean;
  }): Promise<IUser> {
    try {
      // Wait for MongoDB connection (will wait up to 5 seconds for reconnection)
      await waitForConnection(5000);

      // Check if user already exists
      const existingUser = await User.findOne({ email: data.email.toLowerCase() });
      
      if (existingUser) {
        throw new ConflictError('User with this email already exists');
      }

      // Validate password strength
      const passwordValidation = validatePasswordStrength(data.password);
      if (!passwordValidation.isValid) {
        throw new ValidationError(passwordValidation.errors.join('. '));
      }

      // Create user
      const user = new User({
        email: data.email.toLowerCase(),
        password: data.password,
        name: data.name,
        role: data.role || 'client',
        isActive: data.isActive !== undefined ? data.isActive : true,
        emailVerified: data.emailVerified !== undefined ? data.emailVerified : false,
        failedLoginAttempts: 0,
      });

      await user.save();

      // Send verification email if not already verified (don't block if email fails)
      if (!user.emailVerified) {
        emailVerificationService.sendVerificationEmail(user._id.toString(), user.email).catch((error) => {
          logger.error(`Failed to send verification email to ${user.email}:`, error);
          // Don't throw - user is already created
        });
      }

      logger.info(`New user created by admin: ${user.email} (role: ${user.role})`);

      return user;
    } catch (error: any) {
      logger.error('User creation error:', error);
      if (error.message?.includes('Database connection')) {
        throw new ValidationError('Database connection is not available. Please ensure MongoDB is running.');
      }
      throw error;
    }
  }

  /**
   * Login user
   */
  async login(data: LoginData): Promise<AuthResponse> {
    try {
      // Wait for MongoDB connection (will wait up to 5 seconds for reconnection)
      await waitForConnection(5000);

      // Find user by email
      const user = await User.findOne({ email: data.email.toLowerCase() });

      if (!user) {
        throw new UnauthorizedError('Invalid email or password');
      }

      // Check if user is active
      if (!user.isActive) {
        throw new UnauthorizedError('Account is inactive');
      }

      // Check if email is verified (REQUIRED for login)
      if (!user.emailVerified) {
        throw new UnauthorizedError('Email verification required. Please check your email and verify your account before logging in.');
      }

      // Check if account is locked
      if (user.accountLockedUntil && new Date() < user.accountLockedUntil) {
        const lockoutMinutes = Math.ceil((user.accountLockedUntil.getTime() - Date.now()) / (1000 * 60));
        throw new UnauthorizedError(`Account is temporarily locked. Please try again in ${lockoutMinutes} minute(s).`);
      }

      // If lockout period has passed, reset failed attempts
      if (user.accountLockedUntil && new Date() >= user.accountLockedUntil) {
        user.failedLoginAttempts = 0;
        user.accountLockedUntil = undefined;
      }

      // Verify password
      const isPasswordValid = await user.comparePassword(data.password);

      if (!isPasswordValid) {
        // Increment failed login attempts
        user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;

        // Lock account after 5 failed attempts for 30 minutes
        if (user.failedLoginAttempts >= 5) {
          user.accountLockedUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
          logger.warn(`Account locked due to too many failed login attempts: ${user.email}`);
          await user.save();
          throw new UnauthorizedError('Too many failed login attempts. Account locked for 30 minutes.');
        }

        await user.save();
        throw new UnauthorizedError('Invalid email or password');
      }

      // Reset failed login attempts on successful login
      user.failedLoginAttempts = 0;
      user.accountLockedUntil = undefined;
      user.lastLogin = new Date();
      await user.save();

      // Generate JWT token
      const token = this.generateToken(user);

      logger.info(`User logged in: ${user.email}`);

      return {
        user,
        token,
      };
    } catch (error: any) {
      logger.error('Login error:', error);
      if (error.message?.includes('Database connection')) {
        throw new ValidationError('Database connection is not available. Please ensure MongoDB is running.');
      }
      throw error;
    }
  }

  /**
   * Generate JWT token
   */
  private generateToken(user: IUser): string {
    const payload = {
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
    };

    const secret = config.jwt.secret;
    if (!secret || typeof secret !== 'string') {
      throw new Error('JWT secret is not configured');
    }
    
    return jwt.sign(payload, secret, {
      expiresIn: config.jwt.expiresIn,
    } as SignOptions);
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<IUser> {
    const user = await User.findById(userId);

    if (!user) {
      throw new ValidationError('User not found');
    }

    return user;
  }

  /**
   * Update user profile
   */
  async updateProfile(userId: string, data: { name?: string }): Promise<IUser> {
    const user = await User.findById(userId);

    if (!user) {
      throw new ValidationError('User not found');
    }

    if (data.name) {
      user.name = data.name;
    }

    await user.save();

    return user;
  }

  /**
   * Change password
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    const user = await User.findById(userId);

    if (!user) {
      throw new ValidationError('User not found');
    }

    // Verify current password
    const isPasswordValid = await user.comparePassword(currentPassword);

    if (!isPasswordValid) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    // Validate new password strength
    const passwordValidation = validatePasswordStrength(newPassword);
    if (!passwordValidation.isValid) {
      throw new ValidationError(passwordValidation.errors.join('. '));
    }

    // Update password
    user.password = newPassword;
    // Reset failed login attempts when password is changed
    user.failedLoginAttempts = 0;
    user.accountLockedUntil = undefined;
    await user.save();

    logger.info(`Password changed for user: ${user.email}`);
  }

  /**
   * Update user (Admin only)
   */
  async updateUser(
    userId: string,
    data: { name?: string; email?: string; role?: 'admin' | 'client' | 'viewer'; emailVerified?: boolean; isActive?: boolean }
  ): Promise<IUser> {
    const user = await User.findById(userId);

    if (!user) {
      throw new ValidationError('User not found');
    }

    const oldValue = {
      name: user.name,
      email: user.email,
      role: user.role,
    };

    // Update fields
    if (data.name !== undefined) {
      user.name = data.name;
    }

    if (data.email !== undefined) {
      // Check if email is already taken by another user
      const existingUser = await User.findOne({ 
        email: data.email.toLowerCase(),
        _id: { $ne: userId }
      });

      if (existingUser) {
        throw new ConflictError('Email is already taken by another user');
      }

      user.email = data.email.toLowerCase();
    }

    if (data.role !== undefined) {
      user.role = data.role;
    }

    if (data.emailVerified !== undefined) {
      user.emailVerified = data.emailVerified;
    }

    if (data.isActive !== undefined) {
      user.isActive = data.isActive;
    }

    await user.save();

    logger.info(`User updated: ${user.email}`);

    return user;
  }

  /**
   * Block user (Admin only)
   */
  async blockUser(userId: string): Promise<IUser> {
    const user = await User.findById(userId);

    if (!user) {
      throw new ValidationError('User not found');
    }

    if (!user.isActive) {
      throw new ValidationError('User is already blocked');
    }

    user.isActive = false;
    await user.save();

    logger.info(`User blocked: ${user.email}`);

    return user;
  }

  /**
   * Unblock user (Admin only)
   */
  async unblockUser(userId: string): Promise<IUser> {
    const user = await User.findById(userId);

    if (!user) {
      throw new ValidationError('User not found');
    }

    if (user.isActive) {
      throw new ValidationError('User is already active');
    }

    user.isActive = true;
    await user.save();

    logger.info(`User unblocked: ${user.email}`);

    return user;
  }
}

export const authService = new AuthService();

