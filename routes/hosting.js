/**
 * Hosting & Infrastructure Configuration
 *
 * Stores provider credentials in the `settings` table so the admin can
 * configure everything from the UI without touching .env.
 *
 * Credential resolution order (highest → lowest priority):
 *   1. DB  — values saved through this UI
 *   2. Env — values from the .env
 *
 * When credentials are saved here, process.env is patched immediately so
 * providers pick them up without a restart.
 *
 * Routes:
 *   GET  /api/hosting            — current effective config (secrets masked)
 *   PUT  /api/hosting            — persist config to settings table
 *   POST /api/hosting/test/cloudflare — verify Cloudflare API token
 *   POST /api/hosting/test/vps        — verify VPS panel reachability
 */

const router = require('express').Router();
const https  = require('https');
const http   = require('http');
const { getAdapter }   = require('../database/adapter');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.use(authenticateToken);
router.use(requireRole('super_admin', 'god'));

// ─── Internal helpers ─────────────────────────────────────────────────────────

function mask(val) {
  if (!val) return '';
  const s = String(val);
  if (s.length <= 8) return '••••••••';
  return s.slice(0, 4) + '••••••••' + s.slice(-4);
}

// Load all hosting-related keys from the settings table
async function loadDbConfig(db) {
  const rows = await db.all(
    `SELECT key, value FROM settings
     WHERE key LIKE 'hosting_%'
        OR key LIKE 'vps_%'
        OR key LIKE 'cloudflare_%'
        OR key LIKE 'panel_%'`
  );
  const obj = {};
  for (const r of rows) obj[r.key] = r.value;
  return obj;
}

// DB value takes precedence over env var
function eff(dbVal, envVal) {
  return dbVal || envVal || '';
}

// Upsert a single key into the settings table (works with SQLite & Supabase adapters)
async function upsert(db, key, value) {
  const existing = await db.get('SELECT key FROM settings WHERE key = ?', [key]);
  if (existing) {
    await db.run(
      'UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?',
      [String(value), key]
    );
  } else {
    await db.run(
      'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      [key, String(value)]
    );
  }
}

// Small HTTPS helper for test-connection calls
function httpsGet(opts) {
  return new Promise((resolve, reject) => {
    const req = https.request(opts, (res) => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, data: raw }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => req.destroy(new Error('Connection timed out')));
    req.end();
  });
}

// ─── GET /api/hosting ─────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const db  = getAdapter();
    const cfg = await loadDbConfig(db);

    const cfToken  = eff(cfg.cloudflare_token,      process.env.CLOUDFLARE_API_TOKEN);
    const cfEmail  = eff(cfg.cloudflare_email,       process.env.CLOUDFLARE_API_EMAIL);
    const cfAccId  = eff(cfg.cloudflare_account_id,  process.env.CLOUDFLARE_ACCOUNT_ID);

    res.json({
      active_provider: 'vps',

      vps: {
        configured:        !!(cfg.vps_host),
        host:              cfg.vps_host       || '',
        ssh_port:          cfg.vps_ssh_port   || '22',
        ssh_user:          cfg.vps_ssh_user   || 'root',
        panel:             cfg.vps_panel      || 'none',
        panel_url:         cfg.vps_panel_url  || '',
        panel_user:        cfg.vps_panel_user || '',
        panel_pass_masked: mask(cfg.vps_panel_pass || ''),
      },

      cloudflare: {
        configured:    !!(cfToken),
        token_masked:  mask(cfToken),
        email:         cfEmail,
        account_id:    cfAccId,
        source: cfg.cloudflare_token ? 'db' : (process.env.CLOUDFLARE_API_TOKEN ? 'env' : 'none'),
      },

      panel: {
        domain:   cfg.panel_domain        || process.env.PANEL_DOMAIN   || '',
        port:     cfg.panel_port          || process.env.PANEL_PORT      || '3000',
        proxy:    cfg.panel_proxy         || process.env.PANEL_PROXY     || 'none',
        ssl:      cfg.panel_ssl           || 'true',
        vps_host: cfg.panel_vps_host      || process.env.PANEL_VPS_HOST || '',
        ssh_port: cfg.panel_vps_ssh_port  || '22',
        ssh_user: cfg.panel_vps_ssh_user  || 'root',
      },
    });
  } catch (err) {
    console.error('[hosting] GET error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/hosting ─────────────────────────────────────────────────────────

router.put('/', async (req, res) => {
  try {
    const db   = getAdapter();
    const body = req.body || {};

    // Collect only the keys we actually received (skip empty secret fields so
    // we don't accidentally overwrite a saved value with a blank placeholder)
    const updates = {};

    // active_provider is always 'vps' now; kept for legacy callers.
    if (body.active_provider) updates.hosting_provider = 'vps';

    if (body.vps) {
      const v = body.vps;
      if (v.host       !== undefined) updates.vps_host       = v.host;
      if (v.ssh_port   !== undefined) updates.vps_ssh_port   = v.ssh_port   || '22';
      if (v.ssh_user   !== undefined) updates.vps_ssh_user   = v.ssh_user   || 'root';
      if (v.panel      !== undefined) updates.vps_panel      = v.panel      || 'none';
      if (v.panel_url  !== undefined) updates.vps_panel_url  = v.panel_url;
      if (v.panel_user !== undefined) updates.vps_panel_user = v.panel_user;
      if (v.panel_pass && v.panel_pass.trim()) updates.vps_panel_pass = v.panel_pass.trim();
    }

    if (body.cloudflare) {
      const cf = body.cloudflare;
      if (cf.token      && cf.token.trim())      updates.cloudflare_token      = cf.token.trim();
      if (cf.email      !== undefined)            updates.cloudflare_email      = cf.email;
      if (cf.account_id !== undefined)            updates.cloudflare_account_id = cf.account_id;
    }

    if (body.panel) {
      const p = body.panel;
      if (p.domain   !== undefined) updates.panel_domain       = p.domain;
      if (p.port     !== undefined) updates.panel_port         = p.port     || '3000';
      if (p.proxy    !== undefined) updates.panel_proxy        = p.proxy    || 'none';
      if (p.ssl      !== undefined) updates.panel_ssl          = p.ssl      || 'true';
      if (p.vps_host !== undefined) updates.panel_vps_host     = p.vps_host;
      if (p.ssh_port !== undefined) updates.panel_vps_ssh_port = p.ssh_port || '22';
      if (p.ssh_user !== undefined) updates.panel_vps_ssh_user = p.ssh_user || 'root';
    }

    if (Object.keys(updates).length === 0)
      return res.json({ ok: true, updated: [] });

    for (const [key, value] of Object.entries(updates))
      await upsert(db, key, value);

    // Patch process.env immediately so providers pick up new values without restart
    if (updates.cloudflare_token)       process.env.CLOUDFLARE_API_TOKEN   = updates.cloudflare_token;
    if (updates.cloudflare_email)       process.env.CLOUDFLARE_API_EMAIL   = updates.cloudflare_email;
    if (updates.cloudflare_account_id)  process.env.CLOUDFLARE_ACCOUNT_ID  = updates.cloudflare_account_id;
    if (updates.vps_host)               process.env.VPS_HOST               = updates.vps_host;
    if (updates.panel_domain)           process.env.PANEL_DOMAIN           = updates.panel_domain;
    if (updates.panel_vps_host)         process.env.PANEL_VPS_HOST         = updates.panel_vps_host;
    if (updates.panel_port)             process.env.PANEL_PORT             = updates.panel_port;

    // Audit log
    try {
      const safeUpdates = { ...updates };
      if (safeUpdates.vps_panel_pass)   safeUpdates.vps_panel_pass   = '[redacted]';
      if (safeUpdates.cloudflare_token) safeUpdates.cloudflare_token = '[redacted]';
      await db.run(
        `INSERT INTO audit_logs (user_id, username, action, category, details, ip_address)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [req.user.id, req.user.username, 'Updated infrastructure config', 'settings',
          JSON.stringify({ keys: Object.keys(updates), values: safeUpdates }), req.ip]
      );
    } catch {}

    res.json({ ok: true, updated: Object.keys(updates) });
  } catch (err) {
    console.error('[hosting] PUT error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/hosting/test/cloudflare ───────────────────────────────────────

router.post('/test/cloudflare', async (req, res) => {
  try {
    const db  = getAdapter();
    const cfg = await loadDbConfig(db);

    const token = eff(cfg.cloudflare_token, process.env.CLOUDFLARE_API_TOKEN);
    if (!token) return res.json({ ok: false, error: 'Cloudflare API Token is not configured' });

    const { data } = await httpsGet({
      hostname: 'api.cloudflare.com',
      path:     '/client/v4/user/tokens/verify',
      method:   'GET',
      headers:  {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!data.success) {
      const msg = data.errors?.[0]?.message || 'Token verification failed';
      return res.json({ ok: false, error: msg });
    }

    res.json({ ok: true, status: data.result?.status, token_id: data.result?.id });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// ─── POST /api/hosting/test/vps ──────────────────────────────────────────────

router.post('/test/vps', async (req, res) => {
  try {
    const db  = getAdapter();
    const cfg = await loadDbConfig(db);

    const host     = cfg.vps_host     || '';
    const panel    = cfg.vps_panel    || 'none';
    const panelUrl = cfg.vps_panel_url || '';

    if (!host) return res.json({ ok: false, error: 'VPS host / IP address is not configured' });

    // Basic format check
    const isValidHost = /^(\d{1,3}\.){3}\d{1,3}$/.test(host) || /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(host);
    if (!isValidHost) return res.json({ ok: false, error: 'Invalid host format — expected an IP or hostname' });

    // If a control panel URL is set, probe it with a HEAD request
    if (panel !== 'none' && panelUrl) {
      let parsed;
      try { parsed = new URL(panelUrl); } catch { return res.json({ ok: false, error: 'Invalid panel URL' }); }

      const lib = parsed.protocol === 'https:' ? https : http;

      const result = await new Promise((resolve, reject) => {
        const r = lib.request({
          hostname: parsed.hostname,
          port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
          path:     '/',
          method:   'HEAD',
          timeout:  6000,
          rejectUnauthorized: false,
        }, (resp) => resolve({ ok: true, status: resp.statusCode }));
        r.on('error', err2 => resolve({ ok: false, error: err2.message }));
        r.on('timeout', ()  => { r.destroy(); resolve({ ok: false, error: 'Connection timed out' }); });
        r.end();
      });

      if (!result.ok) return res.json({ ok: false, error: `Panel unreachable: ${result.error}` });
      return res.json({ ok: true, panel_reachable: true, http_status: result.status });
    }

    // No panel — just confirm the host is set and valid
    res.json({
      ok:   true,
      host,
      note: 'Host format is valid. SSH verification requires server-side setup.',
    });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// ─── POST /api/hosting/test/panel ────────────────────────────────────────────

router.post('/test/panel', async (req, res) => {
  try {
    const db  = getAdapter();
    const cfg = await loadDbConfig(db);

    const domain = cfg.panel_domain || process.env.PANEL_DOMAIN || '';
    const ssl    = cfg.panel_ssl !== 'false';

    if (!domain) return res.json({ ok: false, error: 'Panel domain is not configured' });

    const cleanDomain = domain.replace(/^https?:\/\//, '').split('/')[0];
    const lib         = ssl ? https : http;

    const result = await new Promise((resolve) => {
      const r = lib.request({
        hostname: cleanDomain,
        port:     ssl ? 443 : 80,
        path:     '/',
        method:   'HEAD',
        timeout:  8000,
        rejectUnauthorized: false,
      }, (resp) => resolve({ ok: true, status: resp.statusCode }));
      r.on('error', err2 => resolve({ ok: false, error: err2.message }));
      r.on('timeout', () => { r.destroy(); resolve({ ok: false, error: 'Connection timed out' }); });
      r.end();
    });

    if (!result.ok) return res.json({ ok: false, error: `Panel unreachable: ${result.error}` });
    res.json({ ok: true, domain: cleanDomain, http_status: result.status });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

module.exports = router;
