/**
 * activity_feed insert helper.
 *
 * Every event belongs to exactly one owner. Callers either pass the owner_id
 * directly (fast path — the acting user's id, or a website's owner_id they
 * already have on hand) or pass a websiteId and we resolve the owner in one
 * cheap query. Refuses to insert an ownerless event; better to lose one
 * event than to leak it across users.
 */
'use strict';

const { getAdapter } = require('../database/adapter');

async function record({
  ownerId = null,
  websiteId = null,
  sessionId = null,
  type,
  icon,
  message,
  details = {},
}) {
  const db = getAdapter();

  // Resolve owner from the linked website if not supplied.
  if (ownerId == null && websiteId != null) {
    try {
      const w = await db.get('SELECT owner_id FROM websites WHERE id = ?', [websiteId]);
      if (w) ownerId = w.owner_id;
    } catch { /* fallthrough — refused below */ }
  }
  if (ownerId == null) {
    console.warn('[activity_feed] refused ownerless event:', message);
    return null;
  }

  const detailsStr = typeof details === 'string' ? details : JSON.stringify(details || {});
  try {
    await db.run(
      `INSERT INTO activity_feed (owner_id, type, icon, message, details, website_id, session_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [ownerId, type || 'info', icon || '', message || '', detailsStr, websiteId || null, sessionId || null]
    );
  } catch (err) {
    console.warn('[activity_feed] insert failed:', err.message);
  }
}

module.exports = { record };
