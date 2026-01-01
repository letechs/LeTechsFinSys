/**
 * Payment Tracking Service
 * Records all payment attempts, methods, and creates payment records
 */

import { Payment, IPayment, PaymentMethodType, PaymentStatus } from '../../models/Payment';
import { PaymentAttempt, IPaymentAttempt, PaymentAttemptStatus } from '../../models/PaymentAttempt';
import { PaymentMethod, IPaymentMethod, PaymentMethodStatus } from '../../models/PaymentMethod';
import { logger } from '../../utils/logger';
import mongoose from 'mongoose';

export interface RecordPaymentAttemptParams {
  userId: string;
  paymentId?: string; // If this is a retry attempt
  paymentMethod: PaymentMethodType;
  amount: number; // In cents
  currency: string;
  gateway: string;
  gatewayTransactionId?: string;
  gatewayErrorCode?: string;
  gatewayErrorMessage?: string;
  failureReason?: string;
  failureCode?: string;
  metadata?: Record<string, any>;
}

export interface CreatePaymentParams {
  userId: string;
  paymentMethod: PaymentMethodType;
  paymentMethodId?: string;
  amount: number; // In cents
  currency: string;
  gateway: string;
  gatewayTransactionId?: string;
  gatewayPaymentIntentId?: string;
  gatewayChargeId?: string;
  subscriptionId?: string;
  invoiceNumber?: string;
  amountAfterDiscount?: number;
  discountAmount?: number;
  taxAmount?: number;
  feeAmount?: number;
  description?: string;
  metadata?: Record<string, any>;
  createdBy?: string; // Admin user ID for manual payments
}

export class PaymentTrackingService {
  /**
   * Record a payment attempt
   */
  async recordPaymentAttempt(params: RecordPaymentAttemptParams): Promise<IPaymentAttempt> {
    try {
      // Get attempt number
      let attemptNumber = 1;
      let isRetry = false;
      let previousAttemptId: mongoose.Types.ObjectId | undefined;

      if (params.paymentId) {
        // This is a retry attempt
        const previousAttempts = await PaymentAttempt.find({
          paymentId: new mongoose.Types.ObjectId(params.paymentId),
        })
          .sort({ attemptNumber: -1 })
          .limit(1)
          .lean();

        if (previousAttempts.length > 0) {
          attemptNumber = previousAttempts[0].attemptNumber + 1;
          isRetry = true;
          previousAttemptId = previousAttempts[0]._id;
        }
      } else {
        // First attempt - check if there are any previous attempts for this user
        const previousAttempts = await PaymentAttempt.find({
          userId: new mongoose.Types.ObjectId(params.userId),
        })
          .sort({ createdAt: -1 })
          .limit(1)
          .lean();

        if (previousAttempts.length > 0) {
          // Check if last attempt was recent (within 1 hour) and failed
          const lastAttempt = previousAttempts[0];
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
          if (lastAttempt.createdAt > oneHourAgo && lastAttempt.status === 'failed') {
            attemptNumber = lastAttempt.attemptNumber + 1;
            isRetry = true;
            previousAttemptId = lastAttempt._id;
          }
        }
      }

      // Determine status
      let status: PaymentAttemptStatus = 'pending';
      if (params.gatewayErrorCode || params.failureReason) {
        status = 'failed';
      }

      const attempt = await PaymentAttempt.create({
        userId: new mongoose.Types.ObjectId(params.userId),
        paymentId: params.paymentId ? new mongoose.Types.ObjectId(params.paymentId) : undefined,
        attemptNumber,
        status,
        paymentMethod: params.paymentMethod,
        amount: params.amount,
        currency: params.currency,
        gateway: params.gateway,
        gatewayTransactionId: params.gatewayTransactionId,
        gatewayErrorCode: params.gatewayErrorCode,
        gatewayErrorMessage: params.gatewayErrorMessage,
        failureReason: params.failureReason,
        failureCode: params.failureCode,
        isRetry,
        previousAttemptId,
        metadata: params.metadata || {},
        initiatedAt: new Date(),
      });

      logger.info(`Recorded payment attempt #${attemptNumber} for user ${params.userId} - Status: ${status}`);
      return attempt;
    } catch (error: any) {
      logger.error(`Failed to record payment attempt: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update payment attempt status
   */
  async updatePaymentAttemptStatus(
    attemptId: string,
    status: PaymentAttemptStatus,
    gatewayTransactionId?: string
  ): Promise<IPaymentAttempt> {
    const attempt = await PaymentAttempt.findByIdAndUpdate(
      attemptId,
      {
        status,
        completedAt: new Date(),
        ...(gatewayTransactionId && { gatewayTransactionId }),
      },
      { new: true }
    );

    if (!attempt) {
      throw new Error('Payment attempt not found');
    }

    return attempt;
  }

  /**
   * Create a payment record
   */
  async createPayment(params: CreatePaymentParams): Promise<IPayment> {
    try {
      // Calculate net amount
      const netAmount = params.amount - (params.feeAmount || 0);

      const payment = await Payment.create({
        userId: new mongoose.Types.ObjectId(params.userId),
        paymentMethod: params.paymentMethod,
        paymentMethodId: params.paymentMethodId,
        amount: params.amount,
        currency: params.currency,
        status: 'processing', // Will be updated when payment completes
        gateway: params.gateway,
        gatewayTransactionId: params.gatewayTransactionId,
        gatewayPaymentIntentId: params.gatewayPaymentIntentId,
        gatewayChargeId: params.gatewayChargeId,
        subscriptionId: params.subscriptionId,
        invoiceNumber: params.invoiceNumber,
        amountAfterDiscount: params.amountAfterDiscount || params.amount,
        discountAmount: params.discountAmount || 0,
        taxAmount: params.taxAmount || 0,
        feeAmount: params.feeAmount || 0,
        netAmount,
        description: params.description,
        metadata: params.metadata || {},
        initiatedAt: new Date(),
        createdBy: params.createdBy ? new mongoose.Types.ObjectId(params.createdBy) : undefined,
      });

      logger.info(`Created payment record ${payment._id} for user ${params.userId}`);
      return payment;
    } catch (error: any) {
      logger.error(`Failed to create payment: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update payment status
   */
  async updatePaymentStatus(
    paymentId: string,
    status: PaymentStatus,
    gatewayTransactionId?: string,
    failureReason?: string,
    failureCode?: string
  ): Promise<IPayment> {
    const updateData: any = {
      status,
    };

    if (status === 'succeeded') {
      updateData.processedAt = new Date();
    } else if (status === 'failed') {
      updateData.failedAt = new Date();
      if (failureReason) updateData.failureReason = failureReason;
      if (failureCode) updateData.failureCode = failureCode;
    }

    if (gatewayTransactionId) {
      updateData.gatewayTransactionId = gatewayTransactionId;
    }

    const payment = await Payment.findByIdAndUpdate(paymentId, updateData, { new: true });

    if (!payment) {
      throw new Error('Payment not found');
    }

    logger.info(`Updated payment ${paymentId} status to ${status}`);
    return payment;
  }

  /**
   * Get or create payment method
   */
  async getOrCreatePaymentMethod(
    userId: string,
    type: PaymentMethodType,
    gateway: string,
    gatewayPaymentMethodId?: string,
    details?: {
      cardDetails?: IPaymentMethod['cardDetails'];
      bankDetails?: IPaymentMethod['bankDetails'];
      cryptoDetails?: IPaymentMethod['cryptoDetails'];
      paypalDetails?: IPaymentMethod['paypalDetails'];
    }
  ): Promise<IPaymentMethod> {
    // Check if payment method already exists
    if (gatewayPaymentMethodId) {
      const existing = await PaymentMethod.findOne({
        userId: new mongoose.Types.ObjectId(userId),
        gatewayPaymentMethodId,
        status: 'active',
      });

      if (existing) {
        // Update last used date
        existing.lastUsedAt = new Date();
        await existing.save();
        return existing;
      }
    }

    // Create new payment method
    const paymentMethod = await PaymentMethod.create({
      userId: new mongoose.Types.ObjectId(userId),
      type,
      status: 'active',
      isDefault: false, // Will be set if this is the first payment method
      gateway,
      gatewayPaymentMethodId,
      cardDetails: details?.cardDetails,
      bankDetails: details?.bankDetails,
      cryptoDetails: details?.cryptoDetails,
      paypalDetails: details?.paypalDetails,
      addedAt: new Date(),
    });

    // If this is the first payment method, set it as default
    const existingMethods = await PaymentMethod.countDocuments({
      userId: new mongoose.Types.ObjectId(userId),
      status: 'active',
    });

    if (existingMethods === 1) {
      paymentMethod.isDefault = true;
      await paymentMethod.save();
    }

    logger.info(`Created payment method ${paymentMethod._id} for user ${userId}`);
    return paymentMethod;
  }

  /**
   * Get user payment history
   */
  async getUserPayments(userId: string, options?: {
    status?: PaymentStatus;
    limit?: number;
    skip?: number;
  }): Promise<{ payments: IPayment[]; total: number }> {
    const query: any = {
      userId: new mongoose.Types.ObjectId(userId),
    };

    if (options?.status) {
      query.status = options.status;
    }

    const payments = await Payment.find(query)
      .sort({ createdAt: -1 })
      .limit(options?.limit || 100)
      .skip(options?.skip || 0)
      .lean();

    const total = await Payment.countDocuments(query);

    return { payments, total };
  }

  /**
   * Get user payment attempts
   */
  async getUserPaymentAttempts(userId: string, paymentId?: string): Promise<IPaymentAttempt[]> {
    const query: any = {
      userId: new mongoose.Types.ObjectId(userId),
    };

    if (paymentId) {
      query.paymentId = new mongoose.Types.ObjectId(paymentId);
    }

    return PaymentAttempt.find(query)
      .sort({ createdAt: -1 })
      .lean();
  }

  /**
   * Get user payment methods
   */
  async getUserPaymentMethods(userId: string): Promise<IPaymentMethod[]> {
    return PaymentMethod.find({
      userId: new mongoose.Types.ObjectId(userId),
      status: 'active',
    })
      .sort({ isDefault: -1, lastUsedAt: -1 })
      .lean();
  }
}

export const paymentTrackingService = new PaymentTrackingService();

