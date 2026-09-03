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
      SELECT n.*,
             u.username AS actor_name,
             u.role     AS actor_role
        FROM notifications n
        LEFT JOIN users u ON u.id = n.actor_id
       ${whereSQL.replace(/\bnotifications\b/g, 'n')}
       ORDER BY n.created_at DESC
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

// ─── POST /:id/undo ──────────────────────────────────────────────────────
// Consume the undo_action attached to a notification (destructive events).
// Only works while expires_at is still in the future and the row hasn't been
// undone yet. Supported kinds:
//   user_delete     → clear users.deleted_at (7-day soft-delete restore)
//   website_delete  → re-insert the snapshot (websites table only)
//   domain_delete   → best-effort: recreate the domain row with owner intact
router.post('/:id/undo',
  requireOwnedResource('notifications', 'param:id'),
  async (req, res) => {
    try {
      const db = getAdapter();
      const notifId = parseInt(req.params.id, 10);
      const n = await db.get('SELECT * FROM notifications WHERE id = ?', [notifId]);
      if (!n) return res.status(404).json({ error: 'Notification not found' });
      if (n.undone_at) return res.status(409).json({ error: 'Already undone' });
      if (!n.undo_action) return res.status(400).json({ error: 'This event has no undo attached' });
      if (n.expires_at && new Date(n.expires_at).getTime() < Date.now()) {
        return res.status(410).json({ error: 'Undo window expired' });
      }

      let undo;
      try { undo = JSON.parse(n.undo_action); } catch { return res.status(400).json({ error: 'Malformed undo_action' }); }
      const kind = undo?.kind;
      const p    = undo?.params || {};

      if (kind === 'user_delete') {
        if (!p.user_id) return res.status(400).json({ error: 'Missing user_id' });
        await db.run('UPDATE users SET deleted_at = NULL WHERE id = ?', [Number(p.user_id)]);
      } else if (kind === 'website_delete') {
        const s = p.snapshot || {};
        if (!s.id || !s.name) return res.status(400).json({ error: 'Snapshot missing' });
        // Only reinsert if the id is still free (nothing else grabbed it)
        const exists = await db.get('SELECT id FROM websites WHERE id = ?', [s.id]);
        if (exists) return res.status(409).json({ error: 'Website id reused — cannot undo' });
        // Column set — copy the safe subset back
        const cols = ['id','name','domain','demo_slug','logo_url','color','is_active','owner_id','tracker_key','vps_host','vps_ssh_pass','vps_ssh_key','vps_id','domain_active','domain_alt','cf_zone_id','cf_nameservers'];
        const vals = cols.map(c => s[c] === undefined ? null : s[c]);
        const placeholders = cols.map(() => '?').join(',');
        await db.run(`INSERT INTO websites (${cols.join(',')}) VALUES (${placeholders})`, vals);
      } else if (kind === 'domain_delete') {
        if (!p.domain || !p.owner_id) return res.status(400).json({ error: 'Snapshot missing' });
        const exists = await db.get('SELECT id FROM domains WHERE domain = ?', [p.domain]);
        if (exists) return res.status(409).json({ error: 'Domain already re-added — cannot undo' });
        await db.run(
          `INSERT INTO domains (domain, dns_provider, hosting_provider, owner_id, status)
           VALUES (?, 'cloudflare', 'vps', ?, 'pending_dns')`,
          [p.domain, Number(p.owner_id)]
        );
      } else {
        return res.status(400).json({ error: `Unknown undo kind: ${kind}` });
      }

      await db.run(
        `UPDATE notifications SET undone_at = CURRENT_TIMESTAMP, is_read = 1 WHERE id = ?`,
        [notifId]
      );
      res.json({ ok: true, kind });
    } catch (err) {
      console.error('Undo notification error:', err);
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  }
);

// ─── GET /prefs — read the caller's notification prefs + watch list ─────
router.get('/prefs', async (req, res) => {
  try {
    const db = getAdapter();
    const row = await db.get('SELECT notification_prefs, watched_user_ids, telegram_chat_id FROM users WHERE id = ?', [req.user.id]);
    let prefs = null, watched = [];
    try { prefs = row?.notification_prefs ? (typeof row.notification_prefs === 'object' ? row.notification_prefs : JSON.parse(row.notification_prefs)) : null; } catch {}
    try { watched = row?.watched_user_ids ? (Array.isArray(row.watched_user_ids) ? row.watched_user_ids : JSON.parse(row.watched_user_ids)) : []; } catch {}
    res.json({ prefs, watched, telegram_chat_id: row?.telegram_chat_id || null });
  } catch (err) {
    console.error('[prefs] read error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PUT /prefs — save notification prefs + telegram chat id ────────────
router.put('/prefs', async (req, res) => {
  try {
    const db = getAdapter();
    const { prefs, telegram_chat_id } = req.body || {};
    const updates = [];
    const values  = [];
    if (prefs !== undefined) {
      updates.push('notification_prefs = ?');
      values.push(typeof prefs === 'string' ? prefs : JSON.stringify(prefs));
    }
    if (telegram_chat_id !== undefined) {
      updates.push('telegram_chat_id = ?');
      values.push(telegram_chat_id ? String(telegram_chat_id).trim() : null);
    }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    values.push(req.user.id);
    await db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
    res.json({ ok: true });
  } catch (err) {
    console.error('[prefs] write error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /watch/:userId — toggle "watch this user" ─────────────────────
router.post('/watch/:userId', async (req, res) => {
  try {
    const db = getAdapter();
    const targetId = parseInt(req.params.userId, 10);
    if (!targetId || targetId === req.user.id) return res.status(400).json({ error: 'Invalid user id' });
    const row = await db.get('SELECT watched_user_ids FROM users WHERE id = ?', [req.user.id]);
    let list = [];
    try { list = Array.isArray(row?.watched_user_ids) ? row.watched_user_ids : JSON.parse(row?.watched_user_ids || '[]'); } catch {}
    const idx = list.indexOf(targetId);
    if (idx >= 0) list.splice(idx, 1); else list.push(targetId);
    await db.run('UPDATE users SET watched_user_ids = ? WHERE id = ?', [JSON.stringify(list), req.user.id]);
    res.json({ ok: true, watching: idx < 0, list });
  } catch (err) {
    console.error('[watch] toggle error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
