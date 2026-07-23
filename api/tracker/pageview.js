/**
 * API Tracker PageView Handler (Vercel Serverless & Express Compatible)
 * POST /api/tracker/pageview
 */
const { getAdapter } = require('../../database/adapter');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { sessionId, page, title, duration } = req.body || {};

    if (!sessionId || !page) {
      return res.status(400).json({ error: 'sessionId and page required' });
    }

    const db = getAdapter();
    const session = await db.get('SELECT website_id FROM sessions WHERE id = ?', [sessionId]);

    if (session) {
      await db.run(`
        INSERT INTO page_views (session_id, website_id, page_url, page_title, duration_ms, timestamp)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [sessionId, session.website_id, page, title || page, parseInt(duration, 10) || 0]);

      await db.run(`
        UPDATE sessions SET
          current_page = ?,
          last_activity = CURRENT_TIMESTAMP,
          pages_viewed = pages_viewed + 1
        WHERE id = ?
      `, [page, sessionId]);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Tracker pageview error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
