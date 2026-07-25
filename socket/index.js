const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const config = require('../config/default');
const { getDb } = require('../database/init');
const { setupTrackerNamespace } = require('./tracker');
const { setupAdminNamespace } = require('./admin');

const { isIpBlocked } = require('../middleware/ipBan');

/**
 * Set up the Socket.IO server with two namespaces:
 *  - /tracker: for tracked websites sending visitor data
 *  - /admin: for the admin panel (JWT-authenticated)
 *
 * @param {import('http').Server} server - The HTTP server instance
 * @returns {import('socket.io').Server} The Socket.IO server instance
 */
function setupSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: config.cors.origin,
      methods: ['GET', 'POST'],
      credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // ─── IP Ban Middleware for Sockets ──────────────────────────
  const checkSocketIp = async (socket, next) => {
    const ip = socket.handshake.headers['x-forwarded-for']?.split(',')[0].trim() || socket.handshake.address || '';
    if (await isIpBlocked(ip)) {
      return next(new Error('IP_BLOCKED'));
    }
    next();
  };

  // ─── Tracker Namespace (/tracker) ───────────────────────────
  const trackerNsp = io.of('/tracker');
  trackerNsp.use(checkSocketIp);
  setupTrackerNamespace(io, trackerNsp);

  // ─── Admin Namespace (/admin) ───────────────────────────────
  const adminNsp = io.of('/admin');
  adminNsp.use(checkSocketIp);


  // JWT authentication middleware for admin namespace
  adminNsp.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, config.jwt.secret);
      const db = getDb();
      const user = db.prepare(
        'SELECT id, username, email, role, avatar_color, session_token FROM users WHERE id = ?'
      ).get(decoded.userId);

      if (!user) {
        return next(new Error('User not found'));
      }

      // ── Single-session enforcement ────────────────────────────────────────
      // Reject WebSocket connections from sessions that have been superseded.
      if (user.session_token && decoded.sessionToken !== user.session_token) {
        return next(new Error('SESSION_REPLACED'));
      }

      socket.user = user;
      next();
    } catch (err) {
      return next(new Error('Invalid or expired token'));
    }
  });

  setupAdminNamespace(io, adminNsp);

  console.log('✅ Socket.IO initialized with /tracker and /admin namespaces');
  return io;
}

module.exports = { setupSocket };
