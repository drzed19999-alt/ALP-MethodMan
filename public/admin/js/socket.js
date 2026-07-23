/**
 * ALP Socket.IO Client
 * Manages real-time communication with the admin namespace.
 */
class ALPSocket {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.listeners = new Map();
    this._reconnectAttempts = 0;
    this._maxReconnectAttempts = 10;
    this._indicatorEl = null;
  }

  // ─── Connection ────────────────────────────────────────────────────

  connect(token) {
    if (this.socket) {
      const currentToken = this.socket.auth?.token;
      if (currentToken === token) {
        if (!this.socket.connected) {
          console.log('[ALPSocket] Socket already exists with same token. Ensuring connected/connecting...');
          this.socket.connect();
        }
        return;
      }

      // Token changed or invalid, disconnect existing socket
      console.log('[ALPSocket] Token changed or invalid, disconnecting existing socket');
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }

    if (!token) {
      console.warn('[ALPSocket] Cannot connect — no token provided.');
      return;
    }

    console.log('[ALPSocket] Creating new socket connection');
    this.socket = io('/admin', {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      reconnectionAttempts: this._maxReconnectAttempts,
      transports: ['websocket', 'polling']
    });

    this._setupCoreListeners();
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.connected = false;
    this._updateIndicator('disconnected');
  }

  // ─── Event Management ─────────────────────────────────────────────

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);

    if (this.socket) {
      this.socket.on(event, callback);
    }

    return this; // allow chaining
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      if (callback) {
        this.listeners.get(event).delete(callback);
      } else {
        this.listeners.delete(event);
      }
    }

    if (this.socket) {
      if (callback) {
        this.socket.off(event, callback);
      } else {
        this.socket.removeAllListeners(event);
      }
    }

    return this;
  }

  emit(event, data) {
    if (this.socket && this.socket.connected) {
      this.socket.emit(event, data);
    } else {
      console.warn(`[ALPSocket] Cannot emit "${event}" — not connected.`);
    }
  }

  // ─── Admin Actions ─────────────────────────────────────────────────

  redirectSession(sessionId, targetUrl) {
    this.emit('admin:redirect', { sessionId, targetUrl });
  }

  broadcastRedirect(websiteId, targetUrl) {
    this.emit('admin:broadcast-redirect', { websiteId, targetUrl });
  }

  injectText(sessionId, text) {
    this.emit('admin:inject-text', { sessionId, text });
  }

  getLiveStats() {
    this.emit('admin:get-live-stats');
  }

  // ─── Internal ──────────────────────────────────────────────────────

  _setupCoreListeners() {
    const { socket } = this;
    if (!socket) return;

    socket.on('connect', () => {
      this.connected = true;
      this._reconnectAttempts = 0;
      this._updateIndicator('connected');
      console.log('[ALPSocket] Connected to admin namespace');
    });

    socket.on('disconnect', (reason) => {
      this.connected = false;
      this._updateIndicator('disconnected');
      console.warn(`[ALPSocket] Disconnected: ${reason}`);
    });

    socket.on('connect_error', (err) => {
      this._reconnectAttempts++;
      this._updateIndicator('reconnecting');
      console.error(`[ALPSocket] Connection error (attempt ${this._reconnectAttempts}):`, err.message);

      if (err.message === 'Authentication required' || err.message === 'Invalid or expired token') {
        console.warn('[ALPSocket] Authentication error on socket. Logging out.');
        if (window.ALPAuth) {
          window.ALPAuth.logout();
        }
        return;
      }

      if (this._reconnectAttempts >= this._maxReconnectAttempts) {
        this._updateIndicator('failed');
      }
    });

    socket.io.on('reconnect', (attempt) => {
      this.connected = true;
      this._reconnectAttempts = 0;
      this._updateIndicator('connected');
      console.log(`[ALPSocket] Reconnected after ${attempt} attempts`);
    });

    socket.io.on('reconnect_attempt', (attempt) => {
      this._updateIndicator('reconnecting');
      console.log(`[ALPSocket] Reconnection attempt ${attempt}`);
    });

    socket.io.on('reconnect_failed', () => {
      this._updateIndicator('failed');
      console.error('[ALPSocket] All reconnection attempts failed');
    });

    // Re-attach any previously registered listeners
    for (const [event, callbacks] of this.listeners) {
      for (const cb of callbacks) {
        socket.on(event, cb);
      }
    }
  }

  // ─── Connection Indicator ──────────────────────────────────────────

  _updateIndicator(status) {
    if (!this._indicatorEl) {
      this._indicatorEl = document.getElementById('connection-indicator');
    }

    const el = this._indicatorEl;
    if (!el) return;

    const states = {
      connected: { text: 'Connected', color: 'var(--color-success)', icon: '●' },
      disconnected: { text: 'Disconnected', color: 'var(--color-error)', icon: '●' },
      reconnecting: { text: 'Reconnecting...', color: 'var(--color-warning)', icon: '◌' },
      failed: { text: 'Connection Failed', color: 'var(--color-error)', icon: '✕' }
    };

    const state = states[status] || states.disconnected;
    el.innerHTML = `<span style="color:${state.color};font-size:10px;margin-right:6px">${state.icon}</span>${state.text}`;
    el.style.color = state.color;
    el.className = `connection-indicator connection-${status}`;

    // Show/hide indicator
    if (status === 'connected') {
      el.classList.add('connected');
      // Auto-hide after 3s when connected
      clearTimeout(this._hideTimeout);
      this._hideTimeout = setTimeout(() => {
        el.classList.add('hidden');
      }, 3000);
    } else {
      el.classList.remove('hidden');
      clearTimeout(this._hideTimeout);
    }
  }
}

// Export singleton
window.ALPSocket = new ALPSocket();
