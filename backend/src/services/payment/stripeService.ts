/**
 * Stripe Payment Service
 * Isolated payment provider implementation
 * Handles all Stripe-specific logic
 */

import Stripe from 'stripe';
import { config } from '../../config/env';
import { logger } from '../../utils/logger';
import { IPaymentProvider, CheckoutData, CheckoutSession, WebhookEvent, PaymentResult } from './IPaymentProvider';
import { User } from '../../models/User';
import { globalConfigService } from '../config/globalConfigService';

export class StripeService implements IPaymentProvider {
  private stripe: Stripe | null = null;
  private readonly priceIds: {
    eaLicenseMonthly: string;
    eaLicenseYearly: string;
    fullAccessMonthly: string;
    fullAccessYearly: string;
    masterAddOn: string;
    slaveAddOn: string;
  };

  constructor() {
    // Allow service to be created even without Stripe key (for development)
    // Will throw error when actually trying to use Stripe methods
    if (config.stripe.secretKey) {
      logger.info('🔍 [STRIPE DEBUG] Starting key processing...');
      
      // STEP 1: Get raw key
      let rawKey = config.stripe.secretKey;
      const rawKeyBuffer = Buffer.from(rawKey);
      logger.info(`🔍 [STRIPE DEBUG] Step 1 - Raw key from config:`, {
        length: rawKey.length,
        first10Chars: rawKey.substring(0, 10),
        last10Chars: rawKey.substring(rawKey.length - 10),
        first5BytesHex: rawKeyBuffer.slice(0, 5).toString('hex'),
        hasUTF8BOM: rawKeyBuffer[0] === 0xEF && rawKeyBuffer[1] === 0xBB && rawKeyBuffer[2] === 0xBF,
        hasUTF16BOM: rawKey.charCodeAt(0) === 0xFEFF,
        hasControlChars: /[\u0000-\u001F\u007F]/.test(rawKey),
        hasCRLF: /\r|\n/.test(rawKey),
      });
      
      // STEP 2: Remove UTF-16 BOM
      if (rawKey.charCodeAt(0) === 0xFEFF) {
        rawKey = rawKey.slice(1);
        logger.info('🔍 [STRIPE DEBUG] Step 2 - Removed UTF-16 BOM');
      } else {
        logger.info('🔍 [STRIPE DEBUG] Step 2 - No UTF-16 BOM found');
      }
      
      // STEP 3: Remove UTF-8 BOM (byte level)
      if (rawKeyBuffer[0] === 0xEF && rawKeyBuffer[1] === 0xBB && rawKeyBuffer[2] === 0xBF) {
        rawKey = rawKey.slice(1); // Remove first char if it's BOM
        logger.info('🔍 [STRIPE DEBUG] Step 3 - Removed UTF-8 BOM');
      } else {
        logger.info('🔍 [STRIPE DEBUG] Step 3 - No UTF-8 BOM found');
      }
      
      // STEP 4: Remove ALL control characters
      const beforeControlCharRemoval = rawKey;
      const cleanKey = rawKey.replace(/[\u0000-\u001F\u007F]/g, '').trim();
      if (beforeControlCharRemoval !== cleanKey) {
        logger.info(`🔍 [STRIPE DEBUG] Step 4 - Removed control characters. Before: ${beforeControlCharRemoval.length}, After: ${cleanKey.length}`);
      } else {
        logger.info('🔍 [STRIPE DEBUG] Step 4 - No control characters found');
      }
      
      const cleanKeyBuffer = Buffer.from(cleanKey);
      
      // Log full key for debugging - this is critical to see if key matches dashboard
      logger.info(`🔍 [STRIPE DEBUG] Step 5 - Final cleaned key:`, {
        length: cleanKey.length,
        first10Chars: cleanKey.substring(0, 10),
        last10Chars: cleanKey.substring(cleanKey.length - 10),
        first5BytesHex: cleanKeyBuffer.slice(0, 5).toString('hex'),
        startsWithSkTest: cleanKey.startsWith('sk_test_'),
        startsWithSkLive: cleanKey.startsWith('sk_live_'),
        fullKey: cleanKey, // ⚠️ FULL KEY LOGGED - Compare this with Stripe Dashboard
        keyCharCodes: cleanKey.split('').slice(0, 10).map(c => c.charCodeAt(0)), // First 10 char codes
      });
      
      // Validate key format
      if (!cleanKey.startsWith('sk_test_') && !cleanKey.startsWith('sk_live_')) {
        logger.error(`🔍 [STRIPE DEBUG] Validation failed - Invalid format. Key starts with: ${cleanKey.substring(0, 20)}`);
        throw new Error('Invalid Stripe secret key format');
      }
      
      // Validate key length (Stripe test keys are typically 107 chars, live keys are 107 chars)
      if (cleanKey.length < 100) {
        logger.error(`🔍 [STRIPE DEBUG] Validation failed - Key too short: ${cleanKey.length} chars`);
        throw new Error(`Invalid Stripe key length: ${cleanKey.length}`);
      }
      
      logger.info('🔍 [STRIPE DEBUG] Step 6 - Creating Stripe instance...');
      this.stripe = new Stripe(cleanKey);
      logger.info(`✅ Stripe service initialized with key: ${cleanKey.substring(0, 20)}...${cleanKey.substring(cleanKey.length - 10)} (length: ${cleanKey.length})`);
      
      // STEP 7: Test the key immediately
      logger.info('🔍 [STRIPE DEBUG] Step 7 - Testing key with Stripe API...');
      this.stripe.customers.list({ limit: 1 })
        .then((customers: any) => {
          logger.info(`✅ [STRIPE DEBUG] Key test SUCCESS! Can access Stripe API. Found ${customers.data.length} customers.`);
        })
        .catch((error: any) => {
          logger.error(`❌ [STRIPE DEBUG] Key test FAILED:`, {
            type: error.type,
            message: error.message,
            statusCode: error.statusCode,
            code: error.code,
            raw: error.raw,
          });
        });
    } else {
      // In development, log warning but don't crash
      if (config.nodeEnv === 'development') {
        logger.warn('⚠️  STRIPE_SECRET_KEY not set. Stripe features will not work until configured.');
      } else {
        throw new Error('STRIPE_SECRET_KEY is required in production');
      }
    }

    // Price IDs - These need to be set in environment variables or Stripe dashboard
    // For now, using placeholder structure - will be configured via env vars
    this.priceIds = {
      eaLicenseMonthly: process.env.STRIPE_PRICE_EA_LICENSE_MONTHLY || '',
      eaLicenseYearly: process.env.STRIPE_PRICE_EA_LICENSE_YEARLY || '',
      fullAccessMonthly: process.env.STRIPE_PRICE_FULL_ACCESS_MONTHLY || '',
      fullAccessYearly: process.env.STRIPE_PRICE_FULL_ACCESS_YEARLY || '',
      masterAddOn: process.env.STRIPE_PRICE_MASTER_ADDON || '',
      slaveAddOn: process.env.STRIPE_PRICE_SLAVE_ADDON || '',
    };

    logger.info('Stripe service initialized');
  }

  /**
   * Check if Stripe is configured
   * Returns non-null Stripe instance or throws error
   */
  private ensureStripeConfigured(): Stripe {
    if (!this.stripe || !config.stripe.secretKey) {
      throw new Error('Stripe is not configured. Please set STRIPE_SECRET_KEY in environment variables.');
    }
    return this.stripe;
  }

  /**
   * Create a Stripe customer if doesn't exist
   */
  async getOrCreateCustomer(userId: string, email: string): Promise<string> {
    logger.info('🔍 [STRIPE DEBUG] getOrCreateCustomer called', { userId, email });
    const stripe = this.ensureStripeConfigured();
    
    // Debug: Check what key the Stripe instance is using
    const currentKey = config.stripe.secretKey || '';
    const currentKeyBuffer = Buffer.from(currentKey);
    logger.info('🔍 [STRIPE DEBUG] Current key state in getOrCreateCustomer:', {
      keyLength: currentKey.length,
      first10Chars: currentKey.substring(0, 10),
      last10Chars: currentKey.substring(currentKey.length - 10),
      first5BytesHex: currentKeyBuffer.slice(0, 5).toString('hex'),
      stripeInstanceExists: !!stripe,
    });
    
    try {
      // Check if user already has Stripe customer ID
      const user = await User.findById(userId);
      if (user?.stripeCustomerId) {
        logger.info('🔍 [STRIPE DEBUG] User has existing Stripe customer ID, verifying...', { customerId: user.stripeCustomerId });
        // Verify customer still exists in Stripe
        try {
          await stripe.customers.retrieve(user.stripeCustomerId);
          logger.info('🔍 [STRIPE DEBUG] Existing customer verified');
          return user.stripeCustomerId;
        } catch (error: any) {
          // Customer doesn't exist in Stripe, create new one
          logger.warn(`🔍 [STRIPE DEBUG] Existing customer ${user.stripeCustomerId} not found in Stripe, creating new customer`, {
            errorType: error.type,
            errorMessage: error.message,
          });
        }
      }

      // Create new Stripe customer
      logger.info('🔍 [STRIPE DEBUG] Creating new Stripe customer...', { email, userId });
      
      const customer = await stripe.customers.create({
        email,
        metadata: {
          userId,
        },
      });
      
      logger.info('🔍 [STRIPE DEBUG] Customer created successfully', { customerId: customer.id });

      // Save customer ID to user
      await User.findByIdAndUpdate(userId, {
        stripeCustomerId: customer.id,
        stripeCustomerEmail: email,
      });

      logger.info(`Created Stripe customer ${customer.id} for user ${userId}`);
      return customer.id;
    } catch (error: any) {
      const currentKey = config.stripe.secretKey || '';
      const currentKeyBuffer = Buffer.from(currentKey);
      logger.error(`❌ [STRIPE DEBUG] Error creating Stripe customer - FULL DETAILS:`, {
        errorType: error.type,
        errorMessage: error.message,
        statusCode: error.statusCode,
        errorCode: error.code,
        errorHeaders: error.headers,
        errorRaw: error.raw,
        errorStack: error.stack?.substring(0, 500), // Limit stack trace
        currentKeyLength: currentKey.length,
        currentKeyPreview: currentKey.substring(0, 20) + '...' + currentKey.substring(currentKey.length - 10),
        currentKeyFirstBytes: currentKeyBuffer.slice(0, 5).toString('hex'),
        userId,
        email,
      });
      throw new Error(`Failed to create Stripe customer: ${error.message}`);
    }
  }

  /**
   * Get customer's existing currency from Stripe subscriptions/invoices/schedules/discounts/quotes
   * Returns 'usd' if customer has existing USD items, otherwise returns 'aed'
   * Stripe doesn't allow mixing currencies, so we need to check all possible sources
   */
  private async getCustomerCurrency(customerId: string): Promise<'usd' | 'aed'> {
    try {
      const stripe = this.ensureStripeConfigured();
      
      // 1. Check for active subscriptions first (most common case)
      try {
        const subscriptions = await stripe.subscriptions.list({
          customer: customerId,
          status: 'active',
          limit: 10,
        });

        if (subscriptions.data.length > 0) {
          const subscription = subscriptions.data[0];
          // Check if subscription is actually active (not expired)
          const periodEnd = (subscription as any).current_period_end;
          if (periodEnd) {
            const expiryDate = new Date(periodEnd * 1000);
            const now = new Date();
            // If subscription expired, don't use its currency (user can checkout in AED)
            if (expiryDate < now) {
              logger.info(`Customer ${customerId} has expired subscription - can use AED`);
              // Check if grace period ended - if so, user can checkout in AED
              const globalConfig = await globalConfigService.getConfig();
              const gracePeriodDays = globalConfig.gracePeriod.days;
              const gracePeriodEnd = new Date(expiryDate.getTime() + gracePeriodDays * 24 * 60 * 60 * 1000);
              if (now > gracePeriodEnd) {
                logger.info(`Customer ${customerId} grace period ended - can checkout in AED`);
                return 'aed';
              }
            }
          }
          const currency = (subscription.items.data[0]?.price?.currency || 'usd').toLowerCase();
          logger.info(`Customer ${customerId} has active ${currency.toUpperCase()} subscriptions`);
          return currency === 'usd' ? 'usd' : 'aed';
        }
      } catch (error: any) {
        logger.warn(`Error checking active subscriptions: ${error.message}`);
      }

      // 2. Check for subscription schedules
      try {
        const schedules = await stripe.subscriptionSchedules.list({
          customer: customerId,
          limit: 10,
        });

        if (schedules.data.length > 0) {
          const schedule = schedules.data[0];
          // Get currency from the subscription associated with the schedule
          if (schedule.subscription) {
            const sub = await stripe.subscriptions.retrieve(schedule.subscription as string);
            const currency = (sub.items.data[0]?.price?.currency || 'usd').toLowerCase();
            logger.info(`Customer ${customerId} has ${currency.toUpperCase()} subscription schedule`);
            return currency === 'usd' ? 'usd' : 'aed';
          }
        }
      } catch (error: any) {
        logger.warn(`Error checking subscription schedules: ${error.message}`);
      }

      // 3. Check for any subscriptions (including past ones)
      try {
        const allSubscriptions = await stripe.subscriptions.list({
          customer: customerId,
          limit: 10,
        });

        if (allSubscriptions.data.length > 0) {
          const subscription = allSubscriptions.data[0];
          const currency = (subscription.items.data[0]?.price?.currency || 'usd').toLowerCase();
          logger.info(`Customer ${customerId} has historical ${currency.toUpperCase()} subscriptions`);
          return currency === 'usd' ? 'usd' : 'aed';
        }
      } catch (error: any) {
        logger.warn(`Error checking all subscriptions: ${error.message}`);
      }

      // 4. Check for customer discounts (can be currency-specific)
      try {
        const customer = await stripe.customers.retrieve(customerId);
        if (customer && typeof customer === 'object' && 'discount' in customer && customer.discount) {
          // Discount exists, check if it's associated with a subscription
          // If customer has a discount, they likely have USD subscriptions
          logger.info(`Customer ${customerId} has active discount - assuming USD`);
          return 'usd';
        }
      } catch (error: any) {
        logger.warn(`Error checking customer discounts: ${error.message}`);
      }

      // 5. Check for quotes
      try {
        const quotes = await stripe.quotes.list({
          customer: customerId,
          limit: 10,
        });

        if (quotes.data.length > 0) {
          const quote = quotes.data[0];
          const currency = (quote.currency || 'usd').toLowerCase();
          logger.info(`Customer ${customerId} has ${currency.toUpperCase()} quotes`);
          return currency === 'usd' ? 'usd' : 'aed';
        }
      } catch (error: any) {
        logger.warn(`Error checking quotes: ${error.message}`);
      }

      // 6. Check invoices as fallback
      try {
        const invoices = await stripe.invoices.list({
          customer: customerId,
          limit: 10,
        });

        if (invoices.data.length > 0) {
          const invoice = invoices.data[0];
          const currency = (invoice.currency || 'usd').toLowerCase();
          logger.info(`Customer ${customerId} has ${currency.toUpperCase()} invoices`);
          return currency === 'usd' ? 'usd' : 'aed';
        }
      } catch (error: any) {
        logger.warn(`Error checking invoices: ${error.message}`);
      }

      // 7. Check for invoice items (one-time charges)
      try {
        const invoiceItems = await stripe.invoiceItems.list({
          customer: customerId,
          limit: 10,
        });

        if (invoiceItems.data.length > 0) {
          const invoiceItem = invoiceItems.data[0];
          const currency = (invoiceItem.currency || 'usd').toLowerCase();
          logger.info(`Customer ${customerId} has ${currency.toUpperCase()} invoice items`);
          return currency === 'usd' ? 'usd' : 'aed';
        }
      } catch (error: any) {
        logger.warn(`Error checking invoice items: ${error.message}`);
      }

      // Default to AED for new customers
      logger.info(`Customer ${customerId} has no existing currency items - using AED`);
      return 'aed';
    } catch (error: any) {
      logger.error(`Error checking customer currency for ${customerId}: ${error.message}`);
      // If we can't determine, default to USD to be safe (existing customers likely have USD)
      // This prevents errors but may not be ideal - admin should migrate these customers
      return 'usd';
    }
  }

  /**
   * Create checkout session with dynamic pricing
   * Supports custom amounts with discounts applied
   */
  async createCheckoutSession(data: CheckoutData): Promise<CheckoutSession> {
    // Declare variables outside try block for error handling
    let customerId: string = '';
    let checkoutCurrency: 'usd' | 'aed' = 'aed';
    let USD_TO_AED = 3.67;
    let MASTER_PRICE = 10;
    let SLAVE_PRICE = 5;
    const EA_LICENSE_PRICE = 29;
    const FULL_ACCESS_PRICE = 99;
    
    try {
      customerId = await this.getOrCreateCustomer(data.userId, data.email);
      
      if (!customerId) {
        throw new Error('Failed to get or create customer');
      }

      // Check customer's existing currency to avoid mixing currencies error
      const customerCurrency = await this.getCustomerCurrency(customerId);
      logger.info(`Using currency: ${customerCurrency.toUpperCase()} for customer ${customerId}`);

      // Build line items with dynamic pricing
      const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

      // Get prices from global configuration (not hardcoded)
      const globalConfig = await globalConfigService.getConfig();
      MASTER_PRICE = globalConfig.addOnPricing?.masterPrice ?? 10; // Default to $10/month if not configured
      SLAVE_PRICE = globalConfig.addOnPricing?.slavePrice ?? 5; // Default to $5/month if not configured
      
      // Get USD to AED conversion rate (default: 3.67)
      USD_TO_AED = globalConfig.currencyConversion?.usdToAed ?? 3.67;
      
      // Helper function to convert USD to AED (in cents/fils)
      const convertUsdToAed = (usdAmount: number): number => {
        return Math.round(usdAmount * USD_TO_AED * 100);
      };
      
      // Determine which currency to use based on customer's existing subscriptions
      checkoutCurrency = customerCurrency;
      
      // Log currency decision for debugging
      logger.info(`[CHECKOUT] Customer ${customerId} - Using ${checkoutCurrency.toUpperCase()} currency for checkout`);

      // Add subscription tier if provided (with dynamic pricing)
      if (data.tier) {
        let basePrice = 0;
        if (data.tier === 'EA_LICENSE') {
          basePrice = EA_LICENSE_PRICE;
        } else if (data.tier === 'FULL_ACCESS') {
          basePrice = FULL_ACCESS_PRICE;
        }

        if (basePrice > 0) {
          // Get billing cycle from metadata or default to monthly
          const billingCycle = (data.metadata?.billingCycle as 'monthly' | 'yearly') || 'monthly';
          
          // Adjust price for yearly billing (apply yearly discount)
          let adjustedPrice = basePrice;
          if (billingCycle === 'yearly') {
            // Yearly pricing: EA License $299/year (save 14%), Full Access $999/year (save 16%)
            if (data.tier === 'EA_LICENSE') {
              adjustedPrice = 299 / 12; // $24.92/month equivalent
            } else if (data.tier === 'FULL_ACCESS') {
              adjustedPrice = 999 / 12; // $83.25/month equivalent
            }
          }
          
          // Apply discount if provided
          const finalPriceUsd = data.discountPercentage && data.discountPercentage > 0
            ? adjustedPrice * (1 - data.discountPercentage / 100)
            : adjustedPrice;
          
          // Convert to target currency
          const finalPrice = checkoutCurrency === 'aed' 
            ? convertUsdToAed(finalPriceUsd)
            : Math.round(finalPriceUsd * 100); // USD in cents

          lineItems.push({
            price_data: {
              currency: checkoutCurrency,
              product_data: {
                name: `${data.tier === 'EA_LICENSE' ? 'EA License' : 'Full Access'} Subscription`,
                description: `${billingCycle === 'yearly' ? 'Yearly' : 'Monthly'} subscription for ${data.tier === 'EA_LICENSE' ? 'EA License' : 'Full Access'} tier`,
              },
              unit_amount: finalPrice,
              recurring: {
                interval: billingCycle === 'yearly' ? 'year' : 'month',
              },
            },
            quantity: 1,
          });
        }
      }

      // Add add-ons if provided (with dynamic pricing)
      if (data.addOns) {
        if (data.addOns.masters && data.addOns.masters > 0) {
          const basePriceUsd = MASTER_PRICE * data.addOns.masters;
          const finalPriceUsd = data.discountPercentage && data.discountPercentage > 0
            ? basePriceUsd * (1 - data.discountPercentage / 100)
            : basePriceUsd;
          
          // Convert to target currency (total, then divide by quantity for per-unit price)
          const totalPrice = checkoutCurrency === 'aed'
            ? convertUsdToAed(finalPriceUsd)
            : Math.round(finalPriceUsd * 100); // USD in cents
          const pricePerUnit = Math.round(totalPrice / data.addOns.masters);

          lineItems.push({
            price_data: {
              currency: checkoutCurrency,
              product_data: {
                name: 'Additional Master Account' + (data.addOns.masters > 1 ? `s (${data.addOns.masters})` : ''),
                description: `Additional master account${data.addOns.masters > 1 ? 's' : ''} - Monthly recurring`,
              },
              unit_amount: pricePerUnit,
              recurring: {
                interval: 'month',
              },
            },
            quantity: data.addOns.masters,
          });
        }

        if (data.addOns.slaves && data.addOns.slaves > 0) {
          const basePriceUsd = SLAVE_PRICE * data.addOns.slaves;
          const finalPriceUsd = data.discountPercentage && data.discountPercentage > 0
            ? basePriceUsd * (1 - data.discountPercentage / 100)
            : basePriceUsd;
          
          // Convert to target currency (total, then divide by quantity for per-unit price)
          const totalPrice = checkoutCurrency === 'aed'
            ? convertUsdToAed(finalPriceUsd)
            : Math.round(finalPriceUsd * 100); // USD in cents
          const pricePerUnit = Math.round(totalPrice / data.addOns.slaves);

          lineItems.push({
            price_data: {
              currency: checkoutCurrency,
              product_data: {
                name: 'Additional Slave Account' + (data.addOns.slaves > 1 ? `s (${data.addOns.slaves})` : ''),
                description: `Additional slave account${data.addOns.slaves > 1 ? 's' : ''} - Monthly recurring`,
              },
              unit_amount: pricePerUnit,
              recurring: {
                interval: 'month',
              },
            },
            quantity: data.addOns.slaves,
          });
        }
      }

      if (lineItems.length === 0) {
        throw new Error('No items to purchase');
      }

      // Determine checkout mode: use 'subscription' if any line items have recurring prices
      const hasRecurringItems = lineItems.some(item => 
        (item.price_data as any)?.recurring || 
        (typeof item.price === 'string' && item.price.includes('recurring'))
      );
      
      // Also check if we're adding add-ons (which are always recurring)
      const hasAddOns = data.addOns && ((data.addOns.masters ?? 0) > 0 || (data.addOns.slaves ?? 0) > 0);
      
      // Use subscription mode if: tier is provided OR add-ons are provided (recurring) OR any line item is recurring
      const checkoutMode: 'payment' | 'subscription' = (data.tier || hasAddOns || hasRecurringItems) 
        ? 'subscription' 
        : 'payment';

      // Create checkout session
      const stripe = this.ensureStripeConfigured();
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: lineItems,
        mode: checkoutMode, // Use subscription mode for recurring items (tiers or add-ons)
        locale: 'auto', // Auto-detect locale, prevents i18n module loading errors
        success_url: `${config.frontendUrl}/dashboard/subscription?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${config.frontendUrl}/dashboard/subscription?canceled=true`,
        metadata: {
          userId: data.userId,
          tier: data.tier || '',
          masters: data.addOns?.masters?.toString() || '0',
          slaves: data.addOns?.slaves?.toString() || '0',
          discountPercentage: data.discountPercentage?.toString() || '0',
          isRenewal: data.metadata?.isRenewal || 'false',
          usdToAedRate: USD_TO_AED.toString(), // Store conversion rate for reference
          checkoutCurrency: checkoutCurrency, // Store currency used for this checkout
          ...data.metadata,
        },
        allow_promotion_codes: true, // Allow users to enter promo codes
      });

      logger.info(`Created Stripe checkout session ${session.id} for user ${data.userId}`);

      return {
        id: session.id,
        url: session.url || '',
        customerId,
      };
    } catch (error: any) {
      // Check if this is a currency mixing error
      if (error.message && error.message.includes('cannot combine currencies')) {
        // Only retry if we have a customerId (it was successfully created)
        if (!customerId) {
          logger.error('Currency mixing error but customerId not available');
          throw new Error(`Failed to create checkout session: ${error.message}`);
        }
        
        logger.warn(`Currency mixing error detected for customer ${customerId}. Retrying with USD...`);
        
        // If we tried AED but customer has USD items, retry with USD
        if (checkoutCurrency === 'aed') {
          logger.info(`Retrying checkout with USD currency for customer ${customerId}`);
          
          // Retry with USD - update all line items to use USD
          const lineItemsUsd: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
          
          // Rebuild line items with USD
          if (data.tier) {
            let basePrice = 0;
            if (data.tier === 'EA_LICENSE') {
              basePrice = EA_LICENSE_PRICE;
            } else if (data.tier === 'FULL_ACCESS') {
              basePrice = FULL_ACCESS_PRICE;
            }

            if (basePrice > 0) {
              const billingCycle = (data.metadata?.billingCycle as 'monthly' | 'yearly') || 'monthly';
              let adjustedPrice = basePrice;
              if (billingCycle === 'yearly') {
                if (data.tier === 'EA_LICENSE') {
                  adjustedPrice = 299 / 12;
                } else if (data.tier === 'FULL_ACCESS') {
                  adjustedPrice = 999 / 12;
                }
              }
              
              const finalPriceUsd = data.discountPercentage && data.discountPercentage > 0
                ? adjustedPrice * (1 - data.discountPercentage / 100)
                : adjustedPrice;
              
              lineItemsUsd.push({
                price_data: {
                  currency: 'usd',
                  product_data: {
                    name: `${data.tier === 'EA_LICENSE' ? 'EA License' : 'Full Access'} Subscription`,
                    description: `${billingCycle === 'yearly' ? 'Yearly' : 'Monthly'} subscription for ${data.tier === 'EA_LICENSE' ? 'EA License' : 'Full Access'} tier`,
                  },
                  unit_amount: Math.round(finalPriceUsd * 100),
                  recurring: {
                    interval: billingCycle === 'yearly' ? 'year' : 'month',
                  },
                },
                quantity: 1,
              });
            }
          }

          if (data.addOns) {
            if (data.addOns.masters && data.addOns.masters > 0) {
              const basePriceUsd = MASTER_PRICE * data.addOns.masters;
              const finalPriceUsd = data.discountPercentage && data.discountPercentage > 0
                ? basePriceUsd * (1 - data.discountPercentage / 100)
                : basePriceUsd;
              
              lineItemsUsd.push({
                price_data: {
                  currency: 'usd',
                  product_data: {
                    name: 'Additional Master Account' + (data.addOns.masters > 1 ? `s (${data.addOns.masters})` : ''),
                    description: `Additional master account${data.addOns.masters > 1 ? 's' : ''} - Monthly recurring`,
                  },
                  unit_amount: Math.round((finalPriceUsd / data.addOns.masters) * 100),
                  recurring: {
                    interval: 'month',
                  },
                },
                quantity: data.addOns.masters,
              });
            }

            if (data.addOns.slaves && data.addOns.slaves > 0) {
              const basePriceUsd = SLAVE_PRICE * data.addOns.slaves;
              const finalPriceUsd = data.discountPercentage && data.discountPercentage > 0
                ? basePriceUsd * (1 - data.discountPercentage / 100)
                : basePriceUsd;
              
              lineItemsUsd.push({
                price_data: {
                  currency: 'usd',
                  product_data: {
                    name: 'Additional Slave Account' + (data.addOns.slaves > 1 ? `s (${data.addOns.slaves})` : ''),
                    description: `Additional slave account${data.addOns.slaves > 1 ? 's' : ''} - Monthly recurring`,
                  },
                  unit_amount: Math.round((finalPriceUsd / data.addOns.slaves) * 100),
                  recurring: {
                    interval: 'month',
                  },
                },
                quantity: data.addOns.slaves,
              });
            }
          }

          // Retry with USD
          const stripe = this.ensureStripeConfigured();
          const hasRecurringItems = lineItemsUsd.some(item => 
            (item.price_data as any)?.recurring
          );
          const hasAddOns = data.addOns && ((data.addOns.masters ?? 0) > 0 || (data.addOns.slaves ?? 0) > 0);
          const checkoutMode: 'payment' | 'subscription' = (data.tier || hasAddOns || hasRecurringItems) 
            ? 'subscription' 
            : 'payment';

          const session = await stripe.checkout.sessions.create({
            customer: customerId,
            payment_method_types: ['card'],
            line_items: lineItemsUsd,
            mode: checkoutMode,
            locale: 'auto',
            success_url: `${config.frontendUrl}/dashboard/subscription?success=true&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${config.frontendUrl}/dashboard/subscription?canceled=true`,
            metadata: {
              userId: data.userId,
              tier: data.tier || '',
              masters: data.addOns?.masters?.toString() || '0',
              slaves: data.addOns?.slaves?.toString() || '0',
              discountPercentage: data.discountPercentage?.toString() || '0',
              isRenewal: data.metadata?.isRenewal || 'false',
              usdToAedRate: USD_TO_AED.toString(),
              checkoutCurrency: 'usd', // Retried with USD
              currencyRetry: 'true', // Flag to indicate this was a retry
              ...data.metadata,
            },
            allow_promotion_codes: true,
          });

          logger.info(`Retry successful: Created Stripe checkout session ${session.id} with USD for user ${data.userId}`);
          
          return {
            id: session.id,
            url: session.url || '',
            customerId,
          };
        }
      }
      
      logger.error('Error creating Stripe checkout session:', error);
      throw new Error(`Failed to create checkout session: ${error.message}`);
    }
  }

  /**
   * Handle webhook events
   */
  async handleWebhook(event: WebhookEvent): Promise<PaymentResult> {
    logger.debug('Handling Stripe webhook event', { eventType: event.type });
    // Ensure Stripe is configured (webhook handlers will use it)
    this.ensureStripeConfigured();
    try {
      const stripeEvent = event.data as Stripe.Event;
      logger.debug('Stripe event received', { type: stripeEvent.type, id: stripeEvent.id });

      switch (stripeEvent.type) {
        case 'checkout.session.completed':
          logger.debug('Routing to handleCheckoutCompleted');
          return await this.handleCheckoutCompleted(stripeEvent);
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          return await this.handleSubscriptionUpdated(stripeEvent);
        case 'customer.subscription.deleted':
          return await this.handleSubscriptionDeleted(stripeEvent);
        case 'invoice.payment_succeeded':
          return await this.handlePaymentSucceeded(stripeEvent);
        case 'invoice.payment_failed':
          return await this.handlePaymentFailed(stripeEvent);
        default:
          // Unhandled events are not errors - just log and return success
          // Stripe sends many events we don't need to handle (charge.succeeded, payment_method.attached, etc.)
          logger.debug(`Unhandled webhook event type: ${stripeEvent.type} (this is normal)`);
          return {
            success: true, // Return success to prevent error logging
            userId: '',
          };
      }
    } catch (error: any) {
      logger.error('Error handling webhook:', error);
      return {
        success: false,
        userId: '',
        error: error.message,
      };
    }
  }

  /**
   * Handle checkout session completed
   */
  private async handleCheckoutCompleted(event: Stripe.Event): Promise<PaymentResult> {
    logger.debug('Handling checkout session completed');
    const session = event.data.object as Stripe.Checkout.Session;
    logger.debug('Checkout session details', { sessionId: session.id, metadata: session.metadata });
    const userId = session.metadata?.userId;

    if (!userId) {
      logger.error('User ID not found in checkout session metadata');
      throw new Error('User ID not found in checkout session metadata');
    }

    // Get subscription if it's a subscription checkout
    let subscriptionId: string | undefined;
    if (session.mode === 'subscription' && session.subscription) {
      subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
    }

    const result = {
      success: true,
      userId,
      subscriptionId,
      customerId: typeof session.customer === 'string' ? session.customer : session.customer?.id,
      tier: session.metadata?.tier,
      amount: session.amount_total ? session.amount_total / 100 : undefined,
      currency: session.currency || 'usd',
      masters: session.metadata?.masters, // Include masters in result
      slaves: session.metadata?.slaves,   // Include slaves in result
    };
    logger.debug('Checkout completed result', {
      success: result.success,
      userId: result.userId,
      tier: result.tier,
      masters: result.masters,
      slaves: result.slaves,
    });
    return result;
  }

  /**
   * Handle subscription updated
   */
  private async handleSubscriptionUpdated(event: Stripe.Event): Promise<PaymentResult> {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

    // Get user by Stripe customer ID
    const user = await User.findOne({ stripeCustomerId: customerId });
    if (!user) {
      throw new Error(`User not found for Stripe customer ${customerId}`);
    }

    // Calculate renewal date from subscription period
    // Access current_period_end safely (Stripe types may vary)
    const periodEnd = (subscription as any).current_period_end;
    const renewalDate = periodEnd ? new Date(periodEnd * 1000) : undefined;

    return {
      success: true,
      userId: user._id.toString(),
      subscriptionId: subscription.id,
      customerId,
      renewalDate,
    };
  }

  /**
   * Handle subscription deleted
   */
  private async handleSubscriptionDeleted(event: Stripe.Event): Promise<PaymentResult> {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

    const user = await User.findOne({ stripeCustomerId: customerId });
    if (!user) {
      throw new Error(`User not found for Stripe customer ${customerId}`);
    }

    return {
      success: true,
      userId: user._id.toString(),
      subscriptionId: subscription.id,
      customerId,
    };
  }

  /**
   * Handle payment succeeded
   */
  private async handlePaymentSucceeded(event: Stripe.Event): Promise<PaymentResult> {
    const stripe = this.ensureStripeConfigured();
    const invoice = event.data.object as Stripe.Invoice;
    
    // Handle customer ID (can be string, Customer object, or null)
    if (!invoice.customer) {
      throw new Error('Invoice customer is null');
    }
    const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer.id;

    const user = await User.findOne({ stripeCustomerId: customerId });
    if (!user) {
      throw new Error(`User not found for Stripe customer ${customerId}`);
    }

    // Handle subscription ID (can be string, Subscription object, or null)
    // Access subscription safely - it may be a string ID or expanded Subscription object
    let subscriptionId: string | undefined;
    let renewalDate: Date | undefined;
    const subscription = (invoice as any).subscription;
    if (subscription) {
      subscriptionId = typeof subscription === 'string' ? subscription : subscription.id;
      
      // Get subscription details to determine renewal date
      if (subscriptionId) {
        try {
          const subscriptionObj = await stripe.subscriptions.retrieve(subscriptionId);
          // Access current_period_end safely (Stripe types may vary)
          const periodEnd = (subscriptionObj as any).current_period_end;
          if (periodEnd) {
            renewalDate = new Date(periodEnd * 1000);
          }
        } catch (error) {
          logger.warn(`Failed to retrieve subscription ${subscriptionId} for renewal date:`, error);
        }
      }
    }

    return {
      success: true,
      userId: user._id.toString(),
      subscriptionId,
      customerId,
      amount: invoice.amount_paid ? invoice.amount_paid / 100 : undefined,
      currency: invoice.currency,
      renewalDate,
    };
  }

  /**
   * Handle payment failed
   */
  private async handlePaymentFailed(event: Stripe.Event): Promise<PaymentResult> {
    const invoice = event.data.object as Stripe.Invoice;
    
    // Handle customer ID (can be string, Customer object, or null)
    if (!invoice.customer) {
      throw new Error('Invoice customer is null');
    }
    const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer.id;

    const user = await User.findOne({ stripeCustomerId: customerId });
    if (!user) {
      throw new Error(`User not found for Stripe customer ${customerId}`);
    }

    logger.warn(`Payment failed for user ${user._id}, invoice ${invoice.id}`);

    // Handle subscription ID (can be string, Subscription object, or null)
    // Access subscription safely - it may be a string ID or expanded Subscription object
    let subscriptionId: string | undefined;
    const subscription = (invoice as any).subscription;
    if (subscription) {
      subscriptionId = typeof subscription === 'string' ? subscription : subscription.id;
    }

    return {
      success: false,
      userId: user._id.toString(),
      subscriptionId,
      customerId,
      error: 'Payment failed',
    };
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(subscriptionId: string): Promise<void> {
    const stripe = this.ensureStripeConfigured();
    try {
      await stripe.subscriptions.cancel(subscriptionId);
      logger.info(`Cancelled Stripe subscription ${subscriptionId}`);
    } catch (error: any) {
      logger.error('Error cancelling subscription:', error);
      throw new Error(`Failed to cancel subscription: ${error.message}`);
    }
  }

  /**
   * Get customer portal URL
   */
  async getCustomerPortalUrl(customerId: string, returnUrl: string): Promise<string> {
    const stripe = this.ensureStripeConfigured();
    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });

      return session.url;
    } catch (error: any) {
      logger.error('Error creating customer portal session:', error);
      throw new Error(`Failed to create customer portal: ${error.message}`);
    }
  }

  /**
   * Retrieve checkout session from Stripe
   */
  async retrieveCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session> {
    const stripe = this.ensureStripeConfigured();
    logger.debug('Retrieving checkout session', { sessionId });
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['customer', 'subscription'],
    });
    logger.debug('Session retrieved', {
      id: session.id,
      status: session.payment_status,
      mode: session.mode,
      metadata: session.metadata,
    });
    return session;
  }

  /**
   * Verify webhook signature
   * Must use raw Buffer for Stripe signature verification
   */
  verifyWebhookSignature(payload: string | Buffer, signature: string): boolean {
    const stripe = this.ensureStripeConfigured();
    try {
      if (!config.stripe.webhookSecret) {
        logger.error('STRIPE_WEBHOOK_SECRET is not set');
        return false;
      }

      // Stripe requires the raw Buffer for signature verification
      // If it's already a Buffer, use it directly; otherwise convert string to Buffer
      const payloadBuffer = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');
      
      stripe.webhooks.constructEvent(payloadBuffer, signature, config.stripe.webhookSecret);
      return true;
    } catch (error) {
      logger.error('Webhook signature verification failed:', error);
      return false;
    }
  }

  // Note: We use dynamic pricing (price_data) instead of fixed price IDs
  // This allows custom amounts per user based on their discounts
  // No need for getPriceIdForTier() method anymore
}

// Export singleton instance
export const stripeService = new StripeService();

