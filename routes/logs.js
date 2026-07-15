const router = require('express').Router();
const { getDb } = require('../database/init');
const { authenticateToken, requireRole } = require('../middleware/auth');

// Apply auth to all log routes
router.use(authenticateToken);

// ─── GET / ──────────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const {
      user,
      user_id,
      action,
      category,
      from,
      to,
      search,
      page = 1,
      limit = 50
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    const whereClauses = [];
    const params = [];

    if (user) {
      whereClauses.push('username LIKE ?');
      params.push(`%${user}%`);
    }

    if (user_id) {
      whereClauses.push('user_id = ?');
      params.push(parseInt(user_id, 10));
    }

    if (action) {
      whereClauses.push('action LIKE ?');
      params.push(`%${action}%`);
    }

    if (category) {
      whereClauses.push('category = ?');
      params.push(category);
    }

    if (from) {
      whereClauses.push('timestamp >= ?');
      params.push(from);
    }

    if (to) {
      whereClauses.push('timestamp <= ?');
      params.push(to);
    }

    if (search) {
      whereClauses.push(`(
        username LIKE ? OR
        action LIKE ? OR
        category LIKE ? OR
        details LIKE ? OR
        ip_address LIKE ?
      )`);
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam, searchParam, searchParam);
    }

    const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Total count
    const countRow = db.prepare(`SELECT COUNT(*) as count FROM audit_logs ${whereSQL}`).get(...params);

    // Fetch logs
    const logs = db.prepare(`
      SELECT * FROM audit_logs
      ${whereSQL}
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `).all(...params, limitNum, offset);

    // Parse details JSON
    const parsed = logs.map(log => {
      try {
        log.details = JSON.parse(log.details || '{}');
      } catch (e) {
        log.details = {};
      }
      return log;
    });

    res.json({
      logs: parsed,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: countRow.count,
        total_pages: Math.ceil(countRow.count / limitNum)
      }
    });
  } catch (err) {
    console.error('List audit logs error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /categories ────────────────────────────────────────────────────────────
router.get('/categories', (req, res) => {
  try {
    const db = getDb();
    const categories = db.prepare(`
      SELECT DISTINCT category, COUNT(*) as count
      FROM audit_logs
      WHERE category IS NOT NULL AND category != ''
      GROUP BY category
      ORDER BY count DESC
    `).all();

    res.json({ categories });
  } catch (err) {
    console.error('List log categories error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /clear ────────────────────────────────────────────────────────────────
router.post('/clear', requireRole('super_admin'), (req, res) => {
  try {
    const db = getDb();
    const { keep_days = 30 } = req.body;
    const days = Math.max(1, parseInt(keep_days, 10) || 30);

    const countBefore = db.prepare('SELECT COUNT(*) as count FROM audit_logs').get();

    const result = db.prepare(`
      DELETE FROM audit_logs
      WHERE timestamp < datetime('now', ? || ' days')
    `).run(`-${days}`);

    // Audit log for the clear action itself
    db.prepare(`
      INSERT INTO audit_logs (user_id, username, action, category, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.user.id, req.user.username, 'Cleared audit logs', 'system',
      JSON.stringify({
        keep_days: days,
        deleted_count: result.changes,
        total_before: countBefore.count
      }), req.ip);

    // Activity feed
    db.prepare(`
      INSERT INTO activity_feed (type, icon, message, details)
      VALUES (?, ?, ?, ?)
    `).run('system', '🧹', `${req.user.username} cleared audit logs older than ${days} days`,
      JSON.stringify({ deleted_count: result.changes }));

    res.json({
      message: `Cleared ${result.changes} log entries older than ${days} days`,
      deleted: result.changes,
      remaining: countBefore.count - result.changes
    });
  } catch (err) {
    console.error('Clear logs error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /clear-all ────────────────────────────────────────────────────────────
router.post('/clear-all', requireRole('super_admin'), (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM audit_logs').run();

    // Insert one audit log for this clearing action
    db.prepare(`
      INSERT INTO audit_logs (user_id, username, action, category, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.user.id, req.user.username, 'Cleared all audit logs', 'system', '{}', req.ip);

    res.json({ message: 'All audit logs cleared successfully' });
  } catch (err) {
    console.error('Clear all logs error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
