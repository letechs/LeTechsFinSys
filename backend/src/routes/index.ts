import { Router } from 'express';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import subscriptionRoutes from './subscription.routes';
import mt5Routes from './mt5.routes';
import heartbeatRoutes from './heartbeat.routes';
import commandRoutes from './commands.routes';
import webhookRoutes from './webhooks.routes';
import copyLinksRoutes from './copyLinks.routes';
import websocketDebugRoutes from './websocket-debug.routes';
import licenseRoutes from './license.routes';
import historyRoutes from './history.routes';
import paymentRoutes from './payment.routes';
import adminRoutes from './admin.routes';
import configRoutes from './config.routes';
import { apiLimiter } from '../middleware/rateLimit';
import { config } from '../config/env';

const router = Router();

// Apply rate limiting to all API routes (more lenient in development)
// Note: Auth routes have their own stricter limiter, so this won't double-limit them
router.use(apiLimiter);

// API routes
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/subscriptions', subscriptionRoutes);
router.use('/mt5', mt5Routes);
router.use('/commands', commandRoutes);
router.use('/ea', heartbeatRoutes);
router.use('/webhooks', webhookRoutes);
router.use('/copy-links', copyLinksRoutes);
router.use('/license', licenseRoutes); // EA License tier validation
router.use('/history', historyRoutes); // User history and audit trail
router.use('/payment', paymentRoutes); // Stripe payment integration
router.use('/admin', adminRoutes); // Admin dashboard and management
router.use('/admin/config', configRoutes); // Global configuration management
router.use('/debug', websocketDebugRoutes);

export default router;

