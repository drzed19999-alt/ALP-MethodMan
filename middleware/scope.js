/**
 * Per-user ownership middleware.
 *
 * Ownership model:
 *   Every website and every domain has exactly one owner_id (see migration 006).
 *   Non-god users only see rows they own. God sees everything, and can filter
 *   to any single user's view by adding ?as_user=<id> on any API call (or an
 *   `X-As-User: <id>` header). The as_user param is ignored for anyone who
 *   isn't god — no privilege escalation possible.
 *
 * Effective identity:
 *   - Non-god                       → req.effectiveUserId = req.user.id (always)
 *   - God with no as_user           → req.effectiveUserId = null (unrestricted)
 *   - God with ?as_user=<id>        → req.effectiveUserId = <id> (filtered)
 *
 * Public API:
 *   attachUserScope(req, res, next)               → resolves effectiveUserId
 *   scopeSqlClause(req, col='owner_id')           → { clause, params }
 *   requireOwnedResource(table, source='param:id')→ 403 unless row.owner_id matches
 *   filterByOwner(user, rows, key='owner_id')     → drop rows out of scope
 */
'use strict';

const { getAdapter } = require('../database/adapter');

// ── Effective-identity resolution ───────────────────────────────────────────
// Runs after authenticateToken. Must be idempotent: authenticateToken may have
// already been called on a subrouter, so re-computing is fine.
function attachUserScope(req, res, next) {
  if (!req.user) return next();

  const isGod = req.user.role === 'god';

  if (!isGod) {
    // Non-god always sees only their own data. as_user is silently ignored.
    req.effectiveUserId = req.user.id;
    req.isImpersonating = false;
    return next();
  }

  // God: honour ?as_user=<id> or X-As-User header. Empty / missing = unrestricted.
  const raw = (req.query && req.query.as_user) || req.get('x-as-user') || '';
  const asUser = parseInt(raw, 10);
  if (Number.isFinite(asUser) && asUser > 0) {
    req.effectiveUserId = asUser;
    req.isImpersonating = true;
  } else {
    req.effectiveUserId = null;
    req.isImpersonating = false;
  }
  next();
}

/**
 * Build an SQL "AND <column> = ?" clause for the caller's effective scope.
 * Returns { clause, params }.
 *   - Unrestricted (god, no as_user) → { clause: '', params: [] }
 *   - Any scoped call                → { clause: ' AND owner_id = ?', params: [uid] }
 *
 * `column` is inlined verbatim, so only pass trusted identifiers.
 */
function scopeSqlClause(req, column = 'owner_id') {
  if (!req || !req.user) {
    // No auth context — block everything defensively.
    return { clause: ' AND 1 = 0', params: [] };
  }
  // Fail-closed: if attachUserScope hasn't run yet, effectiveUserId is
  // `undefined`. Only `null` (explicit unrestricted-god) opens the gate.
  if (!('effectiveUserId' in req)) {
    console.error('[scope] scopeSqlClause called before attachUserScope — denying');
    return { clause: ' AND 1 = 0', params: [] };
  }
  const uid = req.effectiveUserId;
  if (uid === null) return { clause: '', params: [] };
  return { clause: ` AND ${column} = ?`, params: [uid] };
}

/**
 * Async predicate: does the effective caller own this website?
 * Returns true for unrestricted god (no as_user), false for missing website.
 */
async function ownsWebsite(req, websiteId) {
  if (!req || !req.user) return false;
  // Fail-closed: middleware not run yet.
  if (!('effectiveUserId' in req)) {
    console.error('[scope] ownsWebsite called before attachUserScope — denying');
    return false;
  }
  const uid = req.effectiveUserId;
  if (uid === null) return true;
  const wid = Number(websiteId);
  if (!Number.isFinite(wid)) return false;
  try {
    const w = await getAdapter().get('SELECT owner_id FROM websites WHERE id = ?', [wid]);
    return !!(w && Number(w.owner_id) === Number(uid));
  } catch { return false; }
}

/**
 * Scope helper for child tables that don't have their own owner_id (sessions,
 * page_views, funnels, redirect_rules …). Filters the given website-id column
 * against `websites.owner_id`.
 *
 *   const s = scopeByWebsite(req, 's.website_id');
 *   ` WHERE 1=1 ${s.clause} `   →   ` AND s.website_id IN (SELECT id FROM websites WHERE owner_id = ?) `
 *
 * `col` is inlined verbatim — trusted identifiers only.
 */
function scopeByWebsite(req, col = 'website_id') {
  if (!req || !req.user) return { clause: ' AND 1 = 0', params: [] };
  // Fail-closed: middleware not run yet.
  if (!('effectiveUserId' in req)) {
    console.error('[scope] scopeByWebsite called before attachUserScope — denying');
    return { clause: ' AND 1 = 0', params: [] };
  }
  const uid = req.effectiveUserId;
  if (uid === null) return { clause: '', params: [] };
  return {
    clause: ` AND ${col} IN (SELECT id FROM websites WHERE owner_id = ?)`,
    params: [uid],
  };
}

/**
 * Guard for detail/mutation endpoints. Loads the target row and enforces that
 * its owner_id matches the caller's effective identity (or lets god through
 * when god isn't impersonating).
 *
 *   requireOwnedResource('websites')                     // ← reads req.params.id
 *   requireOwnedResource('domains', 'param:id')          // ← same
 *   requireOwnedResource('websites', 'body:website_id')  // ← nested reference
 *
 * `table` is inlined verbatim — never pass user input.
 */
function requireOwnedResource(table, source = 'param:id') {
  const [where, key] = source.split(':');
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });

    const bag = where === 'param' ? req.params
              : where === 'body'  ? (req.body || {})
              : where === 'query' ? (req.query || {})
              : {};
    const raw = bag[key];
    if (raw === undefined || raw === null || raw === '') {
      return res.status(400).json({ error: `${key} is required` });
    }

    let row;
    try {
      row = await getAdapter().get(
        `SELECT owner_id FROM ${table} WHERE id = ?`,
        [raw]
      );
    } catch (err) {
      console.error(`[scope] requireOwnedResource(${table}) lookup failed:`, err.message);
      return res.status(500).json({ error: 'Ownership check failed' });
    }
    if (!row) return res.status(404).json({ error: 'Not found' });

    // God with no as_user passes; god with as_user must match; non-god must match.
    const uid = req.effectiveUserId;
    if (uid != null && Number(row.owner_id) !== Number(uid)) {
      return res.status(403).json({ error: 'You do not have access to this resource' });
    }
    next();
  };
}

/** In-memory drop-filter for lists loaded outside SQL. */
function filterByOwner(req, rows, key = 'owner_id') {
  if (!Array.isArray(rows)) return rows;
  const uid = req && req.effectiveUserId;
  if (uid == null) return rows; // god unrestricted
  return rows.filter(r => r != null && Number(r[key]) === Number(uid));
}

// ── Legacy shims ────────────────────────────────────────────────────────────
// The rest of the codebase still imports the old names. Keep them working
// during the migration; each caller is being converted to the new names.
async function getUserWebsiteIds(_userId) { return []; }
function invalidateUserScope(_userId) { /* no-op — no cache in new model */ }
function requireWebsiteAccess(source = 'param:id') {
  // Old name mapped to the new owner-based check on the websites table.
  return requireOwnedResource('websites', Array.isArray(source) ? source[0] : source);
}
function filterByScope(user, rows, _key) {
  // Old signature was (user, rows, key='website_id'). New callers should pass
  // req; but for stragglers, degrade to a permissive god / deny non-god check.
  if (!user || user.role === 'god') return rows;
  return [];
}

module.exports = {
  attachUserScope,
  scopeSqlClause,
  scopeByWebsite,
  ownsWebsite,
  requireOwnedResource,
  filterByOwner,
  // legacy names — kept for compatibility during migration
  getUserWebsiteIds,
  invalidateUserScope,
  requireWebsiteAccess,
  filterByScope,
};
