import { Router } from 'express';
import { webSocketService } from '../services/realtime/websocketService';
import { authenticate } from '../middleware/auth';

const router = Router();

// Debug endpoint to check WebSocket subscriptions
router.get('/debug/subscriptions', authenticate, (req, res) => {
  const subscriptions = webSocketService.getAllSubscriptions();
  res.json({
    success: true,
    data: {
      totalSubscriptions: subscriptions.length,
      subscriptions,
      connectedClients: webSocketService.getConnectedClientsCount(),
    },
  });
});

// Test endpoint to manually emit an update (for testing)
router.post('/debug/emit-update', authenticate, (req, res) => {
  const { accountId, balance, equity } = req.body;
  
  if (!accountId) {
    return res.status(400).json({
      success: false,
      message: 'accountId is required',
    });
  }

  webSocketService.emitAccountUpdate({
    accountId: String(accountId),
    balance: balance || 0,
    equity: equity || 0,
    connectionStatus: 'online',
    lastHeartbeat: new Date(),
  });

  res.json({
    success: true,
    message: 'Update emitted',
    accountId,
  });
});

export default router;

