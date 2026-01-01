/**
 * Payment Routes
 * Isolated payment routes - separate from subscription routes
 */

import { Router } from 'express';
import { paymentController } from '../controllers/paymentController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Note: Webhook route is registered separately in app.ts
// before JSON body parser to handle raw body for signature verification

// Protected routes (require authentication)
router.use(authenticate);

// Create checkout session
router.post('/create-checkout', paymentController.createCheckout);

// Verify checkout session (fallback when webhooks don't work)
router.post('/verify-session', paymentController.verifySession);

// Get customer portal URL
router.get('/customer-portal', paymentController.getCustomerPortal);

// Cancel subscription
router.post('/cancel-subscription', paymentController.cancelSubscription);

// Payment history and invoices (user's own data)
router.get('/history', paymentController.getPaymentHistory);
router.get('/attempts', paymentController.getPaymentAttempts);
router.get('/invoices', paymentController.getInvoices);
router.get('/invoices/:invoiceId', paymentController.getInvoiceById);
router.get('/methods', paymentController.getPaymentMethods);

// Admin routes (view any user's payment/invoice data)
router.get('/admin/:userId/history', authorize('admin'), paymentController.getAdminUserPaymentHistory);
router.get('/admin/:userId/invoices', authorize('admin'), paymentController.getAdminUserInvoices);

export default router;

