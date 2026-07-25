const { getAdapter } = require('../database/adapter');

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim().replace('::ffff:', '');
  }
  return (req.socket?.remoteAddress || req.ip || '127.0.0.1').replace('::ffff:', '');
}

async function checkIpBan(req, res, next) {
  if (req.path.startsWith('/api/security')) {
    return next();
  }

  try {
    const clientIp = getClientIp(req);
    const db = getAdapter();

    const blocked = await db.get(`
      SELECT id, expires_at FROM blocked_ips 
      WHERE ip_address = ? 
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    `, [clientIp]);

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
              <p>Your IP address (<code>${clientIp}</code>) has been blocked by the system administrator.</p>
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

async function isIpBlocked(ipAddress) {
  if (!ipAddress) return false;
  const cleanIp = ipAddress.replace('::ffff:', '');
  try {
    const db = getAdapter();
    const blocked = await db.get(`
      SELECT id FROM blocked_ips 
      WHERE ip_address = ? 
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    `, [cleanIp]);

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

