import { Router } from 'express';
import { commandController, createCommandValidation } from '../controllers/commandController';
import { authenticate } from '../middleware/auth';
import { checkSubscription } from '../middleware/subscriptionCheck';
import { commandLimiter } from '../middleware/rateLimit';
import { runValidations } from '../middleware/validator';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Check subscription for remote control feature
router.post(
  '/',
  checkSubscription({ requireFeature: 'remoteControl' }),
  commandLimiter,
  runValidations(createCommandValidation),
  commandController.create
);

router.get('/', commandController.getAll);
router.get('/:id', commandController.getById);
router.delete('/:id', commandController.cancel);

export default router;

