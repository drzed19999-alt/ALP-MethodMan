/**
 * Page Slots — Dynamic content injection per demo page, optionally per session.
 *
 * Slots let admins replace any element on a live page (image src, text, link
 * href, visibility) without touching the HTML file.  The page just needs a
 * data-alp-slot="slot-name" attribute on the element once.
 *
 * A slot can be:
 *   - Global  (session_id IS NULL)  → applies to ALL visitors of that page
 *   - Session (session_id = <vid>)  → overrides the global slot for ONE session
 *
 * Routes (all mounted under /api/websites by server.js):
 *   GET    /:wid/pages/:pid/slots           — list slots (optionally ?session_id=)
 *   POST   /:wid/pages/:pid/slots           — upsert a slot
 *   DELETE /:wid/pages/:pid/slots/:name     — remove a slot (?session_id= to target session)
 */
'use strict';

const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { getAdapter } = require('../database/adapter');
const { authenticateToken } = require('../middleware/auth');
const { requireWebsiteAccess } = require('../middleware/scope');

// ── Ensure the page_slots table exists (lazy migration) ──────────────────────
// NOTE: no DEFAULT on created_at/updated_at — the app always supplies explicit
// ISO strings on INSERT, and Postgres can't default a TEXT column with a
// timestamp expression without an explicit cast (SQLite tolerated it).
async function ensureTable(db) {
  await db.run(`
    CREATE TABLE IF NOT EXISTS page_slots (
      id          TEXT    PRIMARY KEY,
      website_id  TEXT    NOT NULL,
      page_id     TEXT    NOT NULL,
      slot_name   TEXT    NOT NULL,
      slot_type   TEXT    NOT NULL DEFAULT 'img',
      label       TEXT,
      content     TEXT    NOT NULL DEFAULT '',
      session_id  TEXT    DEFAULT NULL,
      created_at  TEXT    NOT NULL,
      updated_at  TEXT    NOT NULL
    )
  `);
  // Add session_id column if this table was created before session support
  try {
    await db.run(`ALTER TABLE page_slots ADD COLUMN session_id TEXT DEFAULT NULL`);
  } catch (_) { /* already exists */ }
}

// ── GET /:wid/pages/:pid/slots ────────────────────────────────────────────────
// ?session_id=   → return only slots for that session + global fallbacks
// (no param)     → return all slots (admin view, grouped)
router.get('/:wid/pages/:pid/slots', authenticateToken, requireWebsiteAccess('param:wid'), async (req, res) => {
  try {
    const db = getAdapter();
    await ensureTable(db);
    const { session_id, full } = req.query;
    // ?full=1 returns the entire img content (used by the Set-QR panel to
    // pre-populate the preview). Otherwise img content is truncated for list speed.
    const contentExpr = (full === '1' || full === 'true')
      ? 'content'
      : "CASE WHEN slot_type = 'img' THEN substr(content, 1, 60) ELSE content END";
    let slots;
    if (session_id) {
      // Return session-specific slots + global ones not overridden by session
      slots = await db.all(
        `SELECT id, slot_name, slot_type, label, session_id,
                ${contentExpr} AS content,
                length(content) AS content_bytes, updated_at
           FROM page_slots
          WHERE website_id = ? AND page_id = ?
            AND (session_id = ? OR session_id IS NULL)
          ORDER BY slot_name, CASE WHEN session_id IS NOT NULL THEN 0 ELSE 1 END`,
        [req.params.wid, req.params.pid, session_id]
      );
      // Deduplicate: session-specific wins
      const seen = new Set();
      slots = slots.filter(s => {
        if (seen.has(s.slot_name)) return false;
        seen.add(s.slot_name);
        return true;
      });
    } else {
      slots = await db.all(
        `SELECT id, slot_name, slot_type, label, session_id,
                ${contentExpr} AS content,
                length(content) AS content_bytes, updated_at
           FROM page_slots
          WHERE website_id = ? AND page_id = ?
          ORDER BY slot_name, CASE WHEN session_id IS NULL THEN 0 ELSE 1 END`,
        [req.params.wid, req.params.pid]
      );
    }
    res.json({ slots: slots || [] });
  } catch (err) {
    console.error('[page-slots] list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /:wid/pages/:pid/slots ───────────────────────────────────────────────
// Body: { slot_name, slot_type, label?, content, session_id? }
// session_id null/omitted = global slot; set = session-specific override
router.post('/:wid/pages/:pid/slots', authenticateToken, requireWebsiteAccess('param:wid'), async (req, res) => {
  const { slot_name, slot_type, label, content, session_id } = req.body || {};
  if (!slot_name || !slot_type || content === undefined) {
    return res.status(400).json({ error: 'slot_name, slot_type and content are required' });
  }
  const VALID_TYPES = ['img', 'text', 'html', 'href', 'show', 'hide'];
  if (!VALID_TYPES.includes(slot_type)) {
    return res.status(400).json({ error: `slot_type must be one of: ${VALID_TYPES.join(', ')}` });
  }
  try {
    const db = getAdapter();
    await ensureTable(db);
    const page = await db.get(
      'SELECT id FROM demo_pages WHERE id = ? AND website_id = ?',
      [req.params.pid, req.params.wid]
    );
    if (!page) return res.status(404).json({ error: 'Page not found' });

    const sid = session_id || null;
    const now = new Date().toISOString();
    const existing = await db.get(
      'SELECT id FROM page_slots WHERE page_id = ? AND slot_name = ? AND (session_id = ? OR (session_id IS NULL AND ? IS NULL))',
      [req.params.pid, slot_name, sid, sid]
    );

    if (existing) {
      await db.run(
        'UPDATE page_slots SET slot_type=?, label=?, content=?, updated_at=? WHERE id=?',
        [slot_type, label || slot_name, content, now, existing.id]
      );
      res.json({ ok: true, id: existing.id, action: 'updated' });
    } else {
      const id = uuidv4();
      await db.run(
        `INSERT INTO page_slots (id, website_id, page_id, slot_name, slot_type, label, content, session_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, req.params.wid, req.params.pid, slot_name, slot_type, label || slot_name, content, sid, now, now]
      );
      res.json({ ok: true, id, action: 'created' });
    }
  } catch (err) {
    console.error('[page-slots] upsert error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /:wid/pages/:pid/slots/:name ──────────────────────────────────────
// ?session_id= to target a session-specific slot; omit for global
router.delete('/:wid/pages/:pid/slots/:name', authenticateToken, requireWebsiteAccess('param:wid'), async (req, res) => {
  try {
    const db = getAdapter();
    await ensureTable(db);
    const sid = req.query.session_id || null;
    await db.run(
      'DELETE FROM page_slots WHERE page_id = ? AND website_id = ? AND slot_name = ? AND (session_id = ? OR (session_id IS NULL AND ? IS NULL))',
      [req.params.pid, req.params.wid, req.params.name, sid, sid]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[page-slots] delete error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
