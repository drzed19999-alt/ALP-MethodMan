const jwt = require('jsonwebtoken');
const config = require('../config/default');
const { getAdapter } = require('../database/adapter');

async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    const db = getAdapter();
    const user = await db.get(
      'SELECT id, username, email, role, avatar_color, session_token FROM users WHERE id = ?',
      [decoded.userId]
    );

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}


function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    // god role has all permissions
    if (req.user.role === 'god' || roles.includes(req.user.role)) {
      return next();
    }
    return res.status(403).json({ error: 'Insufficient permissions' });
  };
}

/** Middleware that only allows the god role. */
function requireGod(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  if (req.user.role !== 'god') return res.status(403).json({ error: 'Insufficient permissions' });
  next();
}

async function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const decoded = jwt.verify(token, config.jwt.secret);
      const db = getAdapter();
      req.user = await db.get('SELECT id, username, email, role FROM users WHERE id = ?', [decoded.userId]);
    } catch (err) {
      // Token invalid, continue without auth
    }
  }
  next();
}

module.exports = { authenticateToken, requireRole, requireGod, optionalAuth };

