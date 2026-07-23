/**
 * API Tracker Init Handler (Vercel Serverless & Express Compatible)
 * POST /api/tracker/init
 */
const { v4: uuidv4 } = require('uuid');
const { getAdapter } = require('../../database/adapter');

function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    '127.0.0.1'
  );
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const data = req.body || {};
    const apiKey = data.apiKey || req.query.apiKey;

    if (!apiKey) {
      return res.status(400).json({ error: 'API key required' });
    }

    const db = getAdapter();
    const website = await db.get('SELECT * FROM websites WHERE api_key = ? AND is_active = 1', [apiKey]);

    if (!website) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    let sessionId = data.sessionId || uuidv4();
    const ip = getClientIp(req);
    const ua = data.userAgent || req.headers['user-agent'] || '';

    let geo = { country: 'Unknown', city: 'Unknown' };
    try {
      const geoip = require('geoip-lite');
      const lookup = geoip.lookup(ip);
      if (lookup) {
        geo = { country: lookup.country || 'Unknown', city: lookup.city || 'Unknown' };
      }
    } catch (e) {}

    const currentPage = data.page || '/';

    const existingSession = await db.get('SELECT id FROM sessions WHERE id = ?', [sessionId]);

    if (existingSession) {
      await db.run(`
        UPDATE sessions SET
          current_page = ?,
          last_activity = CURRENT_TIMESTAMP,
          is_active = 1,
          pages_viewed = pages_viewed + 1
        WHERE id = ?
      `, [currentPage, sessionId]);
    } else {
      await db.run(`
        INSERT INTO sessions (
          id, website_id, visitor_id, ip_address, user_agent,
          browser, os, device, country, city, current_page,
          referrer, started_at, last_activity, is_active, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, ?)
      `, [
        sessionId,
        website.id,
        data.visitorId || ('v_' + uuidv4().slice(0, 8)),
        ip,
        ua,
        data.browser || 'Unknown',
        data.os || 'Unknown',
        data.device || 'Desktop',
        geo.country,
        geo.city,
        currentPage,
        data.referrer || '',
        JSON.stringify({
          screenWidth: data.screenWidth,
          screenHeight: data.screenHeight,
          language: data.language,
          timezone: data.timezone
        })
      ]);

      await db.run(`
        INSERT INTO activity_feed (type, icon, message, details, website_id, session_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        'session',
        '🟢',
        `New visitor on ${website.name} (${geo.country})`,
        JSON.stringify({ ip, browser: data.browser, country: geo.country }),
        website.id,
        sessionId
      ]);
    }

    await db.run(`
      INSERT INTO page_views (session_id, website_id, page_url, page_title, timestamp)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [sessionId, website.id, currentPage, data.title || currentPage]);

    // Check for pending redirect commands for this session
    const pendingCmd = await db.get(`
      SELECT * FROM redirect_commands
      WHERE session_id = ? AND executed_at >= (CURRENT_TIMESTAMP - INTERVAL '1 minute')
      ORDER BY id DESC LIMIT 1
    `, [sessionId]);

    res.json({
      success: true,
      sessionId,
      redirectUrl: pendingCmd ? pendingCmd.target_url : null
    });
  } catch (err) {
    console.error('Tracker init handler error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
