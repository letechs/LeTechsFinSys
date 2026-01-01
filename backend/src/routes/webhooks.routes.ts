import { Router } from 'express';
import { subscriptionService } from '../services/subscription/subscriptionService';
import { mt5WebhookController } from '../controllers/mt5WebhookController';
import { authenticateEA } from '../middleware/eaAuth';
import { eaLimiter } from '../middleware/rateLimit';
import { logger } from '../utils/logger';

const router = Router();

/**
 * Stripe webhook handler
 * POST /api/webhooks/stripe
 */
router.post('/stripe', async (req, res) => {
  logger.warn('Old webhook route /api/webhooks/stripe accessed - should not be used');
  logger.debug('Old webhook route request headers', {
    'stripe-signature': req.headers['stripe-signature'] ? 'PRESENT' : 'MISSING',
    'content-type': req.headers['content-type'],
  });
  try {
    const event = req.body;
    logger.debug('Old webhook route event type', { eventType: event?.type });

    // TODO: Verify Stripe webhook signature
    // const signature = req.headers['stripe-signature'];
    // const verifiedEvent = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);

    logger.info(`Stripe webhook received: ${event.type}`);

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed':
        // Handle successful checkout
        logger.info('Checkout session completed:', event.data.object.id);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        // Update subscription
        await subscriptionService.updateFromWebhook(event.data.object);
        break;

      case 'customer.subscription.deleted':
        // Handle subscription cancellation
        logger.info('Subscription deleted:', event.data.object.id);
        break;

      default:
        logger.info(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    logger.error('Webhook error:', error);
    res.status(400).json({ error: 'Webhook processing failed' });
  }
});

/**
 * MT5 EA webhook handler
 * POST /api/webhooks/mt5/trade-update
 * Requires EA authentication
 */
router.post('/mt5/trade-update', authenticateEA, eaLimiter, mt5WebhookController.handleTradeUpdate);

export default router;

