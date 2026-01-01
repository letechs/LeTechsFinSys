/**
 * Invoice Service
 * Handles invoice generation, numbering, and management
 */

import { Invoice, IInvoice, IInvoiceLineItem } from '../../models/Invoice';
import { Payment } from '../../models/Payment';
import { logger } from '../../utils/logger';
import mongoose from 'mongoose';

export interface CreateInvoiceParams {
  userId: string;
  lineItems: IInvoiceLineItem[];
  subtotal: number; // In cents
  discountAmount?: number; // In cents
  taxAmount?: number; // In cents
  total: number; // In cents
  currency?: string;
  dueDate?: Date; // If not provided, defaults to 30 days from now
  subscriptionId?: string;
  subscriptionPeriod?: {
    start: Date;
    end: Date;
  };
  billingAddress?: IInvoice['billingAddress'];
  notes?: string;
  customerNotes?: string;
  metadata?: Record<string, any>;
  createdBy?: string; // Admin user ID
}

export class InvoiceService {
  /**
   * Generate next invoice number
   * Format: INV-YYYY-NNNN (e.g., INV-2025-0001)
   */
  private async generateInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;
    
    // Find the highest invoice number for this year
    const lastInvoice = await Invoice.findOne({
      invoiceNumber: { $regex: `^${prefix}` },
    })
      .sort({ invoiceNumber: -1 })
      .lean();
    
    let nextNumber = 1;
    if (lastInvoice) {
      // Extract number from last invoice (e.g., "INV-2025-0042" -> 42)
      const match = lastInvoice.invoiceNumber.match(/-(\d+)$/);
      if (match) {
        nextNumber = parseInt(match[1], 10) + 1;
      }
    }
    
    // Format with leading zeros (4 digits)
    const numberStr = nextNumber.toString().padStart(4, '0');
    return `${prefix}${numberStr}`;
  }

  /**
   * Create a new invoice
   */
  async createInvoice(params: CreateInvoiceParams): Promise<IInvoice> {
    try {
      const invoiceNumber = await this.generateInvoiceNumber();
      
      // Calculate due date (default: 30 days from issue date)
      const issueDate = new Date();
      const dueDate = params.dueDate || new Date(issueDate.getTime() + 30 * 24 * 60 * 60 * 1000);
      
      const invoice = await Invoice.create({
        userId: new mongoose.Types.ObjectId(params.userId),
        invoiceNumber,
        status: 'draft',
        issueDate,
        dueDate,
        subtotal: params.subtotal,
        discountAmount: params.discountAmount || 0,
        taxAmount: params.taxAmount || 0,
        total: params.total,
        amountPaid: 0,
        amountDue: params.total,
        currency: params.currency || 'USD',
        lineItems: params.lineItems,
        subscriptionId: params.subscriptionId,
        subscriptionPeriod: params.subscriptionPeriod,
        billingAddress: params.billingAddress,
        notes: params.notes,
        customerNotes: params.customerNotes,
        metadata: params.metadata || {},
        createdBy: params.createdBy ? new mongoose.Types.ObjectId(params.createdBy) : undefined,
      });

      logger.info(`Created invoice ${invoiceNumber} for user ${params.userId}`);
      return invoice;
    } catch (error: any) {
      logger.error(`Failed to create invoice: ${error.message}`);
      throw error;
    }
  }

  /**
   * Mark invoice as sent
   */
  async markInvoiceAsSent(invoiceId: string, emailSent: boolean = true): Promise<IInvoice> {
    const invoice = await Invoice.findByIdAndUpdate(
      invoiceId,
      {
        status: 'sent',
        sentAt: new Date(),
        emailSent,
      },
      { new: true }
    );

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    logger.info(`Marked invoice ${invoice.invoiceNumber} as sent`);
    return invoice;
  }

  /**
   * Link payment to invoice and update invoice status
   */
  async linkPaymentToInvoice(invoiceId: string, paymentId: string, amount: number): Promise<IInvoice> {
    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) {
      throw new Error('Invoice not found');
    }

    // Add payment reference
    const paymentObjectId = new mongoose.Types.ObjectId(paymentId);
    if (!invoice.paymentIds.includes(paymentObjectId)) {
      invoice.paymentIds.push(paymentObjectId);
    }

    // Update amounts
    invoice.amountPaid = (invoice.amountPaid || 0) + amount;
    invoice.amountDue = invoice.total - invoice.amountPaid;

    // Update status
    if (invoice.amountDue <= 0) {
      invoice.status = 'paid';
      invoice.paidDate = new Date();
    } else {
      // Check if overdue
      if (invoice.dueDate < new Date() && invoice.status !== 'paid') {
        invoice.status = 'overdue';
      } else if (invoice.status === 'draft') {
        invoice.status = 'sent';
      }
    }

    await invoice.save();
    logger.info(`Linked payment ${paymentId} to invoice ${invoice.invoiceNumber}`);
    return invoice;
  }

  /**
   * Get invoice by ID
   */
  async getInvoiceById(invoiceId: string): Promise<IInvoice | null> {
    return Invoice.findById(invoiceId)
      .populate('userId', 'email name')
      .populate('paymentIds')
      .lean();
  }

  /**
   * Get invoice by invoice number
   */
  async getInvoiceByNumber(invoiceNumber: string): Promise<IInvoice | null> {
    return Invoice.findOne({ invoiceNumber })
      .populate('userId', 'email name')
      .populate('paymentIds')
      .lean();
  }

  /**
   * Get all invoices for a user
   */
  async getUserInvoices(userId: string, options?: {
    status?: IInvoice['status'];
    limit?: number;
    skip?: number;
  }): Promise<{ invoices: IInvoice[]; total: number }> {
    const query: any = {
      userId: new mongoose.Types.ObjectId(userId),
    };

    if (options?.status) {
      query.status = options.status;
    }

    const invoices = await Invoice.find(query)
      .sort({ createdAt: -1 })
      .limit(options?.limit || 100)
      .skip(options?.skip || 0)
      .populate('paymentIds')
      .lean();

    const total = await Invoice.countDocuments(query);

    return { invoices, total };
  }

  /**
   * Update invoice status (e.g., mark as overdue)
   */
  async updateInvoiceStatus(invoiceId: string, status: IInvoice['status']): Promise<IInvoice> {
    const invoice = await Invoice.findByIdAndUpdate(
      invoiceId,
      { status },
      { new: true }
    );

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    logger.info(`Updated invoice ${invoice.invoiceNumber} status to ${status}`);
    return invoice;
  }

  /**
   * Check and update overdue invoices
   */
  async checkOverdueInvoices(): Promise<number> {
    const now = new Date();
    const result = await Invoice.updateMany(
      {
        status: { $in: ['sent', 'draft'] },
        dueDate: { $lt: now },
        amountDue: { $gt: 0 },
      },
      {
        status: 'overdue',
      }
    );

    if (result.modifiedCount > 0) {
      logger.info(`Marked ${result.modifiedCount} invoices as overdue`);
    }

    return result.modifiedCount || 0;
  }
}

export const invoiceService = new InvoiceService();

