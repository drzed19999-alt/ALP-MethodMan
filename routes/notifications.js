const router = require('express').Router();
const { getAdapter } = require('../database/adapter');
const { authenticateToken } = require('../middleware/auth');

// Apply auth to all notification routes
router.use(authenticateToken);

// ─── GET / ──────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const db = getAdapter();
    const { page = 1, limit = 50, unread_only } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    let whereSQL = '';
    if (unread_only === '1' || unread_only === 'true') {
      whereSQL = 'WHERE is_read = 0';
    }

    const notifications = await db.all(`
      SELECT * FROM notifications
      ${whereSQL}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [limitNum, offset]);

    const totalRow = await db.get(`SELECT COUNT(*) as count FROM notifications ${whereSQL}`);
    const unreadRow = await db.get('SELECT COUNT(*) as count FROM notifications WHERE is_read = 0');

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
router.post('/', async (req, res) => {
  try {
    const db = getAdapter();
    const { type = 'info', title, message, link } = req.body;

    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message are required' });
    }

    const validTypes = ['info', 'success', 'warning', 'error', 'session', 'redirect'];
    const notifType = validTypes.includes(type) ? type : 'info';

    const result = await db.run(`
      INSERT INTO notifications (type, title, message, link, created_at)
      VALUES (?, ?, ?, ?, ?)
    `, [notifType, title, message, link || null, new Date().toISOString()]);

    const notification = await db.get('SELECT * FROM notifications WHERE id = ?', [result.lastInsertRowid]);

    res.status(201).json({ message: 'Notification created', notification });
  } catch (err) {
    console.error('Create notification error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PATCH /:id/read ────────────────────────────────────────────────────────────
router.patch('/:id/read', async (req, res) => {
  try {
    const db = getAdapter();
    const notifId = parseInt(req.params.id, 10);

    const existing = await db.get('SELECT id FROM notifications WHERE id = ?', [notifId]);
    if (!existing) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    await db.run('UPDATE notifications SET is_read = 1 WHERE id = ?', [notifId]);

    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    console.error('Mark notification read error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /read-all ─────────────────────────────────────────────────────────────
router.post('/read-all', async (req, res) => {
  try {
    const db = getAdapter();
    const result = await db.run('UPDATE notifications SET is_read = 1 WHERE is_read = 0');

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
router.delete('/:id', async (req, res) => {
  try {
    const db = getAdapter();
    const notifId = parseInt(req.params.id, 10);

    const existing = await db.get('SELECT id FROM notifications WHERE id = ?', [notifId]);
    if (!existing) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    await db.run('DELETE FROM notifications WHERE id = ?', [notifId]);

    res.json({ message: 'Notification deleted' });
  } catch (err) {
    console.error('Delete notification error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
