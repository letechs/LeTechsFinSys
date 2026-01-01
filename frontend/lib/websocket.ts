import { io, Socket } from 'socket.io-client';
import { authService } from './auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

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
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000; // Start with 1 second
  private isConnecting = false;
  private listeners: Map<string, Set<Function>> = new Map();

  /**
   * Connect to WebSocket server
   */
  connect(): void {
    if (this.socket?.connected || this.isConnecting) {
      return;
    }

    // Only connect on client side
    if (typeof window === 'undefined') {
      return;
    }

    const token = authService.getToken();
    if (!token) {
      return;
    }

    // Small delay to ensure server is ready
    if (this.reconnectAttempts === 0) {
      setTimeout(() => {
        this.attemptConnection(token);
      }, 500);
    } else {
      this.attemptConnection(token);
    }
  }

  /**
   * Attempt WebSocket connection
   */
  private attemptConnection(token: string): void {
    if (this.isConnecting) {
      return;
    }

    this.isConnecting = true;

    this.socket = io(API_URL, {
      auth: {
        token,
      },
      transports: ['polling', 'websocket'], // Try polling first, then upgrade to websocket
      reconnection: true,
      reconnectionDelay: this.reconnectDelay,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      forceNew: false,
      upgrade: true,
      rememberUpgrade: true,
      autoConnect: true,
    });

    this.socket.on('connect', () => {
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000;
      this.isConnecting = false;
      // Set up event listeners after connection is established
      this.setupEventListeners();
    });

    this.socket.on('disconnect', (reason) => {
      this.isConnecting = false;
      
      // Only manually reconnect if server explicitly disconnected
      // Otherwise, Socket.io will handle reconnection automatically
      if (reason === 'io server disconnect') {
        // Server disconnected, reconnect manually after delay
        setTimeout(() => {
          this.reconnect();
        }, 1000);
      }
    });

    this.socket.on('connect_error', (error) => {
      const errorMsg = error.message || String(error);
      // Only log non-transport errors to reduce noise
      if (!errorMsg.includes('websocket error') && !errorMsg.includes('xhr poll error')) {
      }
      this.isConnecting = false;
      // Socket.io handles reconnection automatically, no need to call handleReconnect
    });

    this.socket.on('connected', (data) => {
      // Event listeners are set up in 'connect' event above
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.listeners.clear();
    this.isConnecting = false;
  }

  /**
   * Subscribe to account updates
   */
  subscribeToAccount(accountId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('subscribe:account', accountId);
    }
  }

  /**
   * Unsubscribe from account updates
   */
  unsubscribeFromAccount(accountId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('unsubscribe:account', accountId);
    }
  }

  /**
   * Add event listener
   */
  on(event: 'account:update' | 'trade:update' | 'command:update', callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  /**
   * Remove event listener
   */
  off(event: 'account:update' | 'trade:update' | 'command:update', callback: Function): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.delete(callback);
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    if (!this.socket) return;

    // Remove existing listeners to avoid duplicates on reconnection
    this.socket.off('account:update');
    this.socket.off('trade:update');
    this.socket.off('command:update');

    this.socket.on('account:update', (data: AccountUpdate) => {
      const listeners = this.listeners.get('account:update');
      if (listeners && listeners.size > 0) {
        listeners.forEach((callback) => {
          try {
            callback(data);
          } catch (error) {
            console.error('[WebSocket] Error in account:update listener:', error);
          }
        });
      }
    });

    this.socket.on('trade:update', (data: TradeUpdate) => {
      const listeners = this.listeners.get('trade:update');
      if (listeners) {
        listeners.forEach((callback) => {
          try {
            callback(data);
          } catch (error) {
          }
        });
      }
    });

    this.socket.on('command:update', (data: CommandUpdate) => {
      const listeners = this.listeners.get('command:update');
      if (listeners) {
        listeners.forEach((callback) => {
          try {
            callback(data);
          } catch (error) {
          }
        });
      }
    });
  }

  /**
   * Handle reconnection with exponential backoff
   */
  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }

    this.reconnectAttempts++;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 5000); // Max 5 seconds

    setTimeout(() => {
      if (!this.socket?.connected && !this.isConnecting) {
        this.connect();
      }
    }, this.reconnectDelay);
  }

  /**
   * Reconnect manually
   */
  private reconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket.connect();
    } else {
      this.disconnect();
      setTimeout(() => {
        this.connect();
      }, 1000);
    }
  }
}

export const webSocketService = new WebSocketService();

