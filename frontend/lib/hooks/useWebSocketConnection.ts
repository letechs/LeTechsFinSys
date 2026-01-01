import { useEffect } from 'react';
import { webSocketService } from '../websocket';
import { authService } from '../auth';

/**
 * Global WebSocket connection hook
 * Use this in the root layout to establish a single WebSocket connection
 * for the entire application
 */
export function useWebSocketConnection() {
  useEffect(() => {
    // Only connect if user is authenticated
    if (typeof window === 'undefined') {
      return;
    }

    const isAuthenticated = authService.isAuthenticated();
    if (!isAuthenticated) {
      return;
    }

    // Connect to WebSocket
    webSocketService.connect();

    // Cleanup on unmount
    return () => {
      webSocketService.disconnect();
    };
  }, []);
}

