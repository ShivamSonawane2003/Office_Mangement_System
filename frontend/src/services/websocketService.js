/**
 * Global WebSocket Service
 * Manages a single WebSocket connection that stays alive while user is logged in
 */

class WebSocketService {
  constructor() {
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = Infinity; // Keep trying indefinitely while logged in
    this.reconnectDelay = 3000; // Start with 3 seconds
    this.maxReconnectDelay = 30000; // Max 30 seconds
    this.pingInterval = null;
    this.reconnectTimeout = null;
    this.listeners = new Map(); // Map of event types to callback arrays
    this.isConnecting = false;
    this.shouldReconnect = true;
    this.apiUrl = null;
    this.pendingMessages = []; // Store messages received while disconnected
    this.lastPongTime = null;
    this.pongTimeout = null;
    this.visibilityHandler = null;
  }

  /**
   * Initialize WebSocket connection
   */
  connect(apiUrl) {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      console.log('WebSocket already connected or connecting');
      return;
    }

    if (this.isConnecting) {
      console.log('WebSocket connection already in progress');
      return;
    }

    this.apiUrl = apiUrl;
    this.shouldReconnect = true;
    this.isConnecting = true;

    try {
      const wsUrl = apiUrl.replace('http://', 'ws://').replace('https://', 'wss://');
      this.ws = new WebSocket(`${wsUrl}/ws`);

      this.ws.onopen = () => {
        console.log('Global WebSocket connected');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.reconnectDelay = 3000;
        this.lastPongTime = Date.now();
        this.startPingInterval();
        this.setupVisibilityHandlers();
        this.emit('connected', {});
        
        // Process any pending messages that were queued while disconnected
        if (this.pendingMessages.length > 0) {
          console.log(`Processing ${this.pendingMessages.length} pending messages`);
          this.pendingMessages.forEach(msg => this.emit(msg.type || 'message', msg));
          this.pendingMessages = [];
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Handle pong responses from server
          if (data.type === 'pong') {
            this.lastPongTime = Date.now();
            // No timeout check - connection is alive
            return;
          }
          
          // Handle ping from server - respond with pong
          if (data.type === 'ping') {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
              try {
                this.ws.send(JSON.stringify({ type: 'pong' }));
              } catch (error) {
                console.error('Error sending pong response:', error);
              }
            }
            return;
          }

          // If connection is open, emit immediately
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.emit(data.type || 'message', data);
          } else {
            // Store message if connection is not fully open
            this.pendingMessages.push(data);
          }
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.isConnecting = false;
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket disconnected', event.code, event.reason);
        this.isConnecting = false;
        this.stopPingInterval();
        this.clearPongTimeout();
        this.emit('disconnected', { code: event.code, reason: event.reason });

        // Only reconnect if it wasn't a normal close (code 1000) or if we should reconnect
        // Keep trying to reconnect while user is logged in (shouldReconnect is true)
        if (this.shouldReconnect && event.code !== 1000) {
          // Don't reconnect on normal close (1000) - user might have logged out
          // But reconnect on any other close code (network issues, etc.)
          this.scheduleReconnect();
        } else if (this.shouldReconnect && event.code === 1000) {
          // Even on normal close, if shouldReconnect is true, try to reconnect
          // This handles cases where connection was closed unexpectedly
          console.log('Normal close but should reconnect - scheduling reconnect');
          this.scheduleReconnect();
        }
      };
    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
      this.isConnecting = false;
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    }
  }

  /**
   * Schedule reconnection attempt
   */
  scheduleReconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    // Don't reconnect if page is hidden (will reconnect when visible)
    if (document.visibilityState === 'hidden') {
      console.log('Page is hidden - will reconnect when visible');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, Math.min(this.reconnectAttempts - 1, 5)), // Cap exponential backoff
      this.maxReconnectDelay
    );

    console.log(`Scheduling WebSocket reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);

    this.reconnectTimeout = setTimeout(() => {
      if (this.shouldReconnect && this.apiUrl && !this.isConnecting) {
        console.log(`Attempting WebSocket reconnect (attempt ${this.reconnectAttempts})`);
        this.connect(this.apiUrl);
      }
    }, delay);
  }

  /**
   * Start ping interval to keep connection alive - no timeout, keep alive indefinitely
   */
  startPingInterval() {
    this.stopPingInterval();
    
    // Send ping every 30 seconds to keep connection alive
    // No timeout check - connection stays alive as long as user is logged in
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: 'ping' }));
          // No pong timeout - connection stays alive indefinitely
          // Server will keep connection alive as long as client is connected
        } catch (error) {
          console.error('Error sending WebSocket ping:', error);
          // If send fails, connection might be dead - let onclose handle reconnection
        }
      }
    }, 30000); // 30 seconds - matches server ping interval
  }

  /**
   * Clear pong timeout (kept for compatibility, but no longer used)
   */
  clearPongTimeout() {
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
  }

  /**
   * Stop ping interval
   */
  stopPingInterval() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    this.clearPongTimeout();
  }

  /**
   * Setup page visibility handlers to maintain connection
   */
  setupVisibilityHandlers() {
    // Remove existing handler if any
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
    }

    this.visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        // Page became visible - check connection and reconnect if needed
        console.log('Page visible - checking WebSocket connection');
        if (!this.isConnected() && this.shouldReconnect && this.apiUrl) {
          // If not connected and should reconnect, try to connect
          if (!this.isConnecting) {
            console.log('Reconnecting WebSocket after page became visible');
            this.connect(this.apiUrl);
          }
        } else if (this.isConnected()) {
          // Send a ping to verify connection is still alive
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
              this.ws.send(JSON.stringify({ type: 'ping' }));
            } catch (error) {
              console.error('Error sending visibility ping:', error);
            }
          }
        }
      } else {
        // Page hidden - connection will stay alive via ping/pong
        console.log('Page hidden - WebSocket will remain connected');
      }
    };

    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  /**
   * Remove visibility handlers
   */
  removeVisibilityHandlers() {
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
  }

  /**
   * Disconnect WebSocket
   */
  disconnect() {
    console.log('Disconnecting WebSocket');
    this.shouldReconnect = false;
    this.stopPingInterval();
    this.removeVisibilityHandlers();
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.onclose = null; // Prevent reconnection
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }

    this.listeners.clear();
    this.reconnectAttempts = 0;
    this.pendingMessages = [];
    this.lastPongTime = null;
  }

  /**
   * Subscribe to WebSocket events
   */
  on(eventType, callback) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType).push(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(eventType);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
      }
    };
  }

  /**
   * Emit event to all listeners
   */
  emit(eventType, data) {
    const callbacks = this.listeners.get(eventType);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in WebSocket event callback for ${eventType}:`, error);
        }
      });
    }
  }

  /**
   * Get connection status
   */
  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get ready state
   */
  getReadyState() {
    return this.ws ? this.ws.readyState : WebSocket.CLOSED;
  }

  /**
   * Ensure connection is active (reconnect if needed)
   */
  ensureConnected() {
    if (!this.isConnected() && this.shouldReconnect && this.apiUrl && !this.isConnecting) {
      console.log('Ensuring WebSocket is connected...');
      this.connect(this.apiUrl);
    }
  }
}

// Export singleton instance
const websocketService = new WebSocketService();
export default websocketService;

