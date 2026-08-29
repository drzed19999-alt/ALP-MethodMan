const { getAdapter } = require('../database/adapter');
const redirectService = require('../services/redirect');
const { writeAudit } = require('../services/audit');
const { createNotification } = require('../services/notification');

let statsInterval = null;

// Per-user presence map: userId → { userId, username, role, connectedAt, ip }
const adminPresenceMap = new Map();

function getOnlineAdmins() {
  return Array.from(adminPresenceMap.values());
}

function _broadcastPresence(adminNsp) {
  adminNsp.emit('admin:presence', getOnlineAdmins());
}

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

    // Per-user room — emits meant for one specific user go here so events
    // don't leak between tenants. God ALSO joins a special 'god' room so
    // per-owner emits can additionally target god for observability.
    socket.join(`user:${user.id}`);
    if (user.role === 'god') socket.join('god');

    // Mark admin as online
    _setAdminOnline(true);

    // Add to per-user presence and broadcast
    adminPresenceMap.set(user.id, {
      userId: user.id,
      username: user.username,
      role: user.role,
      connectedAt: new Date().toISOString(),
      ip: socket.handshake.address,
    });
    _broadcastPresence(adminNsp);

    // Send current live stats immediately on connect — scoped for this user.
    const stats = await _getLiveStats(io, user.role === 'god' ? null : user.id);
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
        const sess = await db.get(`
          SELECT s.website_id, s.ip_address AS visitor_ip, s.current_page,
                 w.name AS website_name FROM sessions s
          LEFT JOIN websites w ON s.website_id = w.id WHERE s.id = ?`, [sessionId]);
        await writeAudit(null, 'redirect_session', 'redirect', {
          sessionId, targetUrl, website_name: sess?.website_name,
          visitor_ip: sess?.visitor_ip, current_page: sess?.current_page,
        }, { user_id: socket.user?.id, username: socket.user?.username, ip: socket.handshake?.address });

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
          writeAudit(null, 'Advanced funnel step (socket)', 'session', { sessionId, nextUrl }, { user_id: socket.user?.id, username: socket.user?.username, ip: socket.handshake?.address });
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

        await writeAudit(null, 'inject_text', 'session', { sessionId, textLength: (text || '').length }, { user_id: socket.user?.id, username: socket.user?.username, ip: socket.handshake?.address });

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

        let websiteName = null;
        if (websiteId) {
          const w = await db.get('SELECT name FROM websites WHERE id = ?', [websiteId]);
          websiteName = w?.name;
        }
        await writeAudit(null, 'broadcast_redirect', 'redirect', {
          websiteId: websiteId || 'all', targetUrl, sessionCount: count,
          website_name: websiteName || 'all websites',
        }, { user_id: socket.user?.id, username: socket.user?.username, ip: socket.handshake?.address });

        await db.run(
          'INSERT INTO activity_feed (owner_id, type, icon, message, details, website_id) VALUES (?, ?, ?, ?, ?, ?)',
          [user.id, 'broadcast_redirect', '📡', `Broadcast redirect: ${count} sessions redirected to ${targetUrl}`, JSON.stringify({ targetUrl, sessionCount: count, executedBy: user.username }), websiteId || null]
        );

        createNotification(io, user.id, {
          type: 'info', title: 'Broadcast Redirect',
          message: `${count} sessions on ${websiteName || 'all sites'} redirected to ${targetUrl}`,
        }).catch(() => {});

        socket.emit('admin:broadcast-redirect-success', { websiteId, targetUrl, count });
      } catch (err) {
        console.error('admin:broadcast-redirect error:', err.message);
        socket.emit('admin:error', { message: 'Failed to broadcast redirect' });
      }
    });

    // ─── admin:get-live-stats ────────────────────────────────
    socket.on('admin:get-live-stats', async () => {
      const stats = await _getLiveStats(io, user.role === 'god' ? null : user.id);
      socket.emit('admin:stats', stats);
    });

    // ─── disconnect ──────────────────────────────────────────
    socket.on('disconnect', () => {
      console.log(`🔴 Admin disconnected: ${user.username}`);
      adminPresenceMap.delete(user.id);
      _broadcastPresence(adminNsp);
      if (adminNsp.sockets.size === 0) {
        _setAdminOnline(false);
      }
    });
  });
}

/**
 * Emit live stats every 5 seconds — per-user, computed only for users that
 * currently have at least one socket connected. God gets the panel-wide view.
 */
function _startStatsEmitter(io, adminNsp) {
  if (statsInterval) clearInterval(statsInterval);

  statsInterval = setInterval(async () => {
    if (adminNsp.sockets.size === 0) return;
    const connectedUserIds = new Set();
    let anyGod = false;
    for (const [, s] of adminNsp.sockets) {
      if (s.user && s.user.id) connectedUserIds.add(s.user.id);
      if (s.user && s.user.role === 'god') anyGod = true;
    }
    // God — unrestricted panel-wide view (only sent if a god is online).
    if (anyGod) {
      const stats = await _getLiveStats(io, null);
      adminNsp.to('god').emit('admin:stats', stats);
    }
    // Per non-god user — scoped stats delivered to their own room.
    for (const uid of connectedUserIds) {
      // Skip if this user is god (already covered above).
      const anySocket = [...adminNsp.sockets.values()].find(s => s.user && s.user.id === uid);
      if (anySocket && anySocket.user.role === 'god') continue;
      const stats = await _getLiveStats(io, uid);
      adminNsp.to(`user:${uid}`).emit('admin:stats', stats);
    }
  }, 5000);

  if (statsInterval.unref) statsInterval.unref();
}

/**
 * Gather live statistics. If `effectiveUserId` is set, results are scoped to
 * that user's websites; if null, panel-wide (god view).
 */
async function _getLiveStats(io, effectiveUserId = null) {
  try {
    const db = getAdapter();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();

    const scoped = effectiveUserId != null;
    const sub = scoped ? ` AND website_id IN (SELECT id FROM websites WHERE owner_id = ?)` : '';
    const p = scoped ? [effectiveUserId] : [];
    const activityScope = scoped ? ` AND owner_id = ?` : '';

    const [
      activeRow,
      sessionsByWebsite,
      todaySessionsRow,
      todayPageViewsRow,
      recentActivity
    ] = await Promise.all([
      db.get(`SELECT COUNT(*) as count FROM sessions WHERE is_active = 1${sub}`, p),
      db.all(`
        SELECT w.name as websiteName, w.id as websiteId, COUNT(s.id) as count
        FROM sessions s
        JOIN websites w ON s.website_id = w.id
        WHERE s.is_active = 1${scoped ? ' AND w.owner_id = ?' : ''}
        GROUP BY w.id, w.name
      `, p),
      db.get(`SELECT COUNT(*) as count FROM sessions WHERE started_at >= ?${sub}`, [todayISO, ...p]),
      db.get(`SELECT COUNT(*) as count FROM page_views WHERE timestamp >= ?${sub}`, [todayISO, ...p]),
      db.all(`SELECT * FROM activity_feed WHERE 1=1${activityScope} ORDER BY timestamp DESC LIMIT 5`, p)
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

module.exports = { setupAdminNamespace, getOnlineAdmins };
