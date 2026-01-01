import { Router } from 'express';
import { userController, updateProfileValidation, changePasswordValidation, updateUserValidation, createUserValidation } from '../controllers/userController';
import { authenticate, authorize } from '../middleware/auth';
import { runValidations } from '../middleware/validator';

const router = Router();

// All routes require authentication
router.use(authenticate);

// User routes
router.get('/me', userController.getProfile);
router.put('/me', runValidations(updateProfileValidation), userController.updateProfile);
router.get('/me/accounts', userController.getMyAccounts);
router.get('/me/subscription', userController.getMySubscription);
router.post('/me/change-password', runValidations(changePasswordValidation), userController.changePassword);

// Admin routes
router.post('/admin/users', authenticate, authorize('admin'), runValidations(createUserValidation), userController.createUser);
router.put('/admin/:userId', authenticate, authorize('admin'), runValidations(updateUserValidation), userController.updateUser);
router.delete('/admin/:userId', authenticate, authorize('admin'), userController.deleteUser);
router.post('/admin/:userId/block', authenticate, authorize('admin'), userController.blockUser);
router.post('/admin/:userId/unblock', authenticate, authorize('admin'), userController.unblockUser);

// Bulk operations
router.post('/admin/bulk/block', authenticate, authorize('admin'), userController.bulkBlockUsers);
router.post('/admin/bulk/unblock', authenticate, authorize('admin'), userController.bulkUnblockUsers);
router.post('/admin/bulk/delete', authenticate, authorize('admin'), userController.bulkDeleteUsers);

export default router;

