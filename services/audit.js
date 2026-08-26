const { getAdapter } = require('../database/adapter');

let geoip = null;
try { geoip = require('geoip-lite'); } catch {}

function parseUserAgent(ua = '') {
  let browser = 'Unknown', device = 'Desktop', os = 'Unknown';
  if (/Mobile|Android|iPhone/.test(ua)) device = 'Mobile';
  else if (/iPad|Tablet/.test(ua)) device = 'Tablet';
  if (/Edge?\//.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera\//.test(ua)) browser = 'Opera';
  else if (/Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = 'Safari';
  if (/Windows/.test(ua)) os = 'Windows';
  else if (/Mac OS/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPad/.test(ua)) os = 'iOS';
  return { browser, device, os };
}

function extractIp(req) {
  if (!req) return '127.0.0.1';
  return (req.ip || '').replace('::ffff:', '') || '127.0.0.1';
}

/**
 * Write an entry to audit_logs.
 *
 * @param {object}  req          Express request (or null for system/bot actions)
 * @param {string}  action       Human-readable description of what happened
 * @param {string}  category     One of: auth, website, session, redirect, settings, system, telegram, deploy, vps, website-deploy, security, domain
 * @param {object}  [details={}] Arbitrary JSON payload
 * @param {object}  [overrides]  Override user_id / username / ip for non-request contexts (bots, cron)
 * @param {number}  [overrides.user_id]
 * @param {string}  [overrides.username]
 * @param {string}  [overrides.ip]
 */
async function writeAudit(req, action, category, details = {}, overrides = {}) {
  try {
    const db = getAdapter();
    const userId  = overrides.user_id  ?? req?.user?.id ?? null;
    const username = overrides.username ?? req?.user?.username ?? 'system';
    const rawIp   = overrides.ip       ?? extractIp(req);

    const ua = req?.headers?.['user-agent'] || '';
    const { browser, device, os } = parseUserAgent(ua);
    const geo = geoip ? (geoip.lookup(rawIp) || {}) : {};

    const enriched = {
      browser, device, os,
      ip: rawIp,
      country: geo.country || null,
      city: geo.city || null,
      user_agent: ua.slice(0, 300),
      ...details
    };

    await db.run(
      'INSERT INTO audit_logs (user_id, username, action, category, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, username, action, category, JSON.stringify(enriched), rawIp]
    );
  } catch (e) {
    console.error('[audit] writeAudit error:', e.message);
  }
}

/**
 * Specialized login-attempt writer — keeps backward compat with existing login detail shape.
 */
async function writeLoginAttempt(req, userId, username, success, extra = {}) {
  const action = success ? 'User logged in' : 'Login failed';
  await writeAudit(req, action, 'auth', extra, { user_id: userId, username: username || 'unknown' });
}

// ─── Failed-login rate limiter ──────────────────────────────────────────────
const _failMap = new Map();
const FAIL_WINDOW_MS   = 15 * 60 * 1000; // 15 minutes
const FAIL_MAX         = 8;               // lock after 8 failures in window
const LOCKOUT_DURATION = 15 * 60 * 1000;  // 15-minute lockout

function _cleanKey(key) {
  const entry = _failMap.get(key);
  if (!entry) return;
  const now = Date.now();
  entry.timestamps = entry.timestamps.filter(t => now - t < FAIL_WINDOW_MS);
  if (!entry.timestamps.length && (!entry.lockedUntil || now > entry.lockedUntil)) {
    _failMap.delete(key);
  }
}

function recordLoginFailure(ip, username) {
  const key = `${ip}::${(username || '').toLowerCase()}`;
  _cleanKey(key);
  let entry = _failMap.get(key);
  if (!entry) { entry = { timestamps: [], lockedUntil: null }; _failMap.set(key, entry); }
  entry.timestamps.push(Date.now());
  if (entry.timestamps.length >= FAIL_MAX) {
    entry.lockedUntil = Date.now() + LOCKOUT_DURATION;
  }
}

function isLoginLocked(ip, username) {
  const key = `${ip}::${(username || '').toLowerCase()}`;
  _cleanKey(key);
  const entry = _failMap.get(key);
  if (!entry || !entry.lockedUntil) return false;
  if (Date.now() > entry.lockedUntil) {
    _failMap.delete(key);
    return false;
  }
  return true;
}

function clearLoginFailures(ip, username) {
  const key = `${ip}::${(username || '').toLowerCase()}`;
  _failMap.delete(key);
}

module.exports = {
  writeAudit,
  writeLoginAttempt,
  recordLoginFailure,
  isLoginLocked,
  clearLoginFailures
};
