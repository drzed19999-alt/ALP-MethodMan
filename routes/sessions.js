const router = require('express').Router();
const { getDb } = require('../database/init');
const { authenticateToken, requireRole } = require('../middleware/auth');
const redirectService = require('../services/redirect');

// Apply auth to all session routes
router.use(authenticateToken);

// ─── GET /stats ─────────────────────────────────────────────────────────────────
// Must be defined BEFORE /:id to avoid route collision
router.get('/stats', (req, res) => {
  try {
    const db = getDb();

    const totalActive = db.prepare('SELECT COUNT(*) as count FROM sessions WHERE is_active = 1').get();

    const byWebsite = db.prepare(`
      SELECT w.name as website_name, w.id as website_id, COUNT(s.id) as count
      FROM sessions s
      JOIN websites w ON s.website_id = w.id
      WHERE s.is_active = 1
      GROUP BY s.website_id
      ORDER BY count DESC
    `).all();

    const byCountry = db.prepare(`
      SELECT country, COUNT(*) as count
      FROM sessions
      WHERE is_active = 1 AND country IS NOT NULL AND country != ''
      GROUP BY country
      ORDER BY count DESC
      LIMIT 20
    `).all();

    const byBrowser = db.prepare(`
      SELECT browser, COUNT(*) as count
      FROM sessions
      WHERE is_active = 1 AND browser IS NOT NULL AND browser != ''
      GROUP BY browser
      ORDER BY count DESC
    `).all();

    const byDevice = db.prepare(`
      SELECT device, COUNT(*) as count
      FROM sessions
      WHERE is_active = 1 AND device IS NOT NULL AND device != ''
      GROUP BY device
      ORDER BY count DESC
    `).all();

    const avgDuration = db.prepare(`
      SELECT AVG((julianday(last_activity) - julianday(started_at)) * 86400) as avg_seconds
      FROM sessions
      WHERE is_active = 1
    `).get();

    res.json({
      total_active: totalActive.count,
      avg_duration_seconds: Math.round(avgDuration.avg_seconds || 0),
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
router.post('/clear', requireRole('super_admin'), (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM page_views').run();
    db.prepare('DELETE FROM redirect_commands').run();
    db.prepare('DELETE FROM sessions').run();
    
    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (user_id, username, action, category, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.user.id, req.user.username, 'Cleared all sessions', 'system', '{}', req.ip);

    // Activity feed
    db.prepare(`
      INSERT INTO activity_feed (type, icon, message, details)
      VALUES (?, ?, ?, ?)
    `).run('system', '🧹', `${req.user.username} cleared all sessions and page views`, '{}');

    // Real-time: notify all admins instantly
    const io = req.app.get('io');
    if (io) {
      io.of('/admin').emit('admin:sessions:cleared', { clearedBy: req.user.username });
      // Also push updated (zeroed) stats
      io.of('/admin').emit('admin:stats', {
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
router.get('/', (req, res) => {
  try {
    const db = getDb();
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

    const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Total count
    const countRow = db.prepare(`SELECT COUNT(*) as count FROM sessions s ${whereSQL}`).get(...params);

    // Fetch sessions
    const sessions = db.prepare(`
      SELECT s.*, w.name as website_name, w.domain as website_domain, w.logo_url as logo_url, w.color as website_color, dp.name as current_page_name
      FROM sessions s
      LEFT JOIN websites w ON s.website_id = w.id
      LEFT JOIN demo_pages dp ON s.website_id = dp.website_id AND s.current_page LIKE (dp.url || '%')
      ${whereSQL}
      ORDER BY s.last_activity DESC
      LIMIT ? OFFSET ?
    `).all(...params, limitNum, offset);

    res.json({
      sessions,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: countRow.count,
        total_pages: Math.ceil(countRow.count / limitNum)
      }
    });
  } catch (err) {
    console.error('List sessions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /:id ───────────────────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const sessionId = req.params.id;

    const session = db.prepare(`
      SELECT s.*, w.name as website_name, w.domain as website_domain, w.logo_url as logo_url, w.color as website_color, dp.name as current_page_name
      FROM sessions s
      LEFT JOIN websites w ON s.website_id = w.id
      LEFT JOIN demo_pages dp ON s.website_id = dp.website_id AND s.current_page LIKE (dp.url || '%')
      WHERE s.id = ?
    `).get(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Get page view history
    const pageViews = db.prepare(`
      SELECT id, page_url, page_title, duration_ms, timestamp
      FROM page_views
      WHERE session_id = ?
      ORDER BY timestamp DESC
    `).all(sessionId);

    // Get redirect commands for this session
    const redirects = db.prepare(`
      SELECT rc.*, u.username as executed_by_username
      FROM redirect_commands rc
      LEFT JOIN users u ON rc.executed_by = u.id
      WHERE rc.session_id = ?
      ORDER BY rc.executed_at DESC
    `).all(sessionId);

    // Parse metadata
    try {
      session.metadata = JSON.parse(session.metadata || '{}');
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
router.post('/:id/redirect', (req, res) => {
  try {
    const db = getDb();
    const sessionId = req.params.id;
    const { target_url } = req.body;

    if (!target_url) {
      return res.status(400).json({ error: 'target_url is required' });
    }

    const session = db.prepare('SELECT id, website_id, visitor_id FROM sessions WHERE id = ?').get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // ── Emit socket redirect to the visitor's browser ──────────────────
    const io = req.app.get('io');
    if (io) {
      redirectService.executeRedirect(io, sessionId, target_url, req.user.id);
    } else {
      // Fallback: log to DB only (socket not available)
      db.prepare(`
        INSERT INTO redirect_commands (session_id, website_id, target_url, executed_by)
        VALUES (?, ?, ?, ?)
      `).run(sessionId, session.website_id, target_url, req.user.id);
    }

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (user_id, username, action, category, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.user.id, req.user.username, 'Redirected session', 'session',
      JSON.stringify({ session_id: sessionId, target_url, website_id: session.website_id }), req.ip);

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
router.post('/:id/advance', (req, res) => {
  try {
    const sessionId = req.params.id;
    const io = req.app.get('io');
    
    if (!io) {
      return res.status(500).json({ error: 'Socket server not available' });
    }
    
    const nextUrl = redirectService.advanceFunnel(io, sessionId);
    
    if (nextUrl) {
      const db = getDb();
      db.prepare(`
        INSERT INTO audit_logs (user_id, username, action, category, details, ip_address)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(req.user.id, req.user.username, 'Advanced funnel step', 'session',
        JSON.stringify({ session_id: sessionId, next_url: nextUrl }), req.ip);

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
router.post('/:id/end', (req, res) => {
  try {
    const db = getDb();
    const sessionId = req.params.id;

    const session = db.prepare('SELECT id, website_id, ip_address FROM sessions WHERE id = ?').get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Mark session as inactive
    db.prepare('UPDATE sessions SET is_active = 0, last_activity = CURRENT_TIMESTAMP WHERE id = ?').run(sessionId);

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (user_id, username, action, category, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.user.id, req.user.username, 'Force-ended session', 'session',
      JSON.stringify({ session_id: sessionId, session_ip: session.ip_address }), req.ip);

    // Activity feed
    db.prepare(`
      INSERT INTO activity_feed (type, icon, message, details, website_id, session_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('session', '⛔', `${req.user.username} force-ended session ${sessionId.slice(0, 8)}...`,
      JSON.stringify({ session_id: sessionId }), session.website_id, sessionId);

    // Real-time: update card status on all admin panels instantly
    const io = req.app.get('io');
    if (io) {
      io.of('/admin').emit('admin:session:update', { id: sessionId, is_active: 0 });
    }

    res.json({ message: 'Session ended successfully' });
  } catch (err) {
    console.error('End session error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── DELETE /:id ────────────────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const sessionId = req.params.id;

    const session = db.prepare('SELECT id, website_id, ip_address FROM sessions WHERE id = ?').get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Hard-delete session and related dependencies in a transaction
    const deleteTransaction = db.transaction((id) => {
      db.prepare('DELETE FROM page_views WHERE session_id = ?').run(id);
      db.prepare('DELETE FROM redirect_commands WHERE session_id = ?').run(id);
      db.prepare('DELETE FROM activity_feed WHERE session_id = ?').run(id);
      db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    });
    deleteTransaction(sessionId);

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (user_id, username, action, category, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.user.id, req.user.username, 'Permanently deleted session', 'session',
      JSON.stringify({ session_id: sessionId, session_ip: session.ip_address }), req.ip);

    // Real-time: remove card from all admin panels instantly
    const io = req.app.get('io');
    if (io) {
      io.of('/admin').emit('admin:session:end', { id: sessionId, sessionId });
    }

    res.json({ message: 'Session permanently deleted' });
  } catch (err) {
    console.error('Delete session error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
