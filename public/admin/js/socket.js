/**
 * ALP Socket & Polling Client (Dual-Mode: WebSocket + HTTP Polling Fallback)
 * Manages real-time communication with the admin backend.
 */
class ALPSocket {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.listeners = new Map();
    this._reconnectAttempts = 0;
    this._maxReconnectAttempts = 3;
    this._indicatorEl = null;
    this._token = null;
    this._pollInterval = null;
    this._usePollingMode = false;
  }

  // ─── Connection ────────────────────────────────────────────────────

  connect(token) {
    this._token = token;

    if (typeof window.io !== 'undefined') {
      if (this.socket) {
        const currentToken = this.socket.auth?.token;
        if (currentToken === token) {
          if (!this.socket.connected) {
            this.socket.connect();
          }
          return;
        }
        this.socket.disconnect();
        this.socket = null;
        this.connected = false;
      }

      if (!token) {
        console.warn('[ALPSocket] Cannot connect — no token provided.');
        return;
      }

      console.log('[ALPSocket] Attempting WebSocket connection');
      this.socket = window.io('/admin', {
        auth: { token },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: this._maxReconnectAttempts,
        transports: ['websocket', 'polling'],
        timeout: 3000
      });

      this._setupCoreListeners();
    } else {
      this._startPollingMode();
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
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

    return this;
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
      this._sendHttpCommand(event, data);
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
    if (this._usePollingMode) {
      this._doPoll();
    } else {
      this.emit('admin:get-live-stats');
    }
  }

  // ─── Internal & Polling ────────────────────────────────────────────

  _startPollingMode() {
    this._usePollingMode = true;
    this.connected = true;
    this._updateIndicator('connected');
    console.log('[ALPSocket] Active in HTTP Polling Mode (Serverless compatible)');

    this._doPoll();

    if (!this._pollInterval) {
      this._pollInterval = setInterval(() => {
        this._doPoll();
      }, 3000);
    }
  }

  _doPoll() {
    if (!this._token) return;

    fetch(`/api/admin/poll?token=${encodeURIComponent(this._token)}`, {
      headers: { 'Authorization': `Bearer ${this._token}` }
    })
    .then(res => {
      if (res.status === 401 || res.status === 403) {
        if (window.ALPAuth) window.ALPAuth.logout();
        return null;
      }
      return res.json();
    })
    .then(data => {
      if (!data) return;

      this._emitToLocalListeners('admin:stats', {
        activeSessions: data.activeSessions,
        todayPageViews: data.todayViews,
        activeWebsites: data.activeWebsites,
        timestamp: data.timestamp
      });

      this._emitToLocalListeners('admin:session:update', data.sessions);
    })
    .catch(err => {
      console.warn('[ALPSocket Poll Error]', err.message);
    });
  }

  _sendHttpCommand(event, data) {
    if (!this._token) return;

    let action = 'redirect';
    if (event === 'admin:broadcast-redirect') action = 'broadcast';
    if (event === 'admin:inject-text') action = 'inject';

    fetch('/api/admin/command', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this._token}`
      },
      body: JSON.stringify({ action, ...data })
    })
    .catch(err => console.error('[ALPSocket HTTP Command Error]', err));
  }

  _emitToLocalListeners(event, data) {
    if (this.listeners.has(event)) {
      for (const cb of this.listeners.get(event)) {
        try { cb(data); } catch (e) {}
      }
    }
  }

  _setupCoreListeners() {
    const { socket } = this;
    if (!socket) return;

    socket.on('connect', () => {
      this.connected = true;
      this._reconnectAttempts = 0;
      this._updateIndicator('connected');
      console.log('[ALPSocket] Connected to admin namespace via WebSocket');
    });

    socket.on('disconnect', (reason) => {
      this.connected = false;
      this._updateIndicator('disconnected');
      console.warn(`[ALPSocket] Disconnected: ${reason}`);
    });

    socket.on('connect_error', (err) => {
      this._reconnectAttempts++;
      console.error(`[ALPSocket] Connection error (attempt ${this._reconnectAttempts}):`, err.message);

      if (err.message === 'SESSION_REPLACED') {
        // Write flag so login page shows persistent 'logged in from another device' banner
        sessionStorage.setItem('alp_session_replaced', '1');
        socket.disconnect();
        if (window.ALPAuth) window.ALPAuth.logout();
        return;
      }

      if (err.message === 'Authentication required' || err.message === 'Invalid or expired token') {
        if (window.ALPAuth) window.ALPAuth.logout();
        return;
      }

      if (this._reconnectAttempts >= this._maxReconnectAttempts) {
        console.warn('[ALPSocket] WebSocket failed, switching to HTTP Polling Mode');
        socket.disconnect();
        this._startPollingMode();
      }
    });

    for (const [event, callbacks] of this.listeners) {
      for (const cb of callbacks) {
        socket.on(event, cb);
      }
    }
  }

  _updateIndicator(status) {
    if (!this._indicatorEl) {
      this._indicatorEl = document.getElementById('connection-indicator');
    }

    const el = this._indicatorEl;
    if (!el) return;

    const states = {
      connected: { text: 'Connected', color: 'var(--color-success)', icon: '●' },
      disconnected: { text: 'Disconnected', color: 'var(--color-danger)', icon: '●' },
      reconnecting: { text: 'Reconnecting...', color: 'var(--color-warning)', icon: '◌' },
      failed: { text: 'Connection Failed', color: 'var(--color-danger)', icon: '✕' }
    };

    const state = states[status] || states.disconnected;
    el.innerHTML = `<span style="color:${state.color};font-size:10px;margin-right:6px">${state.icon}</span>${state.text}`;
    el.style.color = state.color;
    el.className = `connection-indicator connection-${status}`;

    if (status === 'connected') {
      el.classList.add('connected');
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
