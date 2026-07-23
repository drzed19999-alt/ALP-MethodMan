/**
 * API Tracker Session End Handler (Vercel Serverless & Express Compatible)
 * POST /api/tracker/end
 */
const { getAdapter } = require('../../database/adapter');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) {}
    }

    const { sessionId } = body || {};

    if (sessionId) {
      const db = getAdapter();
      await db.run('UPDATE sessions SET last_activity = CURRENT_TIMESTAMP WHERE id = ?', [sessionId]);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Tracker end error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
