const router = require('express').Router();
const { getAdapter } = require('../database/adapter');
const { authenticateToken, requireRole } = require('../middleware/auth');

// Apply auth to all log routes
router.use(authenticateToken);

// ─── GET / ──────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const db = getAdapter();
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
    const countRow = await db.get(`SELECT COUNT(*) as count FROM audit_logs ${whereSQL}`, params);
    const totalCount = countRow ? countRow.count : 0;

    // Fetch logs
    const logs = await db.all(`
      SELECT * FROM audit_logs
      ${whereSQL}
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `, [...params, limitNum, offset]);

    // Parse details JSON
    const parsed = logs.map(log => {
      try {
        log.details = typeof log.details === 'string' ? JSON.parse(log.details || '{}') : (log.details || {});
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
        total: totalCount,
        total_pages: Math.ceil(totalCount / limitNum)
      }
    });
  } catch (err) {
    console.error('List audit logs error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /categories ────────────────────────────────────────────────────────────
router.get('/categories', async (req, res) => {
  try {
    const db = getAdapter();
    const categories = await db.all(`
      SELECT DISTINCT category, COUNT(*) as count
      FROM audit_logs
      WHERE category IS NOT NULL AND category != ''
      GROUP BY category
      ORDER BY count DESC
    `);

    res.json({ categories });
  } catch (err) {
    console.error('List log categories error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /clear ────────────────────────────────────────────────────────────────
router.post('/clear', requireRole('super_admin'), async (req, res) => {
  try {
    const db = getAdapter();
    const { keep_days = 30 } = req.body;
    const days = Math.max(1, parseInt(keep_days, 10) || 30);

    const countBefore = await db.get('SELECT COUNT(*) as count FROM audit_logs');
    const totalBefore = countBefore ? countBefore.count : 0;

    const cutoff = new Date(Date.now() - days * 86400 * 1000).toISOString();
    const result = await db.run('DELETE FROM audit_logs WHERE timestamp < ?', [cutoff]);

    // Audit log for the clear action itself
    await db.run(`
      INSERT INTO audit_logs (user_id, username, action, category, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [req.user.id, req.user.username, 'Cleared audit logs', 'system',
      JSON.stringify({
        keep_days: days,
        deleted_count: result.changes,
        total_before: totalBefore
      }), req.ip]);

    // Activity feed
    await db.run(`
      INSERT INTO activity_feed (type, icon, message, details)
      VALUES (?, ?, ?, ?)
    `, ['system', '🧹', `${req.user.username} cleared audit logs older than ${days} days`,
      JSON.stringify({ deleted_count: result.changes })]);

    res.json({
      message: `Cleared ${result.changes} log entries older than ${days} days`,
      deleted: result.changes,
      remaining: totalBefore - result.changes
    });
  } catch (err) {
    console.error('Clear logs error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /clear-all ────────────────────────────────────────────────────────────
router.post('/clear-all', requireRole('super_admin'), async (req, res) => {
  try {
    const db = getAdapter();
    await db.run('DELETE FROM audit_logs');

    // Insert one audit log for this clearing action
    await db.run(`
      INSERT INTO audit_logs (user_id, username, action, category, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [req.user.id, req.user.username, 'Cleared all audit logs', 'system', '{}', req.ip]);

    res.json({ message: 'All audit logs cleared successfully' });
  } catch (err) {
    console.error('Clear all logs error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
