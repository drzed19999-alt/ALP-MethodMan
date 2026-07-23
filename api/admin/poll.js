/**
 * API Admin Polling Handler (Vercel Serverless & Express Compatible)
 * GET /api/admin/poll
 */
const jwt = require('jsonwebtoken');
const config = require('../../config/default');
const { getAdapter } = require('../../database/adapter');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers['authorization'];
    const token = (authHeader && authHeader.split(' ')[1]) || req.query.token;

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      jwt.verify(token, config.jwt.secret);
    } catch (e) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const db = getAdapter();

    const activeSessions = await db.get('SELECT COUNT(*) as count FROM sessions WHERE is_active = 1');
    const todayViews = await db.get('SELECT COUNT(*) as count FROM page_views WHERE timestamp >= CURRENT_DATE');
    const activeWebsites = await db.get('SELECT COUNT(*) as count FROM websites WHERE is_active = 1');

    const recentSessions = await db.all(`
      SELECT s.*, w.name as website_name, w.color as website_color, w.logo_url
      FROM sessions s
      LEFT JOIN websites w ON s.website_id = w.id
      ORDER BY s.last_activity DESC
      LIMIT 50
    `);

    const unreadNotifs = await db.get('SELECT COUNT(*) as count FROM notifications WHERE is_read = 0');
    const recentActivity = await db.all('SELECT * FROM activity_feed ORDER BY timestamp DESC LIMIT 10');

    res.json({
      activeSessions: activeSessions ? activeSessions.count : 0,
      todayViews: todayViews ? todayViews.count : 0,
      activeWebsites: activeWebsites ? activeWebsites.count : 0,
      unreadNotifications: unreadNotifs ? unreadNotifs.count : 0,
      sessions: recentSessions,
      recentActivity,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Admin poll error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
