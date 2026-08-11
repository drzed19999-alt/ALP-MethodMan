const { getAdapter } = require('../database/adapter');

let _io = null;
function setIo(io) { _io = io; }
function getIo() { return _io; }

/**
 * Create a notification. ownerId is required — every notification belongs to
 * exactly one user. Callers pass either the acting user's id or the derived
 * owner id (e.g. domain.owner_id for a "domain flagged" alert). The socket
 * emit targets only that user's admin room so notifications never leak to
 * other clients.
 */
async function createNotification(io, ownerId, { type = 'info', title, message, link = null, event = null }) {
  const socketIo = io || _io;
  if (ownerId == null) {
    console.error('[notification] createNotification called without ownerId — refused');
    return null;
  }
  try {
    const db = getAdapter();
    const result = await db.run(`
      INSERT INTO notifications (owner_id, type, title, message, link, created_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [ownerId, type, title, message, link]);

    const notification = await db.get('SELECT * FROM notifications WHERE id = ?', [result.lastInsertRowid]);

    if (socketIo) {
      try {
        const adminNsp = socketIo.of('/admin');
        const payload = event ? { ...notification, event } : notification;
        // Per-owner room. server.js has each admin socket join `user:<id>` on
        // handshake, so this reaches only the owning user's connected tabs.
        adminNsp.to(`user:${ownerId}`).emit('admin:notification', payload);
      } catch (e) {}
    }

    return notification;
  } catch (err) {
    console.error('Failed to create/emit notification:', err.message);
    return null;
  }
}

module.exports = {
  createNotification,
  setIo,
  getIo
};
