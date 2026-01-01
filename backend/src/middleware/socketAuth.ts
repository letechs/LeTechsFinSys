import { Socket } from 'socket.io';
import { ExtendedError } from 'socket.io/dist/namespace';
import { MT5Account, User } from '../models';
import { logger } from '../utils/logger';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';

/**
 * Authenticate WebSocket connection
 */
export const authenticateSocket = async (
  socket: Socket,
  next: (err?: ExtendedError) => void
): Promise<void> => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');

    if (!token) {
      logger.warn(`WebSocket connection rejected: No token provided from ${socket.handshake.address}`);
      return next(new Error('Authentication token required'));
    }

    // Verify JWT token
    let decoded: any;
    try {
      decoded = jwt.verify(token, config.jwt.secret);
    } catch (error: any) {
      logger.warn(`WebSocket connection rejected: Invalid token from ${socket.handshake.address}`);
      return next(new Error('Invalid authentication token'));
    }

    // Get user
    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      logger.warn(`WebSocket connection rejected: User not found or inactive (${decoded.userId})`);
      return next(new Error('User not found or inactive'));
    }

    // Get user's MT5 accounts
    const accounts = await MT5Account.find({ userId: user._id }).select('_id').lean();
    const accountIds = accounts.map((acc) => acc._id.toString());

    // Attach user info to socket
    (socket as any).userId = user._id.toString();
    (socket as any).userAccounts = accountIds;

    logger.debug(`WebSocket authenticated: userId=${user._id}, accounts=${accountIds.length}`);

    next();
  } catch (error: any) {
    logger.error('WebSocket authentication error:', error);
    next(new Error('Authentication failed'));
  }
};

