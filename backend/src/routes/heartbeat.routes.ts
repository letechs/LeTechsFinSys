import { Router } from 'express';
import { heartbeatController } from '../controllers/heartbeatController';
import { authenticateEA } from '../middleware/eaAuth';
import { eaLimiter } from '../middleware/rateLimit';

const router = Router();

// EA authentication required
router.use(authenticateEA);
router.use(eaLimiter);

router.post('/heartbeat', heartbeatController.receiveHeartbeat);
router.get('/commands', heartbeatController.getCommands);
router.patch('/commands/:id/status', heartbeatController.updateCommandStatus);

export default router;

