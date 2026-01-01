import mongoose, { Document, Schema } from 'mongoose';
import crypto from 'crypto';

export interface IPasswordResetToken extends Document {
  userId: mongoose.Types.ObjectId;
  token: string; // Hashed token
  expiresAt: Date;
  used: boolean;
  createdAt: Date;
  
  // Methods
  isExpired(): boolean;
  markAsUsed(): Promise<void>;
}

const passwordResetTokenSchema = new Schema<IPasswordResetToken>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    token: {
      type: String,
      required: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 }, // Auto-delete expired tokens
    },
    used: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for finding active tokens
passwordResetTokenSchema.index({ userId: 1, used: 1, expiresAt: 1 });

// Method to check if token is expired
passwordResetTokenSchema.methods.isExpired = function (this: IPasswordResetToken): boolean {
  return new Date() > this.expiresAt;
};

// Method to mark token as used
passwordResetTokenSchema.methods.markAsUsed = async function (this: IPasswordResetToken): Promise<void> {
  this.used = true;
  await this.save();
};

/**
 * Hash a token for storage
 */
export function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generate a random reset token
 */
export function generateResetToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export const PasswordResetToken = mongoose.model<IPasswordResetToken>('PasswordResetToken', passwordResetTokenSchema);

