import { Router } from 'express';
import { copyLinkController, createCopyLinkValidation } from '../controllers/copyLinkController';
import { authenticate } from '../middleware/auth';
import { checkSubscription } from '../middleware/subscriptionCheck';
import { runValidations } from '../middleware/validator';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Check subscription for copy trading feature
router.use(checkSubscription({ requireFeature: 'copyTrading' }));

// Copy link routes
router.post(
  '/',
  runValidations(createCopyLinkValidation),
  copyLinkController.create
);

router.get('/', copyLinkController.getAll);
router.get('/:id', copyLinkController.getById);
router.put('/:id', copyLinkController.update);
router.post('/:id/pause', copyLinkController.pause);
router.post('/:id/resume', copyLinkController.resume);
router.delete('/:id', copyLinkController.delete);

export default router;

