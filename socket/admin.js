const { getDb } = require('../database/init');
const redirectService = require('../services/redirect');

// Track the periodic stats interval so we can clean it up
let statsInterval = null;

/**
 * Set up the /admin namespace for the admin panel.
 * Auth middleware is applied in socket/index.js before this runs.
 *
 * @param {import('socket.io').Server} io - The root Socket.IO server
 * @param {import('socket.io').Namespace} adminNsp - The /admin namespace
 */
function setupAdminNamespace(io, adminNsp) {
  // Start periodic stats emitter
  _startStatsEmitter(io, adminNsp);

  adminNsp.on('connection', (socket) => {
    const user = socket.user;
    console.log(`🟢 Admin connected: ${user.username} (${user.role})`);

    // Mark admin as online
    _setAdminOnline(true);

    // Send current live stats immediately on connect
    const stats = _getLiveStats(io);
    socket.emit('admin:stats', stats);

    // ─── admin:redirect ─────────────────────────────────────
    // Redirect a specific session
    socket.on('admin:redirect', (data) => {
      try {
        const { sessionId, targetUrl } = data;
        if (!sessionId || !targetUrl) {
          socket.emit('admin:error', { message: 'sessionId and targetUrl are required' });
          return;
        }

        redirectService.executeRedirect(io, sessionId, targetUrl, user.id);

        // Audit log
        const db = getDb();
        db.prepare(`
          INSERT INTO audit_logs (user_id, username, action, category, details, ip_address)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          user.id,
          user.username,
          'redirect_session',
          'redirect',
          JSON.stringify({ sessionId, targetUrl }),
          socket.handshake.address
        );

        socket.emit('admin:redirect-success', { sessionId, targetUrl });
      } catch (err) {
        console.error('admin:redirect error:', err.message);
        socket.emit('admin:error', { message: 'Failed to redirect session' });
      }
    });

    // ─── admin:advance-funnel ────────────────────────────────
    socket.on('admin:advance-funnel', (data) => {
      try {
        const { sessionId } = data;
        if (!sessionId) {
          socket.emit('admin:error', { message: 'sessionId is required' });
          return;
        }

        const nextUrl = redirectService.advanceFunnel(io, sessionId);

        if (nextUrl) {
          socket.emit('admin:advance-funnel-success', { sessionId, nextUrl });
        } else {
          socket.emit('admin:error', { message: 'No next step found in funnel or session is offline' });
        }
      } catch (err) {
        console.error('admin:advance-funnel error:', err.message);
        socket.emit('admin:error', { message: 'Failed to advance funnel step' });
      }
    });

    // ─── admin:inject-text ───────────────────────────────────
    // Inject arbitrary text/HTML into the visitor's page via data-alp-inject elements
    socket.on('admin:inject-text', (data) => {
      try {
        const { sessionId, text } = data;
        if (!sessionId) {
          socket.emit('admin:error', { message: 'sessionId is required' });
          return;
        }

        // Find the tracker socket that owns this session
        const trackerNsp = io.of('/tracker');
        let delivered = false;
        for (const [, trackerSocket] of trackerNsp.sockets) {
          if (trackerSocket.sessionId === sessionId) {
            trackerSocket.emit('tracker:inject', { text: text || '' });
            delivered = true;
            break;
          }
        }

        if (!delivered) {
          socket.emit('admin:error', { message: 'Session not found or visitor is offline' });
          return;
        }

        // Audit log
        const db = getDb();
        db.prepare(`
          INSERT INTO audit_logs (user_id, username, action, category, details, ip_address)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          user.id,
          user.username,
          'inject_text',
          'session',
          JSON.stringify({ sessionId, textLength: (text || '').length }),
          socket.handshake.address
        );

        socket.emit('admin:inject-text-success', { sessionId });
      } catch (err) {
        console.error('admin:inject-text error:', err.message);
        socket.emit('admin:error', { message: 'Failed to inject text' });
      }
    });

    // ─── admin:broadcast-redirect ────────────────────────────
    // Redirect all active sessions on a website (or ALL if no websiteId)
    socket.on('admin:broadcast-redirect', (data) => {
      try {
        const { websiteId, targetUrl } = data;
        if (!targetUrl) {
          socket.emit('admin:error', { message: 'targetUrl is required' });
          return;
        }

        const db = getDb();

        // Get active sessions — filter by website if provided
        const sessions = websiteId
          ? db.prepare('SELECT id FROM sessions WHERE website_id = ? AND is_active = 1').all(websiteId)
          : db.prepare('SELECT id FROM sessions WHERE is_active = 1').all();

        let count = 0;
        for (const session of sessions) {
          redirectService.executeRedirect(io, session.id, targetUrl, user.id);
          count++;
        }

        // Audit log
        db.prepare(`
          INSERT INTO audit_logs (user_id, username, action, category, details, ip_address)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          user.id,
          user.username,
          'broadcast_redirect',
          'redirect',
          JSON.stringify({ websiteId: websiteId || 'all', targetUrl, sessionCount: count }),
          socket.handshake.address
        );

        // Activity feed
        db.prepare(`
          INSERT INTO activity_feed (type, icon, message, details, website_id)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          'broadcast_redirect',
          '📡',
          `Broadcast redirect: ${count} sessions redirected to ${targetUrl}`,
          JSON.stringify({ targetUrl, sessionCount: count, executedBy: user.username }),
          websiteId || null
        );

        socket.emit('admin:broadcast-redirect-success', { websiteId, targetUrl, count });
      } catch (err) {
        console.error('admin:broadcast-redirect error:', err.message);
        socket.emit('admin:error', { message: 'Failed to broadcast redirect' });
      }
    });

    // ─── admin:get-live-stats ────────────────────────────────
    socket.on('admin:get-live-stats', () => {
      const stats = _getLiveStats(io);
      socket.emit('admin:stats', stats);
    });

    // ─── disconnect ──────────────────────────────────────────
    socket.on('disconnect', () => {
      console.log(`🔴 Admin disconnected: ${user.username}`);

      // Check if any admins are still connected
      const connectedSockets = adminNsp.sockets;
      if (connectedSockets.size === 0) {
        _setAdminOnline(false);
      }
    });
  });
}

/**
 * Start emitting live stats to all connected admins every 5 seconds.
 */
function _startStatsEmitter(io, adminNsp) {
  // Clean up any existing interval
  if (statsInterval) {
    clearInterval(statsInterval);
  }

  statsInterval = setInterval(() => {
    // Only emit if there are connected admin sockets
    if (adminNsp.sockets.size === 0) return;

    const stats = _getLiveStats(io);
    adminNsp.emit('admin:stats', stats);
  }, 5000);

  // Ensure the interval doesn't prevent process exit
  if (statsInterval.unref) {
    statsInterval.unref();
  }
}

/**
 * Gather live statistics for the admin dashboard.
 */
function _getLiveStats(io) {
  try {
    const db = getDb();

    // Active sessions count
    const activeSessions = db.prepare(
      'SELECT COUNT(*) as count FROM sessions WHERE is_active = 1'
    ).get().count;

    // Active sessions by website
    const sessionsByWebsite = db.prepare(`
      SELECT w.name as websiteName, w.id as websiteId, COUNT(s.id) as count
      FROM sessions s
      JOIN websites w ON s.website_id = w.id
      WHERE s.is_active = 1
      GROUP BY w.id
    `).all();

    // Today's sessions
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todaySessions = db.prepare(
      'SELECT COUNT(*) as count FROM sessions WHERE started_at >= ?'
    ).get(todayStart.toISOString()).count;

    // Today's page views
    const todayPageViews = db.prepare(
      'SELECT COUNT(*) as count FROM page_views WHERE timestamp >= ?'
    ).get(todayStart.toISOString()).count;

    // Connected tracker sockets
    const trackerNsp = io.of('/tracker');
    const trackerConnections = trackerNsp.sockets.size;

    // Connected admin sockets
    const adminNsp = io.of('/admin');
    const adminConnections = adminNsp.sockets.size;

    // Recent activity (last 5 items)
    const recentActivity = db.prepare(`
      SELECT * FROM activity_feed
      ORDER BY timestamp DESC
      LIMIT 5
    `).all();

    return {
      activeSessions,
      sessionsByWebsite,
      todaySessions,
      todayPageViews,
      trackerConnections,
      adminConnections,
      recentActivity,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    console.error('Live stats error:', err.message);
    return {
      activeSessions: 0,
      sessionsByWebsite: [],
      todaySessions: 0,
      todayPageViews: 0,
      trackerConnections: 0,
      adminConnections: 0,
      recentActivity: [],
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Update the admin_online setting in the database.
 */
function _setAdminOnline(online) {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES ('admin_online', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(online ? '1' : '0');
  } catch (err) {
    console.error('Failed to update admin_online setting:', err.message);
  }
}

module.exports = { setupAdminNamespace };
