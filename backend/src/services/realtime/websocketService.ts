import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import { logger } from '../../utils/logger';
import { authenticateSocket } from '../../middleware/socketAuth';
import { config } from '../../config/env';

export interface AccountUpdate {
  accountId: string;
  balance?: number;
  equity?: number;
  margin?: number;
  freeMargin?: number;
  marginLevel?: number;
  connectionStatus?: 'online' | 'offline';
  lastHeartbeat?: Date;
}

export interface TradeUpdate {
  accountId: string;
  type: 'open' | 'close' | 'modify';
  trade: {
    ticket: number;
    symbol: string;
    type: 'BUY' | 'SELL';
    volume: number;
    openPrice: number;
    currentPrice: number;
    profit: number;
    sl?: number;
    tp?: number;
    openTime: string;
  };
}

export interface CommandUpdate {
  accountId: string;
  commandId: string;
  status: 'pending' | 'executed' | 'failed';
  result?: any;
}

class WebSocketService {
  private io: SocketServer | null = null;
  private connectedClients: Map<string, Set<string>> = new Map(); // userId -> Set of socketIds
  private accountSubscriptions: Map<string, Set<string>> = new Map(); // accountId -> Set of socketIds

  /**
   * Initialize WebSocket server
   */
  initialize(httpServer: HttpServer): void {
    const isDevelopment = config.nodeEnv === 'development';
    
    this.io = new SocketServer(httpServer, {
      cors: {
        // Use same CORS configuration as REST API
        origin: isDevelopment ? true : config.corsOrigin,
        credentials: true,
        methods: ['GET', 'POST'],
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 20000, // Match frontend timeout
      pingInterval: 10000, // More frequent pings to prevent timeout
      allowEIO3: true, // Allow Engine.IO v3 clients
      upgradeTimeout: 10000,
      maxHttpBufferSize: 1e6, // 1MB
      connectTimeout: 20000, // Connection timeout
    });

    // Authentication middleware
    this.io.use(authenticateSocket);

    // Connection handling
    this.io.on('connection', (socket: Socket) => {
      const userId = (socket as any).userId;
      const userAccounts = (socket as any).userAccounts || [];

      // Track user connection
      if (!this.connectedClients.has(userId)) {
        this.connectedClients.set(userId, new Set());
      }
      this.connectedClients.get(userId)!.add(socket.id);

      // Subscribe to user's accounts (ensure accountId is string)
      userAccounts.forEach((accountId: string) => {
        const accountIdStr = String(accountId || '').trim();
        if (accountIdStr) {
          this.subscribeToAccount(socket.id, accountIdStr);
        }
      });

      // Handle account subscription requests
      socket.on('subscribe:account', (accountId: string) => {
        this.subscribeToAccount(socket.id, accountId);
        socket.emit('subscribed', { accountId });
      });

      // Handle account unsubscription
      socket.on('unsubscribe:account', (accountId: string) => {
        this.unsubscribeFromAccount(socket.id, accountId);
        socket.emit('unsubscribed', { accountId });
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        this.handleDisconnect(socket.id, userId);
      });

      // Send initial connection confirmation with user's account IDs
      socket.emit('connected', {
        socketId: socket.id,
        userId,
        accountIds: userAccounts,
        timestamp: new Date().toISOString(),
      });
    });

  }

  /**
   * Subscribe socket to account updates
   */
  private subscribeToAccount(socketId: string, accountId: string): void {
    // Normalize accountId to string - remove any ObjectId wrapper
    let accountIdStr = String(accountId || '').trim();
    
    // Handle MongoDB ObjectId format if present
    if (accountIdStr.includes('ObjectId(')) {
      // Extract the ID from ObjectId("...")
      const match = accountIdStr.match(/ObjectId\(['"]([^'"]+)['"]\)/);
      if (match) {
        accountIdStr = match[1];
      }
    }
    
    if (!accountIdStr) {
      logger.warn(`Cannot subscribe: empty accountId for socket ${socketId}`);
      return;
    }
    
    if (!this.accountSubscriptions.has(accountIdStr)) {
      this.accountSubscriptions.set(accountIdStr, new Set());
    }
    this.accountSubscriptions.get(accountIdStr)!.add(socketId);
  }

  /**
   * Unsubscribe socket from account updates
   */
  private unsubscribeFromAccount(socketId: string, accountId: string): void {
    this.accountSubscriptions.forEach((sockets, accountId) => {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        this.accountSubscriptions.delete(accountId);
      }
    });
  }

  /**
   * Handle client disconnect
   */
  private handleDisconnect(socketId: string, userId: string): void {
    // Remove from user connections
    const userSockets = this.connectedClients.get(userId);
    if (userSockets) {
      userSockets.delete(socketId);
      if (userSockets.size === 0) {
        this.connectedClients.delete(userId);
      }
    }

    // Unsubscribe from all accounts
    this.unsubscribeFromAccount(socketId, '');
  }

  /**
   * Emit account update to subscribed clients
   */
  emitAccountUpdate(update: AccountUpdate): void {
    if (!this.io) {
      logger.warn('WebSocket server not initialized, cannot emit account update');
      return;
    }

    // Normalize accountId to string for lookup - handle ObjectId format
    let accountIdStr = String(update.accountId || '').trim();
    
    // Handle MongoDB ObjectId format if present
    if (accountIdStr.includes('ObjectId(')) {
      const match = accountIdStr.match(/ObjectId\(['"]([^'"]+)['"]\)/);
      if (match) {
        accountIdStr = match[1];
      }
    }
    
    const subscribers = this.accountSubscriptions.get(accountIdStr);
    
    if (!subscribers || subscribers.size === 0) {
      // No subscribers, skip emission (saves resources)
      return;
    }

    // Emit to all subscribed sockets
    subscribers.forEach((socketId) => {
      this.io!.to(socketId).emit('account:update', update);
    });
  }

  /**
   * Emit trade update to subscribed clients
   */
  emitTradeUpdate(update: TradeUpdate): void {
    if (!this.io) {
      return;
    }

    const subscribers = this.accountSubscriptions.get(update.accountId);
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    subscribers.forEach((socketId) => {
      this.io!.to(socketId).emit('trade:update', update);
    });

  }

  /**
   * Emit command update to subscribed clients
   */
  emitCommandUpdate(update: CommandUpdate): void {
    if (!this.io) {
      return;
    }

    const subscribers = this.accountSubscriptions.get(update.accountId);
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    subscribers.forEach((socketId) => {
      this.io!.to(socketId).emit('command:update', update);
    });
  }

  /**
   * Get connected clients count
   */
  getConnectedClientsCount(): number {
    let total = 0;
    this.connectedClients.forEach((sockets) => {
      total += sockets.size;
    });
    return total;
  }

  /**
   * Get account subscribers count
   */
  getAccountSubscribersCount(accountId: string): number {
    // Normalize accountId for lookup
    let accountIdStr = String(accountId || '').trim();
    if (accountIdStr.includes('ObjectId(')) {
      const match = accountIdStr.match(/ObjectId\(['"]([^'"]+)['"]\)/);
      if (match) {
        accountIdStr = match[1];
      }
    }
    return this.accountSubscriptions.get(accountIdStr)?.size || 0;
  }

  /**
   * Get all subscriptions (for debugging)
   */
  getAllSubscriptions(): Array<{ accountId: string; socketCount: number; socketIds: string[] }> {
    return Array.from(this.accountSubscriptions.entries()).map(([accId, sockets]) => ({
      accountId: accId,
      socketCount: sockets.size,
      socketIds: Array.from(sockets),
    }));
  }
}

export const webSocketService = new WebSocketService();

