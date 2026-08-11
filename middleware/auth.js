const jwt = require('jsonwebtoken');
const config = require('../config/default');
const { getAdapter } = require('../database/adapter');
const { isSupabaseConfigured, getSupabase } = require('../database/supabase');
const { attachUserScope } = require('./scope');

async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret);

    let user;
    if (isSupabaseConfigured()) {
      const { data, error: selErr } = await getSupabase()
        .from('users')
        .select('*')
        .eq('id', decoded.userId)
        .single();
      if (selErr) console.error('[auth] user select error:', selErr.message);
      user = data;
    } else {
      const db = getAdapter();
      user = await db.get(
        'SELECT id, username, email, role, avatar_color, session_token, permissions FROM users WHERE id = ?',
        [decoded.userId]
      );
    }

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Check suspended
    const userPerms = (() => {
      try {
        if (!user.permissions) return {};
        if (typeof user.permissions === 'object') return user.permissions;
        return JSON.parse(user.permissions);
      } catch { return {}; }
    })();
    if (userPerms.suspended && user.role !== 'god') {
      return res.status(403).json({ error: 'Account suspended. Contact an administrator.', code: 'ACCOUNT_SUSPENDED' });
    }

    // Session enforcement disabled — re-enable once DB write reliability is confirmed.

    req.user = user;
    // Resolve effective scope (honours ?as_user for god).
    attachUserScope(req, res, next);
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

function _parsePerms(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return {}; }
}

/**
 * Middleware that enforces a per-user page permission (`permissions.pages.<key>`).
 * god bypasses. Default (missing key) = allowed. Explicit `false` = denied.
 * Reads from req.user.permissions which authenticateToken loads FROM THE DB on
 * every request — so the check is always current, even if the JWT is stale.
 */
function requirePage(pageKey) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (req.user.role === 'god') return next();

    const perms = _parsePerms(req.user.permissions);
    const pages = perms.pages || {};
    if (pages[pageKey] === false) {
      return res.status(403).json({
        error: `Access to "${pageKey}" has been revoked by an administrator.`,
        code: 'PAGE_PERMISSION_REVOKED',
        page: pageKey,
      });
    }
    next();
  };
}

/**
 * Enforces a per-user action permission (`permissions.actions.<pageKey>.<action>`).
 * god bypasses. Default (missing) = allowed. Explicit `false` = denied.
 *
 * The pageKey should match the frontend page it maps to (e.g. 'demo-pages' for
 * the Websites page); the action is a verb like 'create' / 'edit' / 'delete' /
 * 'toggle'. This runs AFTER requirePage — if the whole page is revoked, the
 * request is already 403'd upstream and this is skipped.
 */
function requireAction(pageKey, action) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (req.user.role === 'god') return next();

    const perms = _parsePerms(req.user.permissions);
    // Page-level block wins first, so the caller doesn't need to also list requirePage.
    const pages = perms.pages || {};
    if (pages[pageKey] === false) {
      return res.status(403).json({
        error: `Access to "${pageKey}" has been revoked by an administrator.`,
        code: 'PAGE_PERMISSION_REVOKED',
        page: pageKey,
      });
    }
    const actions = (perms.actions && perms.actions[pageKey]) || {};
    if (actions[action] === false) {
      return res.status(403).json({
        error: `You do not have permission to ${action} on "${pageKey}".`,
        code: 'ACTION_PERMISSION_REVOKED',
        page: pageKey,
        action,
      });
    }
    next();
  };
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

module.exports = { authenticateToken, requireRole, requireGod, requirePage, requireAction, optionalAuth };

