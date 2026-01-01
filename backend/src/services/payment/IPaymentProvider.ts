/**
 * Payment Provider Interface
 * Abstract interface for payment providers (Stripe, PayPal, etc.)
 * This ensures payment code is isolated from business logic
 */

export interface CheckoutData {
  userId: string;
  email: string;
  tier?: 'EA_LICENSE' | 'FULL_ACCESS';
  addOns?: {
    masters?: number;
    slaves?: number;
  };
  discountPercentage?: number;
  metadata?: Record<string, string>;
}

export interface CheckoutSession {
  id: string;
  url: string;
  customerId?: string;
}

export interface WebhookEvent {
  id: string;
  type: string;
  data: any;
  metadata?: Record<string, string>;
}

export interface PaymentResult {
  success: boolean;
  userId: string;
  tier?: string;
  subscriptionId?: string;
  customerId?: string;
  amount?: number;
  currency?: string;
  renewalDate?: Date;
  masters?: string; // Add-on masters from metadata
  slaves?: string; // Add-on slaves from metadata
  error?: string;
}

export interface IPaymentProvider {
  /**
   * Create a checkout session for subscription or add-ons
   */
  createCheckoutSession(data: CheckoutData): Promise<CheckoutSession>;

  /**
   * Handle webhook events from payment provider
   */
  handleWebhook(event: WebhookEvent): Promise<PaymentResult>;

  /**
   * Cancel a subscription
   */
  cancelSubscription(subscriptionId: string): Promise<void>;

  /**
   * Get customer portal URL for subscription management
   */
  getCustomerPortalUrl(customerId: string, returnUrl: string): Promise<string>;

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload: string | Buffer, signature: string): boolean;
}

