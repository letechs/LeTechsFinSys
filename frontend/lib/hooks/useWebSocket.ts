import { useEffect, useRef, useCallback } from 'react';
import { webSocketService, AccountUpdate, TradeUpdate, CommandUpdate } from '../websocket';

interface UseWebSocketOptions {
  accountId?: string;
  onAccountUpdate?: (update: AccountUpdate) => void;
  onTradeUpdate?: (update: TradeUpdate) => void;
  onCommandUpdate?: (update: CommandUpdate) => void;
  autoConnect?: boolean;
}

/**
 * React hook for WebSocket connection
 * Handles connection, subscription, and event listeners
 */
export function useWebSocket(options: UseWebSocketOptions = {}) {
  const {
    accountId,
    onAccountUpdate,
    onTradeUpdate,
    onCommandUpdate,
    autoConnect = true,
  } = options;

  const callbacksRef = useRef({
    onAccountUpdate,
    onTradeUpdate,
    onCommandUpdate,
  });

  // Store handler functions in ref so they're stable for cleanup
  const handlersRef = useRef<{
    handleAccountUpdate?: (update: AccountUpdate) => void;
    handleTradeUpdate?: (update: TradeUpdate) => void;
    handleCommandUpdate?: (update: CommandUpdate) => void;
  }>({});

  // Update callbacks ref when they change
  useEffect(() => {
    callbacksRef.current = {
      onAccountUpdate,
      onTradeUpdate,
      onCommandUpdate,
    };
  }, [onAccountUpdate, onTradeUpdate, onCommandUpdate]);

  // Don't create new connection - use existing one from layout
  // The useWebSocketConnection hook in layout handles the connection
  // This hook only manages subscriptions and event listeners

  // Subscribe to account when accountId changes
  useEffect(() => {
    if (accountId && webSocketService.isConnected()) {
      webSocketService.subscribeToAccount(accountId);
    }
    
    return () => {
      if (accountId) {
        webSocketService.unsubscribeFromAccount(accountId);
      }
    };
  }, [accountId]);

  // Set up event listeners - register once and use refs for callbacks
  // Use empty dependency array to register only once on mount
  useEffect(() => {
    // Create stable handler functions and store in ref (for proper cleanup)
    handlersRef.current.handleAccountUpdate = (update: AccountUpdate) => {
      if (callbacksRef.current.onAccountUpdate) {
        callbacksRef.current.onAccountUpdate(update);
      }
    };

    handlersRef.current.handleTradeUpdate = (update: TradeUpdate) => {
      if (callbacksRef.current.onTradeUpdate) {
        callbacksRef.current.onTradeUpdate(update);
      }
    };

    handlersRef.current.handleCommandUpdate = (update: CommandUpdate) => {
      if (callbacksRef.current.onCommandUpdate) {
        callbacksRef.current.onCommandUpdate(update);
      }
    };

    // Register listeners immediately (they'll work once WebSocket connects)
    if (handlersRef.current.handleAccountUpdate) {
      webSocketService.on('account:update', handlersRef.current.handleAccountUpdate);
    }
    if (handlersRef.current.handleTradeUpdate) {
      webSocketService.on('trade:update', handlersRef.current.handleTradeUpdate);
    }
    if (handlersRef.current.handleCommandUpdate) {
      webSocketService.on('command:update', handlersRef.current.handleCommandUpdate);
    }
    

    // Cleanup on unmount only - use ref handlers for proper cleanup
    // Store a flag to track if this is a real unmount (not React StrictMode)
    let isMounted = true;
    
    return () => {
      // Only cleanup if this is a real unmount (component actually removed)
      // React StrictMode in dev runs cleanup then re-runs effect, so we need to be careful
      if (!isMounted) {
        return;
      }
      
      isMounted = false;
      if (handlersRef.current.handleAccountUpdate) {
        webSocketService.off('account:update', handlersRef.current.handleAccountUpdate);
      }
      if (handlersRef.current.handleTradeUpdate) {
        webSocketService.off('trade:update', handlersRef.current.handleTradeUpdate);
      }
      if (handlersRef.current.handleCommandUpdate) {
        webSocketService.off('command:update', handlersRef.current.handleCommandUpdate);
      }
    };
  }, []); // Empty array - only register once on mount, callbacks use refs

  const subscribe = useCallback((id: string) => {
    webSocketService.subscribeToAccount(id);
  }, []);

  const unsubscribe = useCallback((id: string) => {
    webSocketService.unsubscribeFromAccount(id);
  }, []);

  const isConnected = useCallback(() => {
    return webSocketService.isConnected();
  }, []);

  return {
    subscribe,
    unsubscribe,
    isConnected,
  };
}

