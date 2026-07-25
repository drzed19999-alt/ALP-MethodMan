/**
 * Security Routes - IP Blocking, Rate Limits, Firewall
 */
const express = require('express');
const router = express.Router();
const { getAdapter } = require('../database/adapter');
const { authenticateToken } = require('../middleware/auth');

// Apply auth middleware to all security routes
router.use(authenticateToken);

// ─── IP Blocking ───────────────────────────────────────────────────

/**
 * GET /api/security/blocked-ips
 * Get all blocked IPs with statistics
 */
router.get('/blocked-ips', async (req, res) => {
  try {
    const db = getAdapter();
    
    // Get all blocked IPs
    const ips = await db.all(`
      SELECT * FROM blocked_ips 
      ORDER BY created_at DESC
    `);

    // Get statistics
    const stats = await db.get(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN DATE(created_at) = CURRENT_DATE THEN 1 ELSE 0 END) as today,
        SUM(blocked_requests) as blocked_requests,
        SUM(CASE WHEN type = 'auto' THEN 1 ELSE 0 END) as auto_blocked
      FROM blocked_ips
    `);

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

/**
 * POST /api/security/blocked-ips
 * Block a new IP address
 */
router.post('/blocked-ips', async (req, res) => {
  try {
    const db = getAdapter();
    const { ip_address, type, reason } = req.body;

    if (!ip_address) {
      return res.status(400).json({ error: 'IP address is required' });
    }

    // Validate IP format (supports IPv4 and IPv6)
    const net = require('net');
    const cleanIp = ip_address.replace('::ffff:', '').trim();
    if (!net.isIP(cleanIp)) {
      return res.status(400).json({ error: 'Invalid IP address format' });
    }


    // Check if already blocked
    const existing = await db.get('SELECT id FROM blocked_ips WHERE ip_address = ?', [ip_address]);
    if (existing) {
      return res.status(400).json({ error: 'IP address is already blocked' });
    }

    // Calculate expiration for temporary blocks
    let expires_at = null;
    if (type === 'temporary') {
      const now = new Date();
      now.setHours(now.getHours() + 24);
      expires_at = now.toISOString();
    }

    // Insert blocked IP
    const result = await db.run(`
      INSERT INTO blocked_ips (ip_address, type, reason, expires_at, blocked_requests, created_at)
      VALUES (?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
    `, [ip_address, type || 'manual', reason || '', expires_at]);

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

/**
 * DELETE /api/security/blocked-ips/:id
 * Unblock an IP address
 */
router.delete('/blocked-ips/:id', async (req, res) => {
  try {
    const db = getAdapter();
    const { id } = req.params;

    const result = await db.run('DELETE FROM blocked_ips WHERE id = ?', [id]);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Blocked IP not found' });
    }

    res.json({ success: true, message: 'IP unblocked successfully' });
  } catch (err) {
    console.error('Error unblocking IP:', err);
    res.status(500).json({ error: 'Failed to unblock IP' });
  }
});

module.exports = router;
