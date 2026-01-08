/**
 * Payment Controller
 * Handles payment-related HTTP requests
 * Isolated from business logic - acts as bridge between HTTP and payment service
 */

import { Request, Response, NextFunction } from 'express';
import { stripeService } from '../services/payment/stripeService';
import { subscriptionService } from '../services/subscription/subscriptionService';
import { globalConfigService } from '../services/config/globalConfigService';
import { paymentTrackingService } from '../services/payment/paymentTrackingService';
import { invoiceService } from '../services/invoice/invoiceService';
import { ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';
import { HistoryService } from '../services/history/historyService';
import { User } from '../models/User';
import { config } from '../config/env';
import Stripe from 'stripe';

export class PaymentController {
  /**
   * Create Stripe checkout session
   * POST /api/payment/create-checkout
   */
  createCheckout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ValidationError('User not authenticated');
      }

      const { tier, addOns, billingCycle = 'monthly', isRenewal } = req.body;

      // Validate input
      if (!tier && (!addOns || (addOns.masters === 0 && addOns.slaves === 0))) {
        throw new ValidationError('Either tier or add-ons must be provided');
      }

      if (tier && !['EA_LICENSE', 'FULL_ACCESS'].includes(tier)) {
        throw new ValidationError('Invalid tier. Must be EA_LICENSE or FULL_ACCESS');
      }

      // Get user's hybrid subscription to calculate discount
      const hybridSubscription = await subscriptionService.getHybridSubscription(req.user._id.toString());
      let discountPercentage = 0;

      if (hybridSubscription) {
        // Calculate effective discount
        // Only apply client discount if it's enabled globally and user is a client
        if (hybridSubscription.clientDiscountEnabled && hybridSubscription.isClient) {
          discountPercentage += hybridSubscription.clientDiscountPercentage || 5;
        }
        // Only apply special discount if global offers are enabled
        if (hybridSubscription.globalOffersEnabled && hybridSubscription.specialDiscountPercentage && hybridSubscription.specialDiscountPercentage > 0) {
          if (hybridSubscription.specialDiscountExpiryDate) {
            const expiryDate = new Date(hybridSubscription.specialDiscountExpiryDate);
            if (expiryDate > new Date()) {
              discountPercentage += hybridSubscription.specialDiscountPercentage;
            }
          } else {
            discountPercentage += hybridSubscription.specialDiscountPercentage;
          }
        }
      }

      // Create checkout session
      const checkoutData = {
        userId: req.user._id.toString(),
        email: req.user.email,
        tier: tier as 'EA_LICENSE' | 'FULL_ACCESS' | undefined,
        addOns: addOns ? {
          masters: addOns.masters || 0,
          slaves: addOns.slaves || 0,
        } : undefined,
        discountPercentage: discountPercentage > 0 ? discountPercentage : undefined,
        metadata: {
          billingCycle,
          isRenewal: isRenewal ? 'true' : 'false',
        },
      };

      const session = await stripeService.createCheckoutSession(checkoutData);

      // Log history
      await HistoryService.createEntry({
        userId: req.user._id.toString(),
        actionType: 'checkout_session_created',
        description: `Created checkout session for ${tier || 'add-ons'}`,
        metadata: {
          sessionId: session.id,
          tier,
          addOns,
        },
        performedBy: req.user._id.toString(),
      });

      res.json({
        success: true,
        data: {
          sessionId: session.id,
          url: session.url,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Verify checkout session and update subscription (fallback when webhooks don't work)
   * POST /api/payment/verify-session
   */
  verifySession = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    logger.debug('Verifying checkout session');
    try {
      if (!req.user) {
        throw new ValidationError('User not authenticated');
      }

      const { sessionId } = req.body;
      if (!sessionId) {
        throw new ValidationError('Session ID is required');
      }

      logger.debug('Verifying session', { sessionId, userId: req.user._id.toString() });

      // Retrieve session from Stripe
      const session = await stripeService.retrieveCheckoutSession(sessionId);

      logger.debug('Session retrieved', {
        id: session.id,
        status: session.payment_status,
        mode: session.mode,
        metadata: session.metadata,
      });

      // Verify session belongs to this user
      if (session.metadata?.userId !== req.user._id.toString()) {
        throw new ValidationError('Session does not belong to this user');
      }

      // Only process if payment was successful
      if (session.payment_status !== 'paid') {
        throw new ValidationError(`Payment not completed. Status: ${session.payment_status}`);
      }

      // Check if already processed (prevent duplicate processing)
      // We'll check this by looking at the session's metadata or by checking subscription update time
      logger.debug('Payment successful, processing subscription update');

      // Extract data from session (same as handleCheckoutCompleted does)
      const userId = session.metadata?.userId;
      if (!userId) {
        throw new ValidationError('User ID not found in session metadata');
      }

      // Get subscription ID if it's a subscription checkout
      let subscriptionId: string | undefined;
      if (session.mode === 'subscription' && session.subscription) {
        subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
      }

      // Build result object (same structure as handleCheckoutCompleted returns)
      const result = {
        success: true,
        userId,
        subscriptionId,
        customerId: typeof session.customer === 'string' ? session.customer : session.customer?.id,
        tier: session.metadata?.tier,
        amount: session.amount_total ? session.amount_total / 100 : undefined,
        currency: session.currency || 'usd',
        masters: session.metadata?.masters,
        slaves: session.metadata?.slaves,
      };

      logger.debug('Extracted result', {
        success: result.success,
        userId: result.userId,
        tier: result.tier,
        masters: result.masters,
        slaves: result.slaves,
      });

      // Create a mock event structure for updateSubscriptionFromWebhook
      const mockEvent = {
        id: `evt_verify_${session.id}`,
        type: 'checkout.session.completed',
        data: {
          object: session,
        },
        metadata: session.metadata || {},
      };

      // Use the same update logic as webhook handler
      try {
        await this.updateSubscriptionFromWebhook(result, mockEvent);
        logger.info(`Successfully updated subscription for user ${result.userId} from session verification ${sessionId}`);
      } catch (updateError: any) {
        logger.error(`Failed to update subscription from session verification:`, {
          error: updateError.message,
          stack: updateError.stack,
          userId: result.userId,
          sessionId,
        });
        throw updateError;
      }

      res.json({
        success: true,
        message: 'Session verified and subscription updated',
      });
    } catch (error) {
      logger.error('Error verifying session:', error);
      next(error);
    }
  };

  /**
   * Handle Stripe webhook
   * POST /api/payment/webhook
   */
  handleWebhook = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    logger.debug('Handling Stripe webhook');
    try {
      const signature = req.headers['stripe-signature'] as string;
      logger.debug('Webhook signature received', { hasSignature: !!signature });

      if (!signature) {
        logger.error('Missing Stripe signature in webhook request');
        res.status(400).json({ error: 'Missing signature' });
        return;
      }

      // req.body is a Buffer from express.raw() middleware
      const payload = req.body as Buffer;

      // Verify webhook signature using raw Buffer (required by Stripe)
      const isValid = stripeService.verifyWebhookSignature(payload, signature);
      logger.debug('Webhook signature validation', { isValid });

      if (!isValid) {
        logger.error('Invalid webhook signature');
        res.status(400).json({ error: 'Invalid signature' });
        return;
      }

      // Parse webhook payload as JSON
      const eventData = JSON.parse(payload.toString('utf8'));
      logger.info(`Raw webhook event data:`, {
        type: eventData.type,
        id: eventData.id,
        hasData: !!eventData.data,
        hasObject: !!eventData.data?.object,
        hasMetadata: !!eventData.data?.object?.metadata,
      });
      
      // Extract metadata from the event object (can be in different locations depending on event type)
      let metadata = {};
      if (eventData.data?.object?.metadata) {
        metadata = eventData.data.object.metadata;
      } else if (eventData.object?.metadata) {
        metadata = eventData.object.metadata;
      }
      
      logger.info(`Extracted metadata:`, metadata);
      
      // Handle webhook event
      const event = {
        id: eventData.id,
        type: eventData.type,
        data: eventData, // Pass full event data - stripeService expects Stripe.Event format
        metadata: metadata,
      };

      logger.info(`Received Stripe webhook: ${event.type} (${event.id})`, { 
        metadata,
        eventType: event.type,
        eventId: event.id,
      });

      const result = await stripeService.handleWebhook(event);
      logger.info(`Webhook result for ${event.type}:`, {
        success: result.success,
        userId: result.userId,
        tier: result.tier,
        masters: result.masters,
        slaves: result.slaves,
        error: result.error,
      });

      if (result.success && result.userId) {
        // Update user subscription based on webhook result
        try {
          await this.updateSubscriptionFromWebhook(result, event);
          logger.info(`Successfully updated subscription for user ${result.userId} from webhook ${event.type}`);
        } catch (updateError: any) {
          logger.error(`Failed to update subscription from webhook:`, {
            error: updateError.message,
            stack: updateError.stack,
            userId: result.userId,
            eventType: event.type,
          });
          // Don't throw - we still want to return 200 to Stripe
        }
      } else {
        if (result.error) {
          // Only log as error if there's an actual error (not just unhandled event)
          logger.warn(`Webhook event ${event.type} not handled: ${result.error || 'No userId'}`, {
            result,
          });
        } else {
          logger.warn(`Webhook event ${event.type} returned success=false without error`, {
            result,
          });
        }
      }

      // Always return 200 to Stripe (we've received the webhook)
      res.json({ received: true });
    } catch (error: any) {
      logger.error('Webhook error:', error);
      // Still return 200 to prevent Stripe from retrying
      res.status(200).json({ received: true, error: 'Webhook processed with errors' });
    }
  };

  /**
   * Update subscription from webhook result
   * This bridges payment service to business logic
   */
  private async updateSubscriptionFromWebhook(result: any, event: any): Promise<void> {
    logger.debug('Updating subscription from webhook');
    try {
      const { userId, tier, subscriptionId, customerId, amount, currency, masters: resultMasters, slaves: resultSlaves } = result;
      logger.debug('Extracted webhook values', { userId, tier, subscriptionId, resultMasters, resultSlaves });

      if (!userId) {
        logger.error('No userId in webhook result');
        return;
      }

      // Extract metadata from event - for checkout.session.completed, it's in event.data.object.metadata
      let metadata = event.metadata || {};
      if (event.type === 'checkout.session.completed' && event.data?.object?.metadata) {
        metadata = event.data.object.metadata;
      }
      
      logger.info(`Updating subscription from webhook for user ${userId}`, {
        tier: tier || 'NOT PROVIDED',
        eventType: event.type,
        metadata,
        resultKeys: Object.keys(result),
      });

      // Update Stripe IDs in user
      const updateData: any = {};
      if (subscriptionId) {
        updateData.stripeSubscriptionId = subscriptionId;
      }
      if (customerId) {
        updateData.stripeCustomerId = customerId;
      }

      if (Object.keys(updateData).length > 0) {
        await subscriptionService.updateUserStripeIds(userId, updateData);
      }

      // Handle different webhook event types
      logger.info(`Processing webhook event type: ${event.type}`, {
        userId,
        tier,
        hasMetadata: !!metadata,
        metadataKeys: metadata ? Object.keys(metadata) : [],
      });

      if (event.type === 'checkout.session.completed') {
        // Checkout completed - update tier and/or add-ons
        // Get tier from metadata if not in result (fallback)
        const tierToUse = tier || metadata?.tier;
        
        // Parse add-ons from result first, then fallback to metadata (can be '0' string or undefined)
        const masters = resultMasters !== undefined && resultMasters !== null
          ? parseInt(resultMasters.toString()) || 0
          : (metadata?.masters !== undefined && metadata.masters !== null 
            ? parseInt(metadata.masters.toString()) || 0 
            : 0);
        const slaves = resultSlaves !== undefined && resultSlaves !== null
          ? parseInt(resultSlaves.toString()) || 0
          : (metadata?.slaves !== undefined && metadata.slaves !== null 
            ? parseInt(metadata.slaves.toString()) || 0 
            : 0);
        
        const hasAddOns = masters > 0 || slaves > 0;
        const hasValidTier = tierToUse && tierToUse !== '' && ['EA_LICENSE', 'FULL_ACCESS'].includes(tierToUse);
        
        logger.info(`Processing checkout.session.completed for user ${userId}`, {
          tierFromResult: tier,
          tierFromMetadata: metadata?.tier,
          tierToUse,
          hasValidTier,
          hasAddOns,
          masters,
          slaves,
          fullMetadata: metadata,
        });
        
        // Handle tier update if valid tier is provided
        if (hasValidTier) {
          logger.info(`Valid tier found: ${tierToUse}, proceeding with subscription update`);
          logger.info(`Processing checkout.session.completed for user ${userId}, tier: ${tierToUse}`, {
            metadata,
            isRenewal: metadata?.isRenewal,
          });
          
          // Check if this is a renewal - if so, extend from existing expiry date
          const isRenewal = metadata?.isRenewal === 'true';
          const billingCycle = metadata?.billingCycle || 'monthly';
          
          // Get default renewal period from config
          let defaultRenewalDays = 30;
          try {
            const globalConfig = await globalConfigService.getConfig();
            defaultRenewalDays = globalConfig.defaultRenewalPeriod?.days || 30;
            logger.info(`Retrieved renewal period from config: ${defaultRenewalDays} days`);
          } catch (configError: any) {
            logger.warn(`Failed to get config, using default 30 days:`, configError.message);
          }
          
          const renewalDays = billingCycle === 'yearly' ? 365 : defaultRenewalDays;
          
          let renewalDate: Date;
          if (isRenewal) {
            // Get current subscription to extend from existing expiry date
            const hybridSubscription = await subscriptionService.getHybridSubscription(userId);
            logger.info(`Renewal detected for user ${userId}`, {
              currentRenewalDate: hybridSubscription?.renewalDate,
              currentTier: hybridSubscription?.subscriptionTier,
              newTier: tierToUse,
              renewalDays,
            });
            
            // For renewals, ALWAYS extend from existing expiry date if it exists
            if (hybridSubscription && hybridSubscription.renewalDate) {
              // Extend from existing expiry date by adding days
              renewalDate = new Date(hybridSubscription.renewalDate);
              renewalDate.setDate(renewalDate.getDate() + renewalDays);
              logger.info(`Renewal: Extending from existing expiry date ${hybridSubscription.renewalDate.toISOString()} by ${renewalDays} days to ${renewalDate.toISOString()}`);
            } else {
              // Fallback to current date if no existing expiry
              renewalDate = new Date();
              renewalDate.setDate(renewalDate.getDate() + renewalDays);
              logger.warn(`No existing renewal date found for renewal, using current date + ${renewalDays} days`);
            }
          } else {
            // New subscription - set from current date
            renewalDate = new Date();
            renewalDate.setDate(renewalDate.getDate() + renewalDays);
            logger.info(`New subscription, setting renewal date: ${renewalDate.toISOString()} (current date + ${renewalDays} days)`);
          }
          
          // Set base tier with renewal date (this also sets isExpired = false)
          // NOTE: Passing renewalDate to setBaseTier ensures atomic update
          logger.info(`Setting base tier for user ${userId}: ${tierToUse} with renewal date: ${renewalDate.toISOString()}`);
          try {
            await subscriptionService.setBaseTier(userId, tierToUse as 'EA_LICENSE' | 'FULL_ACCESS', renewalDate);
            logger.info(`Base tier set successfully for user ${userId}: ${tierToUse}`);
          } catch (tierError: any) {
            logger.error(`Failed to set base tier for user ${userId}:`, tierError.message, tierError.stack);
            throw tierError; // Re-throw as this is critical
          }
          
          // Update renewal date (redundant but ensures consistency - setBaseTier already sets it)
          logger.info(`Updating renewal date for user ${userId}: ${renewalDate.toISOString()}`);
          try {
            await subscriptionService.updateRenewalDate(userId, renewalDate);
            logger.info(`✅ Renewal date updated successfully for user ${userId}: ${renewalDate.toISOString()}`);
          } catch (renewalError: any) {
            logger.error(`Failed to update renewal date for user ${userId}:`, renewalError.message, renewalError.stack);
            throw renewalError; // Re-throw as this is critical
          }
          
          // Verify the update
          try {
            const updatedSubscription = await subscriptionService.getHybridSubscription(userId);
            logger.info(`Subscription update verified for user ${userId}`, {
              tier: updatedSubscription.subscriptionTier,
              renewalDate: updatedSubscription.renewalDate,
              isExpired: updatedSubscription.isExpired,
              additionalMasters: updatedSubscription.additionalMasters,
              additionalSlaves: updatedSubscription.additionalSlaves,
            });
          } catch (verifyError: any) {
            logger.warn(`Failed to verify subscription update for user ${userId}:`, verifyError.message);
            // Don't throw - verification failure shouldn't block the update
          }
          
          logger.info(`Subscription updated for user ${userId}`, {
            tier: tierToUse,
            renewalDate,
            isRenewal,
          });
          
          // Log history for tier update
          await HistoryService.createEntry({
            userId,
            actionType: isRenewal ? 'subscription_renewed' : 'subscription_updated',
            description: isRenewal 
              ? `Subscription renewed: ${tierToUse} via Stripe payment (extended from existing expiry)`
              : `Subscription activated: ${tierToUse} via Stripe payment`,
            newValue: tierToUse,
            metadata: {
              subscriptionId,
              customerId,
              amount,
              currency,
              billingCycle,
              isRenewal: isRenewal ? 'true' : 'false',
              renewalDate: renewalDate.toISOString(),
              source: 'stripe_webhook',
            },
            // Don't set performedBy for system actions - leave undefined
          });
        }
        
        // Handle add-ons if provided (works independently of tier updates)
        if (hasAddOns) {
          logger.info(`Processing add-ons for user ${userId}`, {
            mastersFromMetadata: metadata?.masters,
            slavesFromMetadata: metadata?.slaves,
            masters,
            slaves,
          });
          
          // Get current add-ons to calculate differences (after tier update if any)
          const hybridSubscriptionAfterTier = await subscriptionService.getHybridSubscription(userId);
          const currentMasters = hybridSubscriptionAfterTier.additionalMasters || 0;
          const currentSlaves = hybridSubscriptionAfterTier.additionalSlaves || 0;
          
          logger.info(`Current add-ons for user ${userId}`, {
            currentMasters,
            currentSlaves,
            desiredMasters: masters,
            desiredSlaves: slaves,
          });
          
          // Metadata always contains the QUANTITY being purchased (from addOns in checkout request)
          // So we always ADD this quantity to the existing count
          // Example: User has 2 slaves, purchases 3 more → should have 5 total
          const mastersToAdd = masters;
          const slavesToAdd = slaves;
          
          logger.info(`Adding add-ons: ${mastersToAdd} masters, ${slavesToAdd} slaves (metadata contains purchase quantity)`);
          
          logger.info(`Add-on changes for user ${userId}`, {
            mastersToAdd,
            slavesToAdd,
          });
          
          // Add new add-ons
          if (mastersToAdd > 0) {
            logger.info(`Adding ${mastersToAdd} master(s) for user ${userId}`);
            await subscriptionService.addAddOn(userId, 'master', mastersToAdd);
          }
          if (slavesToAdd > 0) {
            logger.info(`Adding ${slavesToAdd} slave(s) for user ${userId}`);
            await subscriptionService.addAddOn(userId, 'slave', slavesToAdd);
          }
          
          // Final verification after all updates
          const finalSubscription = await subscriptionService.getHybridSubscription(userId);
          logger.info(`Final subscription state for user ${userId}`, {
            tier: finalSubscription.subscriptionTier,
            renewalDate: finalSubscription.renewalDate,
            isExpired: finalSubscription.isExpired,
            additionalMasters: finalSubscription.additionalMasters,
            additionalSlaves: finalSubscription.additionalSlaves,
            totalMasters: finalSubscription.limits.totalMasters,
            totalSlaves: finalSubscription.limits.totalSlaves,
          });
          
          // Log history for add-on purchase
          await HistoryService.createEntry({
            userId,
            actionType: 'addon_added',
            description: `Add-ons purchased: ${masters > 0 ? `${masters} master(s)` : ''} ${slaves > 0 ? `${slaves} slave(s)` : ''} via Stripe payment`,
            metadata: {
              subscriptionId,
              customerId,
              amount,
              currency,
              masters: masters.toString(),
              slaves: slaves.toString(),
              source: 'stripe_webhook',
            },
            // Don't set performedBy for system actions - leave undefined
          });
        }
        
        // If neither tier nor add-ons, log warning
        if (!hasValidTier && !hasAddOns) {
          logger.warn(`Checkout session completed for user ${userId} but no tier or add-ons found in metadata`, {
            metadata,
            tierToUse,
            masters,
            slaves,
          });
        } else {
          logger.warn(`No tier provided or invalid tier in checkout.session.completed for user ${userId}`, {
            tierFromResult: tier,
            tierFromMetadata: metadata?.tier,
            tierToUse,
          });
        }
      } else if (event.type === 'invoice.payment_succeeded') {
        // Payment succeeded - create payment record, invoice, and update renewal date
        try {
          // Get Stripe invoice details from event
          const stripeInvoice = event.data.object as Stripe.Invoice;
          const paymentAmount = stripeInvoice.amount_paid || 0; // In cents
          const paymentCurrency = stripeInvoice.currency || 'usd';
          
          // Handle payment_intent (can be string, PaymentIntent object, or null)
          // Use type assertion to access properties that may exist at runtime
          const invoiceAny = stripeInvoice as any;
          const paymentIntentId = invoiceAny.payment_intent 
            ? (typeof invoiceAny.payment_intent === 'string' 
                ? invoiceAny.payment_intent 
                : invoiceAny.payment_intent?.id || null)
            : null;
          
          // Handle charge (can be string, Charge object, or null)
          const chargeId = invoiceAny.charge
            ? (typeof invoiceAny.charge === 'string'
                ? invoiceAny.charge
                : invoiceAny.charge?.id || null)
            : null;
          
          // Create payment record
          const payment = await paymentTrackingService.createPayment({
            userId,
            paymentMethod: 'card',
            amount: paymentAmount,
            currency: paymentCurrency,
            gateway: 'stripe',
            gatewayTransactionId: paymentIntentId || undefined,
            gatewayChargeId: chargeId || undefined,
            subscriptionId: subscriptionId,
            amountAfterDiscount: paymentAmount,
            description: `Payment for ${tier || 'subscription'}`,
            metadata: {
              stripeInvoiceId: stripeInvoice.id,
              stripeCustomerId: customerId,
              eventType: event.type,
            },
          });

          // Update payment status to succeeded
          await paymentTrackingService.updatePaymentStatus(
            payment._id.toString(),
            'succeeded',
            paymentIntentId || undefined
          );

          // Record successful payment attempt
          await paymentTrackingService.recordPaymentAttempt({
            userId,
            paymentId: payment._id.toString(),
            paymentMethod: 'card',
            amount: paymentAmount,
            currency: paymentCurrency,
            gateway: 'stripe',
            gatewayTransactionId: paymentIntentId || undefined,
            metadata: {
              stripeInvoiceId: stripeInvoice.id,
            },
          });

          // Update attempt status to succeeded
          const attempts = await paymentTrackingService.getUserPaymentAttempts(userId, payment._id.toString());
          if (attempts.length > 0) {
            await paymentTrackingService.updatePaymentAttemptStatus(
              attempts[0]._id.toString(),
              'succeeded',
              paymentIntentId || undefined
            );
          }

          // Create invoice
          const lineItems = stripeInvoice.lines.data.map((line) => ({
            description: line.description || 'Subscription',
            quantity: line.quantity || 1,
            unitPrice: line.amount || 0,
            amount: (line.amount || 0) * (line.quantity || 1),
            type: 'subscription' as const,
          }));

          const invoice = await invoiceService.createInvoice({
            userId,
            lineItems,
            subtotal: paymentAmount,
            discountAmount: 0,
            taxAmount: 0,
            total: paymentAmount,
            currency: paymentCurrency.toUpperCase(),
            subscriptionId: subscriptionId,
            metadata: {
              stripeInvoiceId: stripeInvoice.id,
              stripeCustomerId: customerId,
            },
          });

          // Link payment to invoice
          await invoiceService.linkPaymentToInvoice(
            invoice._id.toString(),
            payment._id.toString(),
            paymentAmount
          );

          // Mark invoice as sent and paid
          await invoiceService.markInvoiceAsSent(invoice._id.toString(), false);
          await invoiceService.updateInvoiceStatus(invoice._id.toString(), 'paid');

          // Log history
          await HistoryService.createEntry({
            userId,
            actionType: 'payment_succeeded',
            description: `Payment succeeded: ${(paymentAmount / 100).toFixed(2)} ${paymentCurrency.toUpperCase()}`,
            metadata: {
              paymentId: payment._id.toString(),
              invoiceNumber: invoice.invoiceNumber,
              amount: paymentAmount,
              currency: paymentCurrency,
            },
          });

          await HistoryService.createEntry({
            userId,
            actionType: 'invoice_paid',
            description: `Invoice ${invoice.invoiceNumber} paid`,
            metadata: {
              invoiceId: invoice._id.toString(),
              invoiceNumber: invoice.invoiceNumber,
              amount: paymentAmount,
            },
          });
        } catch (error: any) {
          // Log error but don't fail the webhook - payment processing should continue
          logger.error(`Error creating payment record/invoice: ${error.message}`, error);
        }

        // Update renewal date from result
        if (result.renewalDate) {
          await subscriptionService.updateRenewalDate(userId, result.renewalDate);
          logger.info(`Updated renewal date for user ${userId} to ${result.renewalDate.toISOString()}`);
        }
      } else if (event.type === 'customer.subscription.updated') {
        // Subscription updated - update renewal date if provided
        if (result.renewalDate) {
          await subscriptionService.updateRenewalDate(userId, result.renewalDate);
        }
      } else if (event.type === 'customer.subscription.deleted') {
        // Subscription cancelled/deleted - process grace period and move to BASIC after grace period
        logger.info(`Subscription deleted for user ${userId}, processing grace period...`);
        
        // Process grace period - this will move user to BASIC tier after grace period ends
        // If grace period already ended, it will move immediately
        try {
          await subscriptionService.processGracePeriod(userId);
        } catch (error: any) {
          logger.error(`Error processing grace period for user ${userId}: ${error.message}`);
          // Don't throw - continue with history logging
        }
        
        await HistoryService.createEntry({
          userId,
          actionType: 'subscription_cancelled',
          description: 'Subscription cancelled/deleted via Stripe - will move to BASIC tier after grace period',
          metadata: {
            subscriptionId,
            customerId,
            source: 'stripe_webhook',
          },
        });
      }

      logger.info(`Updated subscription for user ${userId} from webhook ${event.type}`);
    } catch (error: any) {
      logger.error('Error updating subscription from webhook:', {
        error: error.message,
        stack: error.stack,
        userId: result?.userId,
        eventType: event?.type,
      });
      // Don't throw - log the error but don't fail the webhook
      // This prevents Stripe from retrying and allows us to manually fix issues
    }
  }

  /**
   * Get customer portal URL
   * GET /api/payment/customer-portal
   */
  getCustomerPortal = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ValidationError('User not authenticated');
      }

      const user = req.user;
      if (!user.stripeCustomerId) {
        throw new ValidationError('No Stripe customer ID found. Please make a purchase first.');
      }

      const returnUrl = `${config.frontendUrl}/dashboard/subscription`;
      const portalUrl = await stripeService.getCustomerPortalUrl(user.stripeCustomerId, returnUrl);

      res.json({
        success: true,
        data: {
          url: portalUrl,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Cancel subscription
   * POST /api/payment/cancel-subscription
   */
  cancelSubscription = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ValidationError('User not authenticated');
      }

      const user = req.user;
      if (!user.stripeSubscriptionId) {
        throw new ValidationError('No active Stripe subscription found');
      }

      await stripeService.cancelSubscription(user.stripeSubscriptionId);

      // Log history
      await HistoryService.createEntry({
        userId: user._id.toString(),
        actionType: 'subscription_cancelled',
        description: 'Subscription cancelled via Stripe',
        metadata: {
          subscriptionId: user.stripeSubscriptionId,
        },
        performedBy: user._id.toString(),
      });

      res.json({
        success: true,
        message: 'Subscription cancelled successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get user payment history
   * GET /api/payment/history
   */
  getPaymentHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ValidationError('User not authenticated');
      }

      const { status, limit = 50, page = 1 } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const { payments, total } = await paymentTrackingService.getUserPayments(
        req.user._id.toString(),
        {
          status: status as any,
          limit: Number(limit),
          skip,
        }
      );

      res.json({
        success: true,
        data: {
          payments,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit)),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get user payment attempts
   * GET /api/payment/attempts
   */
  getPaymentAttempts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ValidationError('User not authenticated');
      }

      const { paymentId } = req.query;

      const attempts = await paymentTrackingService.getUserPaymentAttempts(
        req.user._id.toString(),
        paymentId as string
      );

      res.json({
        success: true,
        data: {
          attempts,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get user invoices
   * GET /api/payment/invoices
   */
  getInvoices = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ValidationError('User not authenticated');
      }

      const { status, limit = 50, page = 1 } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const { invoices, total } = await invoiceService.getUserInvoices(
        req.user._id.toString(),
        {
          status: status as any,
          limit: Number(limit),
          skip,
        }
      );

      res.json({
        success: true,
        data: {
          invoices,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit)),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get invoice by ID
   * GET /api/payment/invoices/:invoiceId
   */
  getInvoiceById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ValidationError('User not authenticated');
      }

      const { invoiceId } = req.params;
      const invoice = await invoiceService.getInvoiceById(invoiceId);

      if (!invoice) {
        throw new ValidationError('Invoice not found');
      }

      // Verify invoice belongs to user
      if (invoice.userId.toString() !== req.user._id.toString()) {
        throw new ValidationError('Unauthorized access to invoice');
      }

      res.json({
        success: true,
        data: {
          invoice,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get user payment methods
   * GET /api/payment/methods
   */
  getPaymentMethods = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ValidationError('User not authenticated');
      }

      const methods = await paymentTrackingService.getUserPaymentMethods(req.user._id.toString());

      res.json({
        success: true,
        data: {
          paymentMethods: methods,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get user payment history (Admin only - for any user)
   * GET /api/payment/admin/:userId/history
   */
  getAdminUserPaymentHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || req.user.role !== 'admin') {
        throw new ValidationError('Admin access required');
      }

      const { userId } = req.params;
      const { status, limit = 50, page = 1 } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const { payments, total } = await paymentTrackingService.getUserPayments(
        userId,
        {
          status: status as any,
          limit: Number(limit),
          skip,
        }
      );

      res.json({
        success: true,
        data: {
          payments,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit)),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get user invoices (Admin only - for any user)
   * GET /api/payment/admin/:userId/invoices
   */
  getAdminUserInvoices = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || req.user.role !== 'admin') {
        throw new ValidationError('Admin access required');
      }

      const { userId } = req.params;
      const { status, limit = 50, page = 1 } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const { invoices, total } = await invoiceService.getUserInvoices(
        userId,
        {
          status: status as any,
          limit: Number(limit),
          skip,
        }
      );

      res.json({
        success: true,
        data: {
          invoices,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit)),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  };
}

export const paymentController = new PaymentController();

