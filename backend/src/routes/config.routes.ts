import { Router } from 'express';
import { configController } from '../controllers/configController';
import { authenticate, authorize } from '../middleware/auth';
import { body } from 'express-validator';
import { runValidations } from '../middleware/validator';

const router = Router();

// All config routes require authentication and admin role
router.use(authenticate, authorize('admin'));

// Get all config
router.get('/', configController.getConfig);

// Get specific section
router.get('/:section', configController.getConfigSection);

// Update all config (partial updates supported)
router.put('/', configController.updateConfig);

// Update specific section
router.put('/:section', configController.updateConfigSection);

// Apply global offer to users
router.post(
  '/apply-offer',
  [
    body('userIds').optional().isArray().withMessage('userIds must be an array'),
    body('userIds.*').optional().isString().withMessage('Each userId must be a string'),
  ],
  runValidations,
  configController.applyGlobalOffer
);

// Update trial for users
router.post(
  '/update-trial',
  [
    body('enabled').isBoolean().withMessage('enabled must be a boolean'),
    body('userIds').optional().isArray().withMessage('userIds must be an array'),
    body('userIds.*').optional().isString().withMessage('Each userId must be a string'),
  ],
  runValidations,
  configController.updateTrialForUsers
);

export default router;

