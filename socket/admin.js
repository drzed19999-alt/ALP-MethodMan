const { getAdapter } = require('../database/adapter');
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

  adminNsp.on('connection', async (socket) => {
    const user = socket.user;
    console.log(`🟢 Admin connected: ${user.username} (${user.role})`);

    // Mark admin as online
    _setAdminOnline(true);

    // Send current live stats immediately on connect
    const stats = await _getLiveStats(io);
    socket.emit('admin:stats', stats);

    // ─── admin:redirect ─────────────────────────────────────
    socket.on('admin:redirect', async (data) => {
      try {
        const { sessionId, targetUrl } = data;
        if (!sessionId || !targetUrl) {
          socket.emit('admin:error', { message: 'sessionId and targetUrl are required' });
          return;
        }

        redirectService.executeRedirect(io, sessionId, targetUrl, user.id);

        const db = getAdapter();
        await db.run(
          'INSERT INTO audit_logs (user_id, username, action, category, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
          [user.id, user.username, 'redirect_session', 'redirect', JSON.stringify({ sessionId, targetUrl }), socket.handshake.address]
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
    socket.on('admin:inject-text', async (data) => {
      try {
        const { sessionId, text } = data;
        if (!sessionId) {
          socket.emit('admin:error', { message: 'sessionId is required' });
          return;
        }

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

        const db = getAdapter();
        await db.run(
          'INSERT INTO audit_logs (user_id, username, action, category, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
          [user.id, user.username, 'inject_text', 'session', JSON.stringify({ sessionId, textLength: (text || '').length }), socket.handshake.address]
        );

        socket.emit('admin:inject-text-success', { sessionId });
      } catch (err) {
        console.error('admin:inject-text error:', err.message);
        socket.emit('admin:error', { message: 'Failed to inject text' });
      }
    });

    // ─── admin:broadcast-redirect ────────────────────────────
    socket.on('admin:broadcast-redirect', async (data) => {
      try {
        const { websiteId, targetUrl } = data;
        if (!targetUrl) {
          socket.emit('admin:error', { message: 'targetUrl is required' });
          return;
        }

        const db = getAdapter();
        const sessions = websiteId
          ? await db.all('SELECT id FROM sessions WHERE website_id = ? AND is_active = 1', [websiteId])
          : await db.all('SELECT id FROM sessions WHERE is_active = 1', []);

        let count = 0;
        for (const session of sessions) {
          redirectService.executeRedirect(io, session.id, targetUrl, user.id);
          count++;
        }

        await db.run(
          'INSERT INTO audit_logs (user_id, username, action, category, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
          [user.id, user.username, 'broadcast_redirect', 'redirect', JSON.stringify({ websiteId: websiteId || 'all', targetUrl, sessionCount: count }), socket.handshake.address]
        );

        await db.run(
          'INSERT INTO activity_feed (type, icon, message, details, website_id) VALUES (?, ?, ?, ?, ?)',
          ['broadcast_redirect', '📡', `Broadcast redirect: ${count} sessions redirected to ${targetUrl}`, JSON.stringify({ targetUrl, sessionCount: count, executedBy: user.username }), websiteId || null]
        );

        socket.emit('admin:broadcast-redirect-success', { websiteId, targetUrl, count });
      } catch (err) {
        console.error('admin:broadcast-redirect error:', err.message);
        socket.emit('admin:error', { message: 'Failed to broadcast redirect' });
      }
    });

    // ─── admin:get-live-stats ────────────────────────────────
    socket.on('admin:get-live-stats', async () => {
      const stats = await _getLiveStats(io);
      socket.emit('admin:stats', stats);
    });

    // ─── disconnect ──────────────────────────────────────────
    socket.on('disconnect', () => {
      console.log(`🔴 Admin disconnected: ${user.username}`);
      if (adminNsp.sockets.size === 0) {
        _setAdminOnline(false);
      }
    });
  });
}

/**
 * Start emitting live stats to all connected admins every 5 seconds.
 */
function _startStatsEmitter(io, adminNsp) {
  if (statsInterval) clearInterval(statsInterval);

  statsInterval = setInterval(async () => {
    if (adminNsp.sockets.size === 0) return;
    const stats = await _getLiveStats(io);
    adminNsp.emit('admin:stats', stats);
  }, 5000);

  if (statsInterval.unref) statsInterval.unref();
}

/**
 * Gather live statistics for the admin dashboard.
 */
async function _getLiveStats(io) {
  try {
    const db = getAdapter();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();

    const [
      activeRow,
      sessionsByWebsite,
      todaySessionsRow,
      todayPageViewsRow,
      recentActivity
    ] = await Promise.all([
      db.get('SELECT COUNT(*) as count FROM sessions WHERE is_active = 1', []),
      db.all(`
        SELECT w.name as websiteName, w.id as websiteId, COUNT(s.id) as count
        FROM sessions s
        JOIN websites w ON s.website_id = w.id
        WHERE s.is_active = 1
        GROUP BY w.id, w.name
      `, []),
      db.get('SELECT COUNT(*) as count FROM sessions WHERE started_at >= ?', [todayISO]),
      db.get('SELECT COUNT(*) as count FROM page_views WHERE timestamp >= ?', [todayISO]),
      db.all('SELECT * FROM activity_feed ORDER BY timestamp DESC LIMIT 5', [])
    ]);

    const trackerNsp = io.of('/tracker');
    const adminNsp = io.of('/admin');

    return {
      activeSessions: activeRow?.count || 0,
      sessionsByWebsite: sessionsByWebsite || [],
      todaySessions: todaySessionsRow?.count || 0,
      todayPageViews: todayPageViewsRow?.count || 0,
      trackerConnections: trackerNsp.sockets.size,
      adminConnections: adminNsp.sockets.size,
      recentActivity: recentActivity || [],
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
  const db = getAdapter();
  db.run(
    `INSERT INTO settings (key, value, updated_at) VALUES ('admin_online', ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
    [online ? '1' : '0']
  ).catch(err => console.error('Failed to update admin_online setting:', err.message));
}

module.exports = { setupAdminNamespace };
