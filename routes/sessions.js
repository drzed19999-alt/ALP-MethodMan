const router = require('express').Router();
const { getAdapter } = require('../database/adapter');
const { authenticateToken, requireRole, requirePage, requireAction } = require('../middleware/auth');
const { scopeByWebsite } = require('../middleware/scope');
const redirectService = require('../services/redirect');
const { writeAudit } = require('../services/audit');

// Deny access to a session whose website isn't owned by the effective caller.
// God unrestricted (unless impersonating via ?as_user).
async function _sessionInScope(req, session) {
  if (!req || !req.user) return false;
  const uid = req.effectiveUserId;
  if (uid == null) return true; // unrestricted god
  if (!session || session.website_id == null) return false;
  try {
    const db = getAdapter();
    const w  = await db.get('SELECT owner_id FROM websites WHERE id = ?', [session.website_id]);
    return !!(w && Number(w.owner_id) === Number(uid));
  } catch { return false; }
}

// Apply auth to all session routes
router.use(authenticateToken);
// Both the Live Sessions page AND Captured Data page consume /api/sessions.
// Deny when god has revoked BOTH pages for this user; otherwise allow.
router.use((req, res, next) => {
  if (!req.user || req.user.role === 'god') return next();
  let perms = req.user.permissions;
  if (typeof perms === 'string') { try { perms = JSON.parse(perms); } catch { perms = {}; } }
  const pages = (perms && perms.pages) || {};
  if (pages['sessions'] === false && pages['captured-data'] === false) {
    return res.status(403).json({
      error: 'Access to Live Sessions and Captured Data has been revoked.',
      code: 'PAGE_PERMISSION_REVOKED',
    });
  }
  next();
});

// ─── GET /stats ─────────────────────────────────────────────────────────────────
// Must be defined BEFORE /:id to avoid route collision
router.get('/stats', async (req, res) => {
  try {
    const db = getAdapter();

    // Scope every stat query by the caller's assigned websites (god bypasses).
    const scope   = scopeByWebsite(req, 'website_id');
    const scopeS  = scopeByWebsite(req, 's.website_id');

    const totalActive = await db.get(
      `SELECT COUNT(*) as count FROM sessions WHERE is_active = 1${scope.clause}`,
      scope.params
    );

    const byWebsite = await db.all(`
      SELECT w.name as website_name, w.id as website_id, COUNT(s.id) as count
      FROM sessions s
      JOIN websites w ON s.website_id = w.id
      WHERE s.is_active = 1${scopeS.clause}
      GROUP BY s.website_id, w.name, w.id
      ORDER BY count DESC
    `, scopeS.params);

    const byCountry = await db.all(`
      SELECT country, COUNT(*) as count
      FROM sessions
      WHERE is_active = 1 AND country IS NOT NULL AND country != ''${scope.clause}
      GROUP BY country
      ORDER BY count DESC
      LIMIT 20
    `, scope.params);

    const byBrowser = await db.all(`
      SELECT browser, COUNT(*) as count
      FROM sessions
      WHERE is_active = 1 AND browser IS NOT NULL AND browser != ''${scope.clause}
      GROUP BY browser
      ORDER BY count DESC
    `, scope.params);

    const byDevice = await db.all(`
      SELECT device, COUNT(*) as count
      FROM sessions
      WHERE is_active = 1 AND device IS NOT NULL AND device != ''${scope.clause}
      GROUP BY device
      ORDER BY count DESC
    `, scope.params);

    const avgDuration = await db.get(`
      SELECT AVG((julianday(last_activity) - julianday(started_at)) * 86400) as avg_seconds
      FROM sessions
      WHERE is_active = 1${scope.clause}
    `, scope.params);

    res.json({
      total_active: totalActive ? totalActive.count : 0,
      avg_duration_seconds: Math.round((avgDuration ? avgDuration.avg_seconds : 0) || 0),
      by_website: byWebsite,
      by_country: byCountry,
      by_browser: byBrowser,
      by_device: byDevice
    });
  } catch (err) {
    console.error('Session stats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /clear ────────────────────────────────────────────────────────────────
// Non-god (and god impersonating) only clears sessions on their OWN websites.
// Unrestricted god wipes everything panel-wide.
router.post('/clear', requireRole('super_admin'), requireAction('sessions', 'clear-all'), async (req, res) => {
  try {
    const db = getAdapter();
    const uid = req.effectiveUserId;

    if (uid == null) {
      // Unrestricted god — bulk wipe.
      if (db.type === 'supabase') {
        const sb = db.raw;
        const [r1, r2, r3] = await Promise.all([
          sb.from('page_views').delete().gte('id', 0),
          sb.from('redirect_commands').delete().gte('id', 0),
          sb.from('sessions').delete().neq('id', ''),
        ]);
        if (r1.error) throw new Error(r1.error.message);
        if (r2.error) throw new Error(r2.error.message);
        if (r3.error) throw new Error(r3.error.message);
      } else {
        await db.run('DELETE FROM page_views');
        await db.run('DELETE FROM redirect_commands');
        await db.run('DELETE FROM sessions');
      }
    } else {
      // Scoped: delete only rows tied to websites this user owns.
      const sub = `IN (SELECT id FROM websites WHERE owner_id = ?)`;
      await db.run(`DELETE FROM page_views        WHERE website_id ${sub}`, [uid]);
      await db.run(`DELETE FROM redirect_commands WHERE website_id ${sub}`, [uid]);
      await db.run(`DELETE FROM sessions          WHERE website_id ${sub}`, [uid]);
    }

    await writeAudit(req, 'Cleared all sessions', 'system');

    await db.run(`
      INSERT INTO activity_feed (owner_id, type, icon, message, details)
      VALUES (?, ?, ?, ?, ?)
    `, [req.user.id, 'system', '🧹', `${req.user.username} cleared all sessions and page views`, '{}']);

    // Broadcast: only to affected users' rooms (plus god for observability).
    const io = req.app.get('io');
    if (io) {
      const adminNsp = io.of('/admin');
      const target = uid == null ? adminNsp : adminNsp.to(`user:${uid}`).to('god');
      target.emit('admin:sessions:cleared', { clearedBy: req.user.username });
      target.emit('admin:stats', {
        activeSessions: 0,
        todaySessions: 0,
        todayPageViews: 0,
        sessionsByWebsite: [],
        recentActivity: [],
        timestamp: new Date().toISOString()
      });
    }

    res.json({ message: 'All sessions and history cleared successfully' });
  } catch (err) {
    console.error('Clear sessions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET / ──────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const db = getAdapter();
    const {
      website_id,
      search,
      is_active,
      page = 1,
      limit = 50
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    let whereClauses = [];
    let params = [];

    if (website_id) {
      whereClauses.push('s.website_id = ?');
      params.push(parseInt(website_id, 10));
    }

    if (is_active !== undefined) {
      whereClauses.push('s.is_active = ?');
      params.push(parseInt(is_active, 10));
    }

    if (search) {
      whereClauses.push(`(
        s.ip_address LIKE ? OR
        s.current_page LIKE ? OR
        s.country LIKE ? OR
        s.city LIKE ? OR
        s.browser LIKE ? OR
        s.os LIKE ? OR
        s.visitor_id LIKE ?
      )`);
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam, searchParam, searchParam, searchParam, searchParam);
    }

    // Multi-tenant scope: non-god only sees sessions on websites they own.
    const scope = scopeByWebsite(req, 's.website_id');
    if (scope.clause) {
      whereClauses.push(scope.clause.replace(/^\s*AND\s*/i, ''));
      params.push(...scope.params);
    }

    const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Total count
    const countRow = await db.get(`SELECT COUNT(*) as count FROM sessions s ${whereSQL}`, params);
    const totalCount = countRow ? countRow.count : 0;

    // Fetch sessions
    const sessions = await db.all(`
      SELECT s.*, w.name as website_name, w.domain as website_domain, w.logo_url as logo_url, w.color as website_color, dp.name as current_page_name, dp.form_type as current_page_type
      FROM sessions s
      LEFT JOIN websites w ON s.website_id = w.id
      LEFT JOIN demo_pages dp ON s.website_id = dp.website_id AND s.current_page LIKE (dp.url || '%')
      ${whereSQL}
      ORDER BY s.last_activity DESC
      LIMIT ? OFFSET ?
    `, [...params, limitNum, offset]);

    res.json({
      sessions,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        total_pages: Math.ceil(totalCount / limitNum)
      }
    });
  } catch (err) {
    console.error('List sessions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /:id ───────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const db = getAdapter();
    const sessionId = req.params.id;

    const session = await db.get(`
      SELECT s.*, w.name as website_name, w.domain as website_domain, w.logo_url as logo_url, w.color as website_color, dp.name as current_page_name, dp.form_type as current_page_type
      FROM sessions s
      LEFT JOIN websites w ON s.website_id = w.id
      LEFT JOIN demo_pages dp ON s.website_id = dp.website_id AND s.current_page LIKE (dp.url || '%')
      WHERE s.id = ?
    `, [sessionId]);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    if (!(await _sessionInScope(req, session))) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Get page view history
    const pageViews = await db.all(`
      SELECT id, page_url, page_title, duration_ms, timestamp
      FROM page_views
      WHERE session_id = ?
      ORDER BY timestamp DESC
    `, [sessionId]);

    // Get redirect commands for this session
    const redirects = await db.all(`
      SELECT rc.*, u.username as executed_by_username
      FROM redirect_commands rc
      LEFT JOIN users u ON rc.executed_by = u.id
      WHERE rc.session_id = ?
      ORDER BY rc.executed_at DESC
    `, [sessionId]);

    // Parse metadata
    try {
      session.metadata = typeof session.metadata === 'string' ? JSON.parse(session.metadata || '{}') : (session.metadata || {});
    } catch (e) {
      session.metadata = {};
    }

    res.json({
      session,
      page_views: pageViews,
      redirects
    });
  } catch (err) {
    console.error('Get session error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /:id/redirect ────────────────────────────────────────────────────────
router.post('/:id/redirect', requireAction('sessions', 'redirect'), async (req, res) => {
  try {
    const db = getAdapter();
    const sessionId = req.params.id;
    const { target_url } = req.body;

    if (!target_url) {
      return res.status(400).json({ error: 'target_url is required' });
    }

    const session = await db.get('SELECT id, website_id, visitor_id FROM sessions WHERE id = ?', [sessionId]);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    if (!(await _sessionInScope(req, session))) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const io = req.app.get('io');
    if (io) {
      redirectService.executeRedirect(io, sessionId, target_url, req.user.id);
    } else {
      await db.run(`
        INSERT INTO redirect_commands (session_id, website_id, target_url, executed_by)
        VALUES (?, ?, ?, ?)
      `, [sessionId, session.website_id, target_url, req.user.id]);
    }

    // Audit log
    await writeAudit(req, 'Redirected session', 'session', { session_id: sessionId, target_url, website_id: session.website_id });

    res.json({
      message: 'Redirect command sent',
      session_id: sessionId,
      target_url
    });
  } catch (err) {
    console.error('Redirect session error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /:id/advance ─────────────────────────────────────────────────────────
router.post('/:id/advance', requireAction('sessions', 'advance'), async (req, res) => {
  try {
    const sessionId = req.params.id;
    const io = req.app.get('io');

    // Scope guard — non-god must own the session's website.
    if (req.user && req.user.role !== 'god') {
      const db = getAdapter();
      const s = await db.get('SELECT website_id FROM sessions WHERE id = ?', [sessionId]);
      if (!s || !(await _sessionInScope(req, s))) {
        return res.status(404).json({ error: 'Session not found' });
      }
    }

    if (!io) {
      return res.status(500).json({ error: 'Socket server not available' });
    }
    
    const nextUrl = await redirectService.advanceFunnelAsync ? await redirectService.advanceFunnelAsync(io, sessionId) : redirectService.advanceFunnel(io, sessionId);
    
    if (nextUrl) {
      await writeAudit(req, 'Advanced funnel step', 'session', { session_id: sessionId, next_url: nextUrl });

      res.json({ message: 'Visitor advanced successfully', next_url: nextUrl });
    } else {
      res.status(400).json({ error: 'No next step found in funnel or session is offline' });
    }
  } catch (err) {
    console.error('Advance session error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /:id/end ─────────────────────────────────────────────────────────────
router.post('/:id/end', requireAction('sessions', 'end'), async (req, res) => {
  try {
    const db = getAdapter();
    const sessionId = req.params.id;

    const session = await db.get('SELECT id, website_id, ip_address FROM sessions WHERE id = ?', [sessionId]);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    if (!(await _sessionInScope(req, session))) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Mark session as inactive
    await db.run('UPDATE sessions SET is_active = 0, last_activity = CURRENT_TIMESTAMP WHERE id = ?', [sessionId]);

    // Audit log
    await writeAudit(req, 'Force-ended session', 'session', { session_id: sessionId, session_ip: session.ip_address });

    // Activity feed
    await db.run(`
      INSERT INTO activity_feed (owner_id, type, icon, message, details, website_id, session_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [req.user.id, 'session', '⛔', `${req.user.username} force-ended session ${sessionId.slice(0, 8)}...`,
      JSON.stringify({ session_id: sessionId }), session.website_id, sessionId]);

    const io = req.app.get('io');
    if (io) {
      // Route the update to the owning user's room (plus god).
      const db2 = getAdapter();
      let ownerId = null;
      try {
        const w = await db2.get('SELECT owner_id FROM websites WHERE id = ?', [session.website_id]);
        if (w) ownerId = w.owner_id;
      } catch {}
      const adminNsp = io.of('/admin');
      const target = ownerId != null ? adminNsp.to(`user:${ownerId}`).to('god') : adminNsp.to('god');
      target.emit('admin:session:update', { id: sessionId, is_active: 0 });
    }

    res.json({ message: 'Session ended successfully' });
  } catch (err) {
    console.error('End session error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── DELETE /:id ────────────────────────────────────────────────────────────────
router.delete('/:id', requireAction('sessions', 'delete'), async (req, res) => {
  try {
    const db = getAdapter();
    const sessionId = req.params.id;

    const session = await db.get('SELECT id, website_id, ip_address FROM sessions WHERE id = ?', [sessionId]);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    if (!(await _sessionInScope(req, session))) {
      return res.status(404).json({ error: 'Session not found' });
    }

    await db.run('DELETE FROM page_views WHERE session_id = ?', [sessionId]);
    await db.run('DELETE FROM redirect_commands WHERE session_id = ?', [sessionId]);
    await db.run('DELETE FROM activity_feed WHERE session_id = ?', [sessionId]);
    await db.run('DELETE FROM sessions WHERE id = ?', [sessionId]);

    // Audit log
    await writeAudit(req, 'Permanently deleted session', 'session', { session_id: sessionId, session_ip: session.ip_address });

    const io = req.app.get('io');
    if (io) {
      let ownerId = null;
      try {
        const w = await db.get('SELECT owner_id FROM websites WHERE id = ?', [session.website_id]);
        if (w) ownerId = w.owner_id;
      } catch {}
      const adminNsp = io.of('/admin');
      const target = ownerId != null ? adminNsp.to(`user:${ownerId}`).to('god') : adminNsp.to('god');
      target.emit('admin:session:end', { id: sessionId, sessionId });

      // Tell the visitor's tracker to drop its stored sid and start clean on
      // the next event. Belt-and-braces alongside the server-side self-heal in
      // socket/tracker.js — this way the browser doesn't keep the ghost id
      // around indefinitely if it later ends up on a different device / IP.
      try {
        const trackerNsp = io.of('/tracker');
        trackerNsp.to(`session:${sessionId}`).emit('tracker:reset', { reason: 'session_deleted' });
      } catch {}
    }

    res.json({ message: 'Session permanently deleted' });
  } catch (err) {
    console.error('Delete session error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
