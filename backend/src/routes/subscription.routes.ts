import { Router } from 'express';
import { subscriptionController } from '../controllers/subscriptionController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Public route
router.get('/plans', subscriptionController.getPlans);

// Protected routes
router.use(authenticate);

// Public pricing endpoint (accessible to all authenticated users)
router.get('/addon-pricing', subscriptionController.getAddOnPricing);

router.get('/current', subscriptionController.getCurrent);
router.post('/create-checkout', subscriptionController.createCheckout);
router.post('/cancel', subscriptionController.cancel);

// Hybrid Subscription Model Routes
router.get('/hybrid', subscriptionController.getHybridSubscription);
router.post('/add-ons', subscriptionController.addAddOn);
router.delete('/add-ons', subscriptionController.removeAddOn);

// Trial System Routes
router.post('/claim-trial', subscriptionController.claimTrial);

// Admin-only routes (for subscription tier management)
router.get('/admin/users', authenticate, authorize('admin'), subscriptionController.listUsers);
router.get('/admin/:userId/tier', authenticate, authorize('admin'), subscriptionController.getUserTier);
router.put('/admin/:userId/tier', authenticate, authorize('admin'), subscriptionController.updateUserTier);

// Admin-only routes (for hybrid subscription management)
router.get('/admin/:userId/hybrid', authenticate, authorize('admin'), subscriptionController.getHybridSubscriptionAdmin);
router.put('/admin/:userId/base-tier', authenticate, authorize('admin'), subscriptionController.setBaseTier);
router.put('/admin/:userId/renewal-date', authenticate, authorize('admin'), subscriptionController.updateRenewalDate);
router.post('/admin/:userId/add-ons', authenticate, authorize('admin'), subscriptionController.addAddOnAdmin);
router.delete('/admin/:userId/add-ons', authenticate, authorize('admin'), subscriptionController.removeAddOnAdmin);

// Admin-only routes (for trial management)
router.post('/admin/:userId/reset-trial', authenticate, authorize('admin'), subscriptionController.resetTrialAdmin);
router.post('/admin/:userId/disable-trial', authenticate, authorize('admin'), subscriptionController.disableTrialAdmin);

// Bulk operations
router.post('/admin/bulk/update-tier', authenticate, authorize('admin'), subscriptionController.bulkUpdateUserTiers);

// Admin-only routes (for client & discount management)
router.put('/admin/:userId/client-status', authenticate, authorize('admin'), subscriptionController.setClientStatusAdmin);
router.put('/admin/:userId/special-discount', authenticate, authorize('admin'), subscriptionController.setSpecialDiscountAdmin);
router.delete('/admin/:userId/special-discount', authenticate, authorize('admin'), subscriptionController.removeSpecialDiscountAdmin);

export default router;

