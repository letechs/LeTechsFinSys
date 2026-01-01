import { Router } from 'express';
import { mt5AccountController, createAccountValidation } from '../controllers/mt5AccountController';
import { authenticate } from '../middleware/auth';
import { checkSubscription } from '../middleware/subscriptionCheck';
import { runValidations } from '../middleware/validator';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Check subscription for account creation
router.post(
  '/accounts',
  checkSubscription({ checkAccountLimit: true }),
  runValidations(createAccountValidation),
  mt5AccountController.create
);

router.get('/accounts', mt5AccountController.getAll);
router.get('/accounts/:id', mt5AccountController.getById);
router.get('/accounts/:id/realtime', mt5AccountController.getRealtimeData);
router.put('/accounts/:id', mt5AccountController.update);
router.delete('/accounts/:id', mt5AccountController.delete);
router.post('/accounts/:id/regenerate-token', mt5AccountController.regenerateToken);
router.put('/accounts/:id/rules', mt5AccountController.updateRules);

export default router;

