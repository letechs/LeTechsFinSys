import { Router } from 'express';
import { historyController } from '../controllers/historyController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Admin routes
router.get('/admin', authenticate, authorize('admin'), historyController.getAllHistoryAdmin);
router.get('/admin/:userId', authenticate, authorize('admin'), historyController.getUserHistoryAdmin);
router.get('/admin/statistics', authenticate, authorize('admin'), historyController.getStatistics);
router.post('/admin/cleanup', authenticate, authorize('admin'), historyController.cleanupOldHistory);

// User routes
router.get('/me', authenticate, historyController.getMyHistory);

export default router;

