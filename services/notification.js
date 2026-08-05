const { getAdapter } = require('../database/adapter');

let _io = null;
function setIo(io) { _io = io; }
function getIo() { return _io; }

async function createNotification(io, { type = 'info', title, message, link = null, event = null }) {
  const socketIo = io || _io;
  try {
    const db = getAdapter();
    const result = await db.run(`
      INSERT INTO notifications (type, title, message, link, created_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [type, title, message, link]);

    const notification = await db.get('SELECT * FROM notifications WHERE id = ?', [result.lastInsertRowid]);

    if (socketIo) {
      try {
        const adminNsp = socketIo.of('/admin');
        const payload = event ? { ...notification, event } : notification;
        adminNsp.emit('admin:notification', payload);
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
