/**
 * API Tracker Heartbeat Handler (Vercel Serverless & Express Compatible)
 * POST /api/tracker/heartbeat
 */
const { getAdapter } = require('../../database/adapter');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { sessionId, page, apiKey } = req.body || {};

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId required' });
    }

    const db = getAdapter();

    await db.run(`
      UPDATE sessions SET
        last_activity = CURRENT_TIMESTAMP,
        is_active = 1,
        current_page = COALESCE(?, current_page)
      WHERE id = ?
    `, [page || null, sessionId]);

    // Check for pending commands (redirect or inject)
    const pendingCmd = await db.get(`
      SELECT * FROM redirect_commands
      WHERE session_id = ? AND executed_at >= (CURRENT_TIMESTAMP - INTERVAL '30 seconds')
      ORDER BY id DESC LIMIT 1
    `, [sessionId]);

    res.json({
      success: true,
      redirectUrl: pendingCmd ? pendingCmd.target_url : null
    });
  } catch (err) {
    console.error('Tracker heartbeat error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
