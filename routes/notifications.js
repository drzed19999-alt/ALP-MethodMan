const router = require('express').Router();
const { getAdapter } = require('../database/adapter');
const { authenticateToken, requirePage, requireAction } = require('../middleware/auth');
const { scopeSqlClause, requireOwnedResource } = require('../middleware/scope');

// Apply auth to all notification routes
router.use(authenticateToken);
router.use(requirePage('notifications'));

// ─── GET / ──────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const db = getAdapter();
    const { page = 1, limit = 50, unread_only } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    // Ownership scope — non-god sees only their own notifications.
    const scope = scopeSqlClause(req, 'owner_id');
    const filters = ['1=1'];
    if (unread_only === '1' || unread_only === 'true') filters.push('is_read = 0');
    const whereSQL = `WHERE ${filters.join(' AND ')}${scope.clause}`;

    const notifications = await db.all(`
      SELECT * FROM notifications
      ${whereSQL}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [...scope.params, limitNum, offset]);

    const totalRow  = await db.get(`SELECT COUNT(*) as count FROM notifications ${whereSQL}`, scope.params);
    const unreadRow = await db.get(
      `SELECT COUNT(*) as count FROM notifications WHERE is_read = 0${scope.clause}`,
      scope.params
    );

    res.json({
      notifications,
      unread_count: unreadRow ? unreadRow.count : 0,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalRow ? totalRow.count : 0,
        total_pages: Math.ceil((totalRow ? totalRow.count : 0) / limitNum)
      }
    });
  } catch (err) {
    console.error('List notifications error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST / ─────────────────────────────────────────────────────────────────────
router.post('/', requireAction('notifications', 'create'), async (req, res) => {
  try {
    const db = getAdapter();
    const { type = 'info', title, message, link } = req.body;

    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message are required' });
    }

    const validTypes = ['info', 'success', 'warning', 'error', 'session', 'redirect'];
    const notifType = validTypes.includes(type) ? type : 'info';

    // God impersonating (?as_user=<id>) creates the notification for that user.
    // Otherwise the notification belongs to the caller.
    const ownerId = (req.effectiveUserId != null) ? req.effectiveUserId : req.user.id;

    const result = await db.run(`
      INSERT INTO notifications (owner_id, type, title, message, link, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [ownerId, notifType, title, message, link || null, new Date().toISOString()]);

    const notification = await db.get('SELECT * FROM notifications WHERE id = ?', [result.lastInsertRowid]);

    res.status(201).json({ message: 'Notification created', notification });
  } catch (err) {
    console.error('Create notification error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PATCH /:id/read ────────────────────────────────────────────────────────────
router.patch('/:id/read',
  requireAction('notifications', 'mark-read'),
  requireOwnedResource('notifications', 'param:id'),
  async (req, res) => {
    try {
      const db = getAdapter();
      const notifId = parseInt(req.params.id, 10);
      await db.run('UPDATE notifications SET is_read = 1 WHERE id = ?', [notifId]);
      res.json({ message: 'Notification marked as read' });
    } catch (err) {
      console.error('Mark notification read error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ─── POST /read-all ─────────────────────────────────────────────────────────────
router.post('/read-all', requireAction('notifications', 'mark-read'), async (req, res) => {
  try {
    const db = getAdapter();
    const scope = scopeSqlClause(req, 'owner_id');
    const result = await db.run(
      `UPDATE notifications SET is_read = 1 WHERE is_read = 0${scope.clause}`,
      scope.params
    );
    res.json({
      message: 'All notifications marked as read',
      updated: result.changes
    });
  } catch (err) {
    console.error('Mark all read error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── DELETE /:id ────────────────────────────────────────────────────────────────
router.delete('/:id',
  requireAction('notifications', 'delete'),
  requireOwnedResource('notifications', 'param:id'),
  async (req, res) => {
    try {
      const db = getAdapter();
      const notifId = parseInt(req.params.id, 10);
      await db.run('DELETE FROM notifications WHERE id = ?', [notifId]);
      res.json({ message: 'Notification deleted' });
    } catch (err) {
      console.error('Delete notification error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

module.exports = router;
