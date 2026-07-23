/**
 * API Admin Command Handler (Vercel Serverless & Express Compatible)
 * POST /api/admin/command
 */
const jwt = require('jsonwebtoken');
const config = require('../../config/default');
const { getAdapter } = require('../../database/adapter');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, config.jwt.secret);
    } catch (e) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const { action, sessionId, targetUrl, websiteId, text } = req.body || {};
    const db = getAdapter();

    if (action === 'redirect' && sessionId && targetUrl) {
      const session = await db.get('SELECT website_id FROM sessions WHERE id = ?', [sessionId]);
      const wId = session ? session.website_id : (websiteId || null);

      await db.run(`
        INSERT INTO redirect_commands (session_id, website_id, target_url, executed_by, executed_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [sessionId, wId, targetUrl, decoded.userId]);

      await db.run(`
        INSERT INTO audit_logs (user_id, username, action, category, details, ip_address)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [decoded.userId, decoded.username || 'admin', 'redirect_session', 'redirect',
        JSON.stringify({ session_id: sessionId, target_url: targetUrl }), req.ip]);

      return res.json({ success: true, message: 'Redirect command queued' });
    }

    res.status(400).json({ error: 'Invalid command parameters' });
  } catch (err) {
    console.error('Admin command error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
