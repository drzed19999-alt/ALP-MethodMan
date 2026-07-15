const router = require('express').Router();
const { getDb } = require('../database/init');
const { authenticateToken } = require('../middleware/auth');

// Apply auth to all notification routes
router.use(authenticateToken);

// ─── GET / ──────────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { page = 1, limit = 50, unread_only } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    let whereSQL = '';
    if (unread_only === '1' || unread_only === 'true') {
      whereSQL = 'WHERE is_read = 0';
    }

    const notifications = db.prepare(`
      SELECT * FROM notifications
      ${whereSQL}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(limitNum, offset);

    const totalRow = db.prepare(`SELECT COUNT(*) as count FROM notifications ${whereSQL}`).get();
    const unreadRow = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE is_read = 0').get();

    res.json({
      notifications,
      unread_count: unreadRow.count,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalRow.count,
        total_pages: Math.ceil(totalRow.count / limitNum)
      }
    });
  } catch (err) {
    console.error('List notifications error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST / ─────────────────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  try {
    const db = getDb();
    const { type = 'info', title, message, link } = req.body;

    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message are required' });
    }

    const validTypes = ['info', 'success', 'warning', 'error', 'session', 'redirect'];
    const notifType = validTypes.includes(type) ? type : 'info';

    const result = db.prepare(`
      INSERT INTO notifications (type, title, message, link, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(notifType, title, message, link || null, new Date().toISOString());

    const notification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json({ message: 'Notification created', notification });
  } catch (err) {
    console.error('Create notification error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PATCH /:id/read ────────────────────────────────────────────────────────────
router.patch('/:id/read', (req, res) => {
  try {
    const db = getDb();
    const notifId = parseInt(req.params.id, 10);

    const existing = db.prepare('SELECT id FROM notifications WHERE id = ?').get(notifId);
    if (!existing) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(notifId);

    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    console.error('Mark notification read error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /read-all ─────────────────────────────────────────────────────────────
router.post('/read-all', (req, res) => {
  try {
    const db = getDb();
    const result = db.prepare('UPDATE notifications SET is_read = 1 WHERE is_read = 0').run();

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
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const notifId = parseInt(req.params.id, 10);

    const existing = db.prepare('SELECT id FROM notifications WHERE id = ?').get(notifId);
    if (!existing) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    db.prepare('DELETE FROM notifications WHERE id = ?').run(notifId);

    res.json({ message: 'Notification deleted' });
  } catch (err) {
    console.error('Delete notification error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
