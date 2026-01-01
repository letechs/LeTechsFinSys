import mongoose, { Document, Schema } from 'mongoose';
import crypto from 'crypto';

export interface IEmailVerificationToken extends Document {
  userId: mongoose.Types.ObjectId;
  token: string; // Hashed token
  email: string; // Email being verified
  expiresAt: Date;
  used: boolean;
  createdAt: Date;
  
  // Methods
  isExpired(): boolean;
  markAsUsed(): Promise<void>;
}

const emailVerificationTokenSchema = new Schema<IEmailVerificationToken>(
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
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
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
emailVerificationTokenSchema.index({ userId: 1, used: 1, expiresAt: 1 });

// Method to check if token is expired
emailVerificationTokenSchema.methods.isExpired = function (this: IEmailVerificationToken): boolean {
  return new Date() > this.expiresAt;
};

// Method to mark token as used
emailVerificationTokenSchema.methods.markAsUsed = async function (this: IEmailVerificationToken): Promise<void> {
  this.used = true;
  await this.save();
};

/**
 * Hash a token for storage
 */
export function hashVerificationToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generate a random verification token
 */
export function generateVerificationToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export const EmailVerificationToken = mongoose.model<IEmailVerificationToken>('EmailVerificationToken', emailVerificationTokenSchema);

