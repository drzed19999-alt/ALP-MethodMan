/**
 * Security Routes - IP Blocking, Rate Limits, Firewall
 *
 * Each user maintains their own IP blocklist for their sites — blocking a
 * scraper on YOUR site doesn't affect another user's site with the same IP.
 * God (unrestricted) sees every user's blocklist; god impersonating a user
 * (?as_user=<id>) sees only that user's list.
 */
const express = require('express');
const router = express.Router();
const { getAdapter } = require('../database/adapter');
const { authenticateToken, requirePage, requireAction } = require('../middleware/auth');
const { scopeSqlClause, requireOwnedResource } = require('../middleware/scope');
const { writeAudit } = require('../services/audit');

router.use(authenticateToken);
router.use(requirePage('ip-blocking'));

// ─── GET /api/security/blocked-ips ─────────────────────────────────────
router.get('/blocked-ips', async (req, res) => {
  try {
    const db = getAdapter();
    const scope = scopeSqlClause(req, 'owner_id');

    const ips = await db.all(
      `SELECT * FROM blocked_ips WHERE 1=1${scope.clause} ORDER BY created_at DESC`,
      scope.params
    );

    const stats = await db.get(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN DATE(created_at) = CURRENT_DATE THEN 1 ELSE 0 END) as today,
        SUM(blocked_requests) as blocked_requests,
        SUM(CASE WHEN type = 'auto' THEN 1 ELSE 0 END) as auto_blocked
      FROM blocked_ips WHERE 1=1${scope.clause}
    `, scope.params);

    res.json({
      ips: ips.map(ip => ({
        id: ip.id,
        ip_address: ip.ip_address,
        type: ip.type || 'manual',
        reason: ip.reason,
        blocked_at: ip.created_at,
        created_at: ip.created_at,
        expires: ip.expires_at,
        blocked_requests: ip.blocked_requests || 0
      })),
      stats: {
        total: stats ? (stats.total || 0) : 0,
        today: stats ? (stats.today || 0) : 0,
        blocked_requests: stats ? (stats.blocked_requests || 0) : 0,
        auto_blocked: stats ? (stats.auto_blocked || 0) : 0
      }
    });
  } catch (err) {
    console.error('Error fetching blocked IPs:', err);
    res.status(500).json({ error: 'Failed to fetch blocked IPs' });
  }
});

// ─── POST /api/security/blocked-ips ────────────────────────────────────
router.post('/blocked-ips', requireAction('ip-blocking', 'create'), async (req, res) => {
  try {
    const db = getAdapter();
    const { ip_address, type, reason } = req.body;

    if (!ip_address) {
      return res.status(400).json({ error: 'IP address is required' });
    }

    const net = require('net');
    const cleanIp = ip_address.replace('::ffff:', '').trim();
    if (!net.isIP(cleanIp)) {
      return res.status(400).json({ error: 'Invalid IP address format' });
    }

    const ownerId = (req.effectiveUserId != null) ? req.effectiveUserId : req.user.id;

    // Already blocked *for this user*? (Two users can independently block the same IP.)
    const existing = await db.get(
      'SELECT id FROM blocked_ips WHERE owner_id = ? AND ip_address = ?',
      [ownerId, ip_address]
    );
    if (existing) return res.status(400).json({ error: 'IP address is already blocked for this user' });

    let expires_at = null;
    if (type === 'temporary') {
      const now = new Date();
      now.setHours(now.getHours() + 24);
      expires_at = now.toISOString();
    }

    const result = await db.run(`
      INSERT INTO blocked_ips (owner_id, ip_address, type, reason, expires_at, blocked_requests, created_at)
      VALUES (?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
    `, [ownerId, ip_address, type || 'manual', reason || '', expires_at]);

    await writeAudit(req, `Blocked IP: ${ip_address}`, 'security', { blocked_ip: ip_address, type: type || 'manual', reason: reason || '' });

    res.json({
      success: true,
      id: result.lastInsertRowid,
      message: 'IP blocked successfully'
    });
  } catch (err) {
    console.error('Error blocking IP:', err);
    res.status(500).json({ error: 'Failed to block IP' });
  }
});

// ─── DELETE /api/security/blocked-ips/:id ──────────────────────────────
router.delete('/blocked-ips/:id',
  requireAction('ip-blocking', 'delete'),
  requireOwnedResource('blocked_ips', 'param:id'),
  async (req, res) => {
    try {
      const db = getAdapter();
      const { id } = req.params;

      const row = await db.get('SELECT ip_address FROM blocked_ips WHERE id = ?', [id]);
      const result = await db.run('DELETE FROM blocked_ips WHERE id = ?', [id]);
      if (result.changes === 0) return res.status(404).json({ error: 'Blocked IP not found' });

      await writeAudit(req, `Unblocked IP: ${row?.ip_address || id}`, 'security', { unblocked_ip: row?.ip_address, block_id: id });

      res.json({ success: true, message: 'IP unblocked successfully' });
    } catch (err) {
      console.error('Error unblocking IP:', err);
      res.status(500).json({ error: 'Failed to unblock IP' });
    }
  }
);

module.exports = router;
