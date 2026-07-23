const { getAdapter } = require('../database/adapter');

/**
 * Create a new notification, save to DB, and emit to admin socket namespace.
 *
 * @param {Object|null} io - The root Socket.IO server (optional)
 * @param {Object} params - Notification parameters
 * @param {string} params.type - 'info', 'success', 'warning', 'error', 'alert'
 * @param {string} params.title - Notification title
 * @param {string} params.message - Notification message
 * @param {string} [params.link] - Action link
 * @returns {Promise<Object|null>} The created notification object
 */
async function createNotification(io, { type = 'info', title, message, link = null }) {
  try {
    const db = getAdapter();
    const result = await db.run(`
      INSERT INTO notifications (type, title, message, link, created_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [type, title, message, link]);

    const notification = await db.get('SELECT * FROM notifications WHERE id = ?', [result.lastInsertRowid]);

    // Emit to admin namespace if socket is available
    if (io) {
      try {
        const adminNsp = io.of('/admin');
        adminNsp.emit('admin:notification', notification);
      } catch (e) {}
    }

    return notification;
  } catch (err) {
    console.error('Failed to create/emit notification:', err.message);
    return null;
  }
}

module.exports = {
  createNotification
};
