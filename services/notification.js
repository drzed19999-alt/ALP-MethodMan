const { getDb } = require('../database/init');

/**
 * Create a new notification, save to DB, and emit to admin socket namespace.
 *
 * @param {import('socket.io').Server} io - The root Socket.IO server
 * @param {Object} params - Notification parameters
 * @param {string} params.type - 'info', 'success', 'warning', 'error', 'alert'
 * @param {string} params.title - Notification title
 * @param {string} params.message - Notification message
 * @param {string} [params.link] - Action link (e.g. '#/sessions?id=...')
 * @returns {Object} The created notification object
 */
function createNotification(io, { type = 'info', title, message, link = null }) {
  try {
    const db = getDb();
    const result = db.prepare(`
      INSERT INTO notifications (type, title, message, link, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(type, title, message, link, new Date().toISOString());

    const notification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(result.lastInsertRowid);

    // Emit to admin namespace
    if (io) {
      const adminNsp = io.of('/admin');
      adminNsp.emit('admin:notification', notification);
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
