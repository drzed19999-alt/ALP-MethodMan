/**
 * Per-user IP ban middleware.
 *
 * Blocklists are now scoped to the website's owner (see migration 007). To
 * decide "is this IP banned", we must know WHICH website the request is aimed
 * at. If we can't identify one (e.g. admin-panel requests), we pass through —
 * admins should never be blocked from their own panel by another user's
 * blocklist.
 */
const { getAdapter } = require('../database/adapter');

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim().replace('::ffff:', '');
  }
  return (req.socket?.remoteAddress || req.ip || '127.0.0.1').replace('::ffff:', '');
}

/** Resolve the website owner for the request, or null if unknown. */
async function _ownerForRequest(req) {
  // /demo/<slug>/... — look up the website by slug.
  const m = req.path && req.path.match(/^\/demo\/([^\/]+)/);
  if (m) {
    try {
      const db = getAdapter();
      const w = await db.get('SELECT owner_id FROM websites WHERE demo_slug = ?', [m[1]]);
      if (w) return Number(w.owner_id);
    } catch { /* fall through */ }
  }
  return null;
}

async function checkIpBan(req, res, next) {
  // Never block the security page itself (admins managing the list) or admin API.
  if (req.path.startsWith('/api/security') || req.path.startsWith('/admin') || req.path === '/admin.html') {
    return next();
  }

  try {
    const ownerId = await _ownerForRequest(req);
    if (ownerId == null) return next(); // unknown website context — don't block

    const clientIp = getClientIp(req);
    const db = getAdapter();
    const blocked = await db.get(`
      SELECT id, expires_at FROM blocked_ips
      WHERE owner_id = ? AND ip_address = ?
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    `, [ownerId, clientIp]);

    if (blocked) {
      db.run('UPDATE blocked_ips SET blocked_requests = blocked_requests + 1 WHERE id = ?', [blocked.id]).catch(() => {});

      if (req.accepts('html', 'json') === 'json' || req.path.startsWith('/api/')) {
        return res.status(403).json({ error: 'Access denied: Your IP address has been blocked.' });
      } else {
        return res.status(403).send(`
          <!DOCTYPE html>
          <html>
          <head><title>Access Blocked</title><style>body{background:#0a0a0a;color:#ef4444;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}div{text-align:center;background:#141414;padding:40px;border-radius:12px;border:1px solid #262626;}</style></head>
          <body>
            <div>
              <h1>⛔ Access Denied</h1>
              <p>Your IP address (<code>${clientIp}</code>) has been blocked by the site administrator.</p>
            </div>
          </body>
          </html>
        `);
      }
    }

    next();
  } catch (err) {
    next();
  }
}

/**
 * Is `ipAddress` blocked for the website owned by `ownerId`? Both args are
 * required — an ownerless call would either be a global check (removed by
 * the per-user model) or a leak across users, so we refuse and return false.
 */
async function isIpBlocked(ipAddress, ownerId) {
  if (!ipAddress || ownerId == null) return false;
  const cleanIp = ipAddress.replace('::ffff:', '');
  try {
    const db = getAdapter();
    const blocked = await db.get(`
      SELECT id FROM blocked_ips
      WHERE owner_id = ? AND ip_address = ?
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    `, [ownerId, cleanIp]);

    if (blocked) {
      db.run('UPDATE blocked_ips SET blocked_requests = blocked_requests + 1 WHERE id = ?', [blocked.id]).catch(() => {});
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

module.exports = { checkIpBan, isIpBlocked, getClientIp };
