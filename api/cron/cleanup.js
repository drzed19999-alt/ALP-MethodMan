/**
 * Vercel Cron Handler: Session Cleanup
 * GET /api/cron/cleanup (Runs every 5 minutes)
 */
const { getAdapter } = require('../../database/adapter');
const config = require('../../config/default');

module.exports = async function handler(req, res) {
  try {
    const db = getAdapter();
    const timeout = config.session.timeoutMs || 30 * 60 * 1000;
    const cutoff = new Date(Date.now() - timeout).toISOString();

    const result = await db.run(`
      UPDATE sessions SET is_active = 0
      WHERE is_active = 1 AND last_activity < ?
    `, [cutoff]);

    res.json({
      success: true,
      cleanedSessions: result.changes,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Vercel cron cleanup error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
