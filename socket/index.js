const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const config = require('../config/default');
const { getAdapter } = require('../database/adapter');
const { isSupabaseConfigured, getSupabase } = require('../database/supabase');
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

  // ─── Tracker Namespace (/tracker) ───────────────────────────
  // No handshake-time IP ban check — blocklists are per-website-owner now,
  // and the website isn't known until tracker:init runs. The per-website
  // check happens inside setupTrackerNamespace once we've resolved the site.
  const trackerNsp = io.of('/tracker');
  setupTrackerNamespace(io, trackerNsp);

  // ─── Admin Namespace (/admin) ───────────────────────────────
  // Admins are never IP-banned from their own panel.
  const adminNsp = io.of('/admin');


  // JWT authentication middleware for admin namespace
  adminNsp.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, config.jwt.secret);

      let user;
      if (isSupabaseConfigured()) {
        const { data } = await getSupabase()
          .from('users')
          .select('id, username, email, role, avatar_color')
          .eq('id', decoded.userId)
          .single();
        user = data;
      } else {
        const db = getAdapter();
        user = await db.get(
          'SELECT id, username, email, role, avatar_color FROM users WHERE id = ?',
          [decoded.userId]
        );
      }

      if (!user) {
        return next(new Error('User not found'));
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
