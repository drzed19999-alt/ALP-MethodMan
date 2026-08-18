/**
 * Website Deploy Route
 *
 * Automates deployment of a single xPage website to its own VPS:
 *   - SSH into the site's VPS
 *   - Install nginx (idempotent)
 *   - Sync the xPages/<slug>/ folder via SFTP
 *   - Auto-patch tracker.js with the panel's public URL
 *   - Create/update Cloudflare zone + A records
 *   - Generate Cloudflare Origin SSL cert (15-year, no Let's Encrypt needed)
 *   - Configure nginx (HTTP→HTTPS redirect + HTTPS static server)
 *   - Reload nginx
 *
 * Reuses the same SSE stream endpoint (/api/deploy/stream) as panel deploys,
 * so the terminal component can be reused.
 */

const router          = require('express').Router();
const path            = require('path');
const fs              = require('fs');
const { EventEmitter } = require('events');
const { getAdapter }  = require('../database/adapter');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { scopeSqlClause, requireOwnedResource } = require('../middleware/scope');
const { sshConnect, sshExec, sshExecStream } = require('../services/deploy/ssh');
const { walkDir, sftpUploadDir }               = require('../services/deploy/sftp');
const { deployAntibot, buildProxyLocations }   = require('../services/antibot-vps/deploy');
const CF                                       = require('../services/providers/cloudflare');
const { sidecarPortFor }                       = require('../services/vpsDomain');

const ANTIBOT_SRC = path.join(__dirname, '..', 'public', 'antibot.js');
function renderAntibot(panelUrl) {
  const tpl = fs.readFileSync(ANTIBOT_SRC, 'utf8');
  return tpl.replace(/__PANEL_URL__/g, panelUrl.replace(/\/$/, ''));
}

// Import in-memory session map from routes/deploy.js so /api/deploy/stream can find these sessions
const deployRoute = require('./deploy');
const sessions    = deployRoute._sessions || (deployRoute._sessions = new Map());

router.use(authenticateToken);
router.use(requireRole('super_admin', 'god'));

const XPAGES_DIR = path.join(__dirname, '..', 'xPages');

// ─── Session helpers (mirrors routes/deploy.js pattern) ─────────────────────

function createSession(type) {
  const id      = `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const emitter = new EventEmitter();
  const session = { id, type, status: 'running', startedAt: Date.now(), emitter, logs: [] };
  sessions.set(id, session);
  setTimeout(() => sessions.delete(id), 10 * 60 * 1000);
  return session;
}
function sessionEmit(s, evt) { s.logs.push(evt); s.emitter.emit('e', evt); }

// ─── Helpers ────────────────────────────────────────────────────────────────

function mask(v) { if (!v) return ''; const s = String(v); return s.length <= 8 ? '••••••••' : s.slice(0,4) + '••••••••' + s.slice(-4); }

async function loadWebsite(id) {
  const db = getAdapter();
  return db.get(`SELECT * FROM websites WHERE id = ?`, [id]);
}

async function loadPanelDomain() {
  const db = getAdapter();
  const row = await db.get(`SELECT value FROM settings WHERE key = 'panel_domain'`);
  return (row && row.value) || '';
}

async function loadCloudflareCreds() {
  const db = getAdapter();
  const [email, tokenRow, keyRow, acctRow] = await Promise.all([
    db.get(`SELECT value FROM settings WHERE key = 'deploy_env_CLOUDFLARE_API_EMAIL'`),
    db.get(`SELECT value FROM settings WHERE key = 'deploy_env_CLOUDFLARE_API_TOKEN'`),
    db.get(`SELECT value FROM settings WHERE key = 'deploy_env_CLOUDFLARE_API_KEY'`),
    db.get(`SELECT value FROM settings WHERE key = 'deploy_env_CLOUDFLARE_ACCOUNT_ID'`),
  ]);
  return {
    email:    email?.value    || process.env.CLOUDFLARE_API_EMAIL,
    token:    tokenRow?.value || keyRow?.value || process.env.CLOUDFLARE_API_TOKEN,
    accountId: acctRow?.value || process.env.CLOUDFLARE_ACCOUNT_ID,
  };
}

function cfHeaders({ email, token }) {
  return { 'X-Auth-Email': email, 'X-Auth-Key': token, 'Content-Type': 'application/json' };
}

async function upsertWebsiteField(id, field, value) {
  const db = getAdapter();
  const cols = { [field]: value };
  const sets = Object.keys(cols).map(k => `${k} = ?`).join(', ');
  const params = [...Object.values(cols), id];
  await db.run(`UPDATE websites SET ${sets} WHERE id = ?`, params);
}

async function updateWebsite(id, fields) {
  const db = getAdapter();
  const sets   = Object.keys(fields).map(k => `${k} = ?`).join(', ');
  const params = [...Object.values(fields), id];
  await db.run(`UPDATE websites SET ${sets} WHERE id = ?`, params);
}

// Upload a per-website antibot.js with the panel URL baked in — nginx
// sub_filter injects the <script src="/antibot.js"> tag on the fly, so
// HTML files on disk are never modified.
async function installAntibot(client, remoteDir, panelUrl) {
  const js  = renderAntibot(panelUrl);
  const b64 = Buffer.from(js).toString('base64');
  await sshExec(client, `echo '${b64}' | base64 -d > ${remoteDir}/antibot.js && chown www-data:www-data ${remoteDir}/antibot.js 2>/dev/null || true`);
  return { bytes: js.length };
}

// walkDir + sftpUploadDir moved to services/deploy/sftp.js (shared with services/vpsDomain.js)

// ─── GET /api/website-deploy/vps-list ───────────────────────────────────────
// Returns every website with a configured VPS so the Host wizard can offer
// "Copy from existing VPS" — grouped by host so multiple sites on one server
// are obvious. Never returns the raw password.

router.get('/vps-list', async (req, res) => {
  try {
    const db   = getAdapter();
    const scope = scopeSqlClause(req, 'owner_id');
    const [rows, registryRows, panelRows] = await Promise.all([
      db.all(
        `SELECT id, name, demo_slug, vps_host, vps_ssh_port, vps_ssh_user,
                vps_ssh_pass, vps_ssh_key, deploy_domain, deploy_status
         FROM websites
         WHERE vps_host IS NOT NULL AND vps_host <> ''${scope.clause}
         ORDER BY vps_host, name`,
        scope.params
      ),
      db.all(
        `SELECT id, host, ssh_port, ssh_user, ssh_pass, ssh_key, label
         FROM vpses
         WHERE 1=1${scope.clause.replace(/owner_id/g, 'owner_id')}
         ORDER BY host`,
        scope.params
      ),
      req.user.role === 'god' && req.effectiveUserId == null
        ? db.all(
            `SELECT key, value FROM settings
             WHERE key IN ('panel_vps_host','panel_vps_ssh_port','panel_vps_ssh_user',
                            'deploy_ssh_pass','deploy_ssh_key','deploy_ssh_auth','panel_domain')`
          )
        : Promise.resolve([]),
    ]);

    const pc = {};
    for (const r of panelRows) pc[r.key] = r.value;

    const websites = rows.map(r => ({
      id:            r.id,
      name:          r.name,
      demo_slug:     r.demo_slug,
      vps_host:      r.vps_host,
      vps_ssh_port:  r.vps_ssh_port || 22,
      vps_ssh_user:  r.vps_ssh_user || 'root',
      has_pass:      !!r.vps_ssh_pass,
      has_key:       !!r.vps_ssh_key,
      deploy_domain: r.deploy_domain || '',
      deploy_status: r.deploy_status || 'not_deployed',
    }));

    const registry = registryRows.map(r => ({
      id:       r.id,
      host:     r.host,
      port:     r.ssh_port || 22,
      user:     r.ssh_user || 'root',
      has_pass: !!r.ssh_pass,
      has_key:  !!r.ssh_key,
      label:    r.label || r.host,
    }));

    const panel_vps = pc.panel_vps_host ? {
      host: pc.panel_vps_host,
      port: pc.panel_vps_ssh_port || '22',
      user: pc.panel_vps_ssh_user || 'root',
      has_pass: !!pc.deploy_ssh_pass,
      has_key:  !!pc.deploy_ssh_key,
      domain: pc.panel_domain || '',
    } : null;

    res.json({ websites, registry, panel_vps });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── POST /api/website-deploy/vps-health ──────────────────────────────────────
// SSH into each configured VPS, run health commands, stream results via SSE.

router.post('/vps-health', async (req, res) => {
  // TENANT SCOPING — probe only VPSes the caller owns. Without this, a client
  // clicking "vps health" would SSH into god's panel VPS and every other
  // registered box, leaking creds worth of side effects. Panel VPS is
  // unrestricted-god only.
  const scope = scopeSqlClause(req, 'owner_id');
  const includePanel = req.user.role === 'god' && req.effectiveUserId == null;
  const session = createSession('vps_health');
  res.json({ session_id: session.id });

  (async () => {
    try {
      const db = getAdapter();
      const hosts = new Map();

      const rows = await db.all(
        `SELECT vps_host, vps_ssh_port, vps_ssh_user, vps_ssh_pass, vps_ssh_key
         FROM websites
         WHERE vps_host IS NOT NULL AND vps_host <> ''${scope.clause}
         GROUP BY vps_host, vps_ssh_port, vps_ssh_user, vps_ssh_pass, vps_ssh_key`,
        scope.params
      );
      for (const r of rows) {
        hosts.set(r.vps_host, {
          host: r.vps_host, port: r.vps_ssh_port || 22,
          user: r.vps_ssh_user || 'root', pass: r.vps_ssh_pass, key: r.vps_ssh_key,
          label: r.vps_host,
        });
      }

      // Panel VPS credentials live in settings and are god-only infra.
      if (includePanel) {
        const panelRows = await db.all(
          `SELECT key, value FROM settings
           WHERE key IN ('panel_vps_host','panel_vps_ssh_port','panel_vps_ssh_user','deploy_ssh_pass','deploy_ssh_key','deploy_ssh_auth')`
        );
        const pc = {};
        for (const r of panelRows) pc[r.key] = r.value;
        if (pc.panel_vps_host && !hosts.has(pc.panel_vps_host)) {
          hosts.set(pc.panel_vps_host, {
            host: pc.panel_vps_host, port: pc.panel_vps_ssh_port || 22,
            user: pc.panel_vps_ssh_user || 'root', pass: pc.deploy_ssh_pass, key: pc.deploy_ssh_key,
            label: `${pc.panel_vps_host} (Panel)`,
          });
        }
      }

      sessionEmit(session, { type: 'log', message: `Checking ${hosts.size} VPS server(s)...` });

      for (const [hostIp, cfg] of hosts) {
        sessionEmit(session, { type: 'log', message: `\n── ${cfg.label} ──` });
        let conn;
        try {
          conn = await sshConnect({
            host: cfg.host, port: cfg.port, username: cfg.user,
            password: cfg.pass || undefined,
            privateKey: cfg.key || undefined,
          });
          sessionEmit(session, { type: 'log', message: `✓ SSH connected to ${cfg.host}` });

          for (const cmd of ['uptime', 'df -h / | tail -1', 'free -m | head -2', 'systemctl is-active nginx 2>/dev/null || echo "nginx not managed by systemd"']) {
            try {
              const out = await sshExec(conn, cmd);
              sessionEmit(session, { type: 'log', message: `$ ${cmd}\n${out.trim()}` });
            } catch (e) {
              sessionEmit(session, { type: 'log', message: `$ ${cmd}\n✗ ${e.message}` });
            }
          }
          conn.end();
        } catch (e) {
          sessionEmit(session, { type: 'log', message: `✗ SSH failed: ${e.message}` });
        }
      }

      session.status = 'done';
      sessionEmit(session, { type: 'done', message: 'Health check complete.' });
    } catch (e) {
      session.status = 'error';
      sessionEmit(session, { type: 'error', message: e.message });
    }
  })();
});

// ─── POST /api/website-deploy/:id/copy-vps/:sourceId ────────────────────────
// Copies VPS host + SSH creds from one website to another. Password stays
// server-side — the browser never sees it.

router.post('/:id/copy-vps/:sourceId',
  requireOwnedResource('websites', 'param:id'),
  requireOwnedResource('websites', 'param:sourceId'),
  async (req, res) => {
  try {
    const target = await loadWebsite(req.params.id);
    const source = await loadWebsite(req.params.sourceId);
    if (!target) return res.status(404).json({ error: 'Target website not found' });
    if (!source) return res.status(404).json({ error: 'Source website not found' });
    if (String(target.id) === String(source.id))
      return res.status(400).json({ error: 'Source and target are the same website' });
    if (!source.vps_host)
      return res.status(400).json({ error: `Source website "${source.name}" has no VPS configured` });

    const fields = {
      vps_host:     source.vps_host,
      vps_ssh_port: source.vps_ssh_port || 22,
      vps_ssh_user: source.vps_ssh_user || 'root',
    };
    if (source.vps_ssh_pass) fields.vps_ssh_pass = source.vps_ssh_pass;
    if (source.vps_ssh_key)  fields.vps_ssh_key  = source.vps_ssh_key;

    await updateWebsite(target.id, fields);
    await logAudit(req.user, `Copied VPS config from "${source.name}" to "${target.name}"`, {
      target_id: target.id, source_id: source.id, host: source.vps_host,
    });

    res.json({
      ok: true,
      copied: {
        host:     source.vps_host,
        ssh_port: fields.vps_ssh_port,
        ssh_user: fields.vps_ssh_user,
        has_pass: !!source.vps_ssh_pass,
        has_key:  !!source.vps_ssh_key,
      },
      source_name: source.name,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── POST /api/website-deploy/:id/use-vps/:vpsId ────────────────────────────
// Copies VPS credentials from the vpses registry to a website.

router.post('/:id/use-vps/:vpsId',
  requireOwnedResource('websites', 'param:id'),
  async (req, res) => {
  try {
    const db = getAdapter();
    const target = await loadWebsite(req.params.id);
    if (!target) return res.status(404).json({ error: 'Website not found' });

    const scope = scopeSqlClause(req, 'owner_id');
    const vps = await db.get(
      `SELECT id, host, ssh_port, ssh_user, ssh_pass, ssh_key, label
       FROM vpses WHERE id = ?${scope.clause}`,
      [req.params.vpsId, ...scope.params]
    );
    if (!vps) return res.status(404).json({ error: 'VPS not found' });

    const fields = {
      vps_host:     vps.host,
      vps_ssh_port: vps.ssh_port || 22,
      vps_ssh_user: vps.ssh_user || 'root',
      vps_id:       vps.id,
    };
    if (vps.ssh_pass) fields.vps_ssh_pass = vps.ssh_pass;
    if (vps.ssh_key)  fields.vps_ssh_key  = vps.ssh_key;

    await updateWebsite(target.id, fields);
    await logAudit(req.user, `Linked VPS "${vps.label || vps.host}" to "${target.name}"`, {
      target_id: target.id, vps_id: vps.id, host: vps.host,
    });

    res.json({
      ok: true,
      copied: {
        host:     vps.host,
        ssh_port: fields.vps_ssh_port,
        ssh_user: fields.vps_ssh_user,
        has_pass: !!vps.ssh_pass,
        has_key:  !!vps.ssh_key,
      },
      source_name: vps.label || vps.host,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /api/website-deploy/:id/config ─────────────────────────────────────

router.get('/:id/config', requireOwnedResource('websites', 'param:id'), async (req, res) => {
  try {
    const w = await loadWebsite(req.params.id);
    if (!w) return res.status(404).json({ error: 'Website not found' });
    res.json({
      id:               w.id,
      name:             w.name,
      demo_slug:        w.demo_slug,
      vps_host:         w.vps_host || '',
      vps_ssh_port:     w.vps_ssh_port || 22,
      vps_ssh_user:     w.vps_ssh_user || 'root',
      has_pass:         !!w.vps_ssh_pass,
      has_key:          !!w.vps_ssh_key,
      deploy_domain:    w.deploy_domain || '',
      cf_zone_id:       w.cf_zone_id || '',
      cf_nameservers:   w.cf_nameservers || '',
      deploy_status:    w.deploy_status || 'not_deployed',
      deployed_at:      w.deployed_at || null,
      ssl_issued_at:    w.ssl_issued_at || null,
      panel_url:        w.panel_url || '',
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── PUT /api/website-deploy/:id/config ─────────────────────────────────────

router.put('/:id/config', requireOwnedResource('websites', 'param:id'), async (req, res) => {
  try {
    const w = await loadWebsite(req.params.id);
    if (!w) return res.status(404).json({ error: 'Website not found' });
    const b = req.body || {};

    // ── Validation with helpful messages ─────────────────────────────────
    const warnings = [];

    if (b.vps_host) {
      const host = b.vps_host.trim();
      const ipRe = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
      const hostnameRe = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
      if (!ipRe.test(host) && !hostnameRe.test(host)) {
        return res.status(400).json({ error: 'VPS Host looks invalid — expected an IP like 74.50.87.73 or a hostname.' });
      }
    }

    if (b.vps_ssh_port) {
      const p = parseInt(b.vps_ssh_port, 10);
      if (isNaN(p) || p < 1 || p > 65535) return res.status(400).json({ error: 'SSH Port must be a number between 1 and 65535.' });
    }

    if (b.deploy_domain !== undefined && b.deploy_domain) {
      let d = b.deploy_domain.trim().toLowerCase();
      // Auto-strip common admin mistakes
      d = d.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
      if (d !== b.deploy_domain.trim().toLowerCase()) warnings.push(`Domain cleaned to "${d}" (removed protocol/path/www)`);
      const domainRe = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
      if (!domainRe.test(d)) return res.status(400).json({ error: `Domain "${b.deploy_domain}" is not a valid domain name (e.g. example.com).` });

      // Uniqueness check — same domain used by another website?
      const db = getAdapter();
      const dup = await db.get(`SELECT id, name FROM websites WHERE deploy_domain = ? AND id <> ?`, [d, w.id]);
      if (dup) return res.status(400).json({ error: `Domain "${d}" is already used by "${dup.name}" (site #${dup.id}). Each website needs a unique domain.` });

      b.deploy_domain = d;
    }

    const updates = {};
    if (b.vps_host      !== undefined) updates.vps_host      = b.vps_host || null;
    if (b.vps_ssh_port  !== undefined) updates.vps_ssh_port  = parseInt(b.vps_ssh_port, 10) || 22;
    if (b.vps_ssh_user  !== undefined) updates.vps_ssh_user  = b.vps_ssh_user || 'root';
    if (b.vps_ssh_pass  && b.vps_ssh_pass.trim())  updates.vps_ssh_pass = b.vps_ssh_pass.trim();
    if (b.vps_ssh_key   && b.vps_ssh_key.trim())   updates.vps_ssh_key  = b.vps_ssh_key.trim();
    if (b.deploy_domain !== undefined) updates.deploy_domain = b.deploy_domain || null;
    if (Object.keys(updates).length) await updateWebsite(w.id, updates);

    // ── Mirror the VPS creds into the vpses registry so the VPS survives
    //    website transfers / detach and shows on the VPS Control Center for
    //    its owner. Upsert on (owner_id, host); wire websites.vps_id.
    if (b.vps_host !== undefined) {
      const db = getAdapter();
      if (!b.vps_host) {
        // Explicit clear — detach vps_id but leave the registry row alone
        // (other websites might still use it, and god may want to reattach).
        await db.run(`UPDATE websites SET vps_id = NULL WHERE id = ?`, [w.id]);
      } else {
        const host    = String(b.vps_host).trim();
        const sshPort = parseInt(b.vps_ssh_port, 10) || 22;
        const sshUser = (b.vps_ssh_user || 'root').trim();
        const sshPass = b.vps_ssh_pass ? String(b.vps_ssh_pass).trim() : null;
        const sshKey  = b.vps_ssh_key  ? String(b.vps_ssh_key).trim()  : null;
        const ownerId = w.owner_id;

        const existing = await db.get(
          `SELECT id FROM vpses WHERE owner_id = ? AND host = ?`,
          [ownerId, host]
        );
        let vpsId;
        if (existing) {
          vpsId = existing.id;
          // Only overwrite auth material if this call actually provided it,
          // so a bare host-rename doesn't nuke the stored password/key.
          const patch = [];
          const params = [];
          patch.push('ssh_port = ?'); params.push(sshPort);
          patch.push('ssh_user = ?'); params.push(sshUser);
          if (sshPass) { patch.push('ssh_pass = ?'); params.push(sshPass); }
          if (sshKey)  { patch.push('ssh_key = ?');  params.push(sshKey);  }
          patch.push('updated_at = CURRENT_TIMESTAMP');
          params.push(vpsId);
          await db.run(`UPDATE vpses SET ${patch.join(', ')} WHERE id = ?`, params);
        } else {
          const ins = await db.run(
            `INSERT INTO vpses (owner_id, host, ssh_port, ssh_user, ssh_pass, ssh_key)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [ownerId, host, sshPort, sshUser, sshPass, sshKey]
          );
          vpsId = ins.lastInsertRowid;
        }
        await db.run(`UPDATE websites SET vps_id = ? WHERE id = ?`, [vpsId, w.id]);
      }
    }

    // ── If a domain was set, PROACTIVELY create/reuse the CF zone and return nameservers
    let cfInfo = null;
    if (b.deploy_domain) {
      try {
        const cf = await loadCloudflareCreds();
        if (!cf.email || !cf.token) {
          warnings.push('Cloudflare credentials missing — zone not created. Set them in Panel Settings first.');
        } else {
          const H = cfHeaders(cf);
          let zoneId, nameservers, zoneStatus;
          const q = await fetch(`https://api.cloudflare.com/client/v4/zones?name=${b.deploy_domain}`, { headers: H });
          const qj = await q.json();
          if (qj.result && qj.result.length) {
            zoneId = qj.result[0].id; nameservers = qj.result[0].name_servers; zoneStatus = qj.result[0].status;
          } else {
            const cr = await fetch(`https://api.cloudflare.com/client/v4/zones`, {
              method:'POST', headers:H,
              body: JSON.stringify({ name: b.deploy_domain, account: { id: cf.accountId }, type: 'full' })
            });
            const cj = await cr.json();
            if (cj.success) { zoneId = cj.result.id; nameservers = cj.result.name_servers; zoneStatus = cj.result.status; }
            else warnings.push('Could not create Cloudflare zone: ' + JSON.stringify(cj.errors));
          }
          if (zoneId) {
            await updateWebsite(w.id, { cf_zone_id: zoneId, cf_nameservers: (nameservers || []).join(',') });
            cfInfo = { zone_id: zoneId, nameservers, status: zoneStatus, needs_ns_update: zoneStatus !== 'active' };
          }
        }
      } catch (cfErr) {
        warnings.push('Cloudflare setup error: ' + cfErr.message);
      }
    }

    res.json({ ok: true, updated: Object.keys(updates), warnings, cloudflare: cfInfo });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── POST /api/website-deploy/:id/setup ─────────────────────────────────────

router.post('/:id/setup', requireOwnedResource('websites', 'param:id'), async (req, res) => {
  const w = await loadWebsite(req.params.id);
  if (!w)             return res.status(404).json({ error: 'Website not found' });
  if (!w.vps_host)    return res.status(400).json({ error: 'VPS host not set — save config first.' });
  if (!w.vps_ssh_pass && !w.vps_ssh_key) return res.status(400).json({ error: 'No SSH auth — save password or key first.' });
  if (!w.deploy_domain) return res.status(400).json({ error: 'Domain not set — save config first.' });
  const slug = w.demo_slug || w.name?.toLowerCase().replace(/[^a-z0-9]/g, '');
  const localDir = path.join(XPAGES_DIR, slug);
  if (!fs.existsSync(localDir)) return res.status(400).json({ error: `xPages/${slug} folder not found on panel host.` });

  const session = createSession(`website_setup_${w.id}`);
  res.json({ ok: true, deployId: session.id });
  runWebsiteSetup(session, w, slug, localDir, req.user).catch(() => {});
});

// ─── POST /api/website-deploy/:id/deploy ────────────────────────────────────
// Quick re-sync: files + nginx reload, skips CF/SSL setup

router.post('/:id/deploy', requireOwnedResource('websites', 'param:id'), async (req, res) => {
  const w = await loadWebsite(req.params.id);
  if (!w)              return res.status(404).json({ error: 'Website not found' });
  if (!w.vps_host)     return res.status(400).json({ error: 'Not set up yet — run Setup first.' });
  const slug = w.demo_slug || w.name?.toLowerCase().replace(/[^a-z0-9]/g, '');
  const localDir = path.join(XPAGES_DIR, slug);
  if (!fs.existsSync(localDir)) return res.status(400).json({ error: `xPages/${slug} folder not found on panel host.` });

  const session = createSession(`website_deploy_${w.id}`);
  res.json({ ok: true, deployId: session.id });
  runWebsiteDeploy(session, w, slug, localDir, req.user).catch(() => {});
});

// ─── Setup runner (full pipeline) ───────────────────────────────────────────

async function runWebsiteSetup(session, w, slug, localDir, user) {
  const emit = (e) => sessionEmit(session, e);
  const step = (label) => { session._n = (session._n || 0) + 1; emit({ type:'step', id:session._n, label, status:'running' }); return session._n; };
  const done = (id, st = 'done') => emit({ type:'step', id, status: st });
  const log  = (line, lvl = 'info') => emit({ type:'log', line: String(line).trim(), level: lvl });

  let client;
  const remoteDir = `/var/www/${slug}`;
  const panelDomain = (await loadPanelDomain()) || process.env.PANEL_DOMAIN || '';
  const panelURL    = panelDomain ? `https://${panelDomain}` : '';

  try {
    // ── 1. Connect (with friendly error mapping)
    const s1 = step(`Connecting to ${w.vps_host}`);
    log(`→ SSH ${w.vps_ssh_user || 'root'}@${w.vps_host}:${w.vps_ssh_port || 22}`);
    try {
      client = await sshConnect({
        host: w.vps_host, port: w.vps_ssh_port || 22, username: w.vps_ssh_user || 'root',
        password: w.vps_ssh_pass || undefined, privateKey: w.vps_ssh_key || undefined,
      });
    } catch (e) {
      done(s1, 'error');
      // Translate common SSH errors into admin-friendly messages
      const msg = e.message || '';
      if (msg.includes('ECONNREFUSED'))          throw new Error(`Cannot reach ${w.vps_host}:${w.vps_ssh_port || 22} — VPS may be off, IP wrong, or SSH port blocked by firewall.`);
      if (msg.includes('ETIMEDOUT') || msg.includes('timed out')) throw new Error(`Connection to ${w.vps_host} timed out — VPS may be off or IP is wrong.`);
      if (msg.includes('ENOTFOUND'))             throw new Error(`Cannot resolve "${w.vps_host}" — check the hostname or use the IP address directly.`);
      if (msg.includes('authentication methods failed')) throw new Error(`SSH login failed — check the password (or if you're on Ubuntu 24, password login for root may be disabled — reinstall to Ubuntu 22).`);
      if (msg.includes('Handshake failed'))      throw new Error(`SSH handshake failed with ${w.vps_host} — the server may not be running SSH on port ${w.vps_ssh_port || 22}.`);
      throw new Error(`SSH connection failed: ${msg}`);
    }
    log('Connected', 'success'); done(s1);

    // ── 2. System info
    const s2 = step('Gathering server info');
    const os     = (await sshExec(client, 'cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 | tr -d \'"\'')).stdout.trim();
    const ip     = (await sshExec(client, 'hostname -I | awk \'{print $1}\'')).stdout.trim();
    const disk   = (await sshExec(client, 'df -h / | tail -1 | awk \'{print $2 " total, " $4 " free"}\'')).stdout.trim();
    log(`OS: ${os}`); log(`Public IP: ${ip}`); log(`Disk: ${disk}`);
    done(s2);

    // ── 3. Install nginx + rsync
    const s3 = step('Installing nginx + tools');
    const ngCheck = await sshExec(client, 'nginx -v 2>&1');
    const ngInstalled = ngCheck.code === 0 || (ngCheck.stderr || '').includes('nginx version');
    if (ngInstalled) {
      log('nginx already installed', 'success');
    } else {
      await sshExecStream(client, 'export DEBIAN_FRONTEND=noninteractive && apt-get update -qq 2>&1 && apt-get install -y -qq nginx openssl 2>&1', log);
    }
    done(s3);

    // ── 4. Prepare remote dir
    const s4 = step(`Preparing ${remoteDir}`);
    await sshExec(client, `mkdir -p ${remoteDir} && chown -R www-data:www-data ${remoteDir} 2>/dev/null || true`);
    done(s4);

    // ── 5. Upload files via SFTP
    const s5 = step(`Uploading site files (${slug})`);
    const uploaded = await sftpUploadDir(client, localDir, remoteDir, (n, total, name) => {
      if (n % 5 === 0 || n === total) log(`  ${n}/${total}  ${name}`);
    });
    log(`✓ Uploaded ${uploaded.files} files`, 'success');
    done(s5);

    // ── 6. Rewrite tracker script tag: absolute panel URL + real API key
    const s6 = step('Rewriting tracker script (panel URL + API key)');
    if (!panelURL) {
      log('⚠ Panel domain not set — sessions from this site will not reach the panel', 'warn');
      done(s6, 'warning');
    } else if (!w.api_key) {
      log('⚠ Website has no API key — sessions cannot be attributed', 'warn');
      done(s6, 'warning');
    } else {
      const trackerUrl = `${panelURL}/tracker.js`;
      // Escape for sed: use | as delimiter to avoid clashing with /
      // Rewrite both variants: src="/tracker.js" and src='/tracker.js'
      const escSrc = trackerUrl.replace(/[&|]/g, '\\$&');
      const escKey = String(w.api_key).replace(/[&|]/g, '\\$&');
      const htmlFiles = (await sshExec(client, `find ${remoteDir} -type f -name "*.html" 2>/dev/null`)).stdout.trim().split('\n').filter(Boolean);
      let patched = 0;
      for (const f of htmlFiles) {
        // Rewrite tracker src
        await sshExec(client, `sed -i 's|src="/tracker.js"|src="${escSrc}"|g; s|src=./tracker.js.|src="${escSrc}"|g' "${f}"`);
        // Rewrite API key placeholder
        await sshExec(client, `sed -i 's|%%API_KEY%%|${escKey}|g' "${f}"`);
        patched++;
      }
      log(`Patched ${patched} HTML file${patched === 1 ? '' : 's'}`, 'success');
      log(`  tracker src → ${trackerUrl}`);
      log(`  api-key      → ${String(w.api_key).slice(0, 6)}…${String(w.api_key).slice(-4)}`);
      done(s6);
    }

    // ── 6b. Install per-website antibot.js — nginx sub_filter (added in
    //        step 11 below) injects the <script src="/antibot.js"> tag into
    //        every HTML response on the fly, so no HTML files are modified.
    const s6b = step('Installing antibot.js');
    if (!panelURL) {
      log('⚠ Panel domain not set — antibot cannot verify challenges; VPS-served pages will show "Verification unavailable"', 'warn');
      done(s6b, 'warning');
    } else {
      const info = await installAntibot(client, remoteDir, panelURL);
      log(`Installed ${remoteDir}/antibot.js (${info.bytes} bytes) — challenges → ${panelURL}/api/xpages/challenge`, 'success');
      done(s6b);
    }

    // ── 7. Cloudflare: get creds
    const s7 = step('Configuring Cloudflare zone');
    const cf = await loadCloudflareCreds();
    if (!cf.email || !cf.token) { done(s7, 'error'); throw new Error('Cloudflare credentials missing — set them in Panel Settings.'); }
    const H = cfHeaders(cf);

    // Check if zone exists
    let zoneId, nameservers;
    const q = await fetch(`https://api.cloudflare.com/client/v4/zones?name=${w.deploy_domain}`, { headers: H });
    const qj = await q.json();
    if (qj.result && qj.result.length) {
      zoneId = qj.result[0].id; nameservers = qj.result[0].name_servers;
      log(`Zone already exists in Cloudflare — reusing`);
    } else {
      const cr = await fetch(`https://api.cloudflare.com/client/v4/zones`, {
        method:'POST', headers:H,
        body: JSON.stringify({ name: w.deploy_domain, account: { id: cf.accountId }, type: 'full' })
      });
      const cj = await cr.json();
      if (!cj.success) { done(s7,'error'); throw new Error('CF zone create failed: ' + JSON.stringify(cj.errors)); }
      zoneId = cj.result.id; nameservers = cj.result.name_servers;
      log('✓ New Cloudflare zone created');
    }
    log(`Nameservers: ${nameservers.join(', ')}`);
    await updateWebsite(w.id, { cf_zone_id: zoneId, cf_nameservers: nameservers.join(',') });
    done(s7);

    // ── 8. Enable Cloudflare bot protection (Under Attack + BFM + Browser Check)
    const s8 = step('Enabling Cloudflare bot protection');
    try {
      await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/settings/security_level`, {
        method: 'PATCH', headers: H, body: JSON.stringify({ value: 'under_attack' })
      });
      log('Under Attack mode enabled (48 h — domain monitor auto-steps down)', 'success');
    } catch (e) { log(`Under Attack: ${e.message}`, 'warn'); }
    try {
      await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/bot_management`, {
        method: 'PUT', headers: H, body: JSON.stringify({ fight_mode: true })
      });
      log('Bot Fight Mode enabled', 'success');
    } catch (e) { log(`Bot Fight Mode: ${e.message}`, 'warn'); }
    try {
      await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/settings/browser_check`, {
        method: 'PATCH', headers: H, body: JSON.stringify({ value: 'on' })
      });
      log('Browser Integrity Check enabled', 'success');
    } catch (e) { log(`Browser Check: ${e.message}`, 'warn'); }
    done(s8);

    // ── 9. Create WAF anti-scanner rules
    const s9 = step('Creating WAF anti-scanner rules');
    try {
      const waf = await CF.createAntiScannerRules(zoneId);
      if (waf.ok) log('WAF rules active (scanner UA block + threat score challenge)', 'success');
      else        log(`WAF rules: ${waf.error}`, 'warn');
    } catch (e) { log(`WAF rules failed (non-fatal): ${e.message}`, 'warn'); }
    done(s9);

    // ── 10. CF SSL settings
    const s10 = step('Configuring Cloudflare SSL');
    await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/settings/ssl`, { method:'PATCH', headers:H, body: JSON.stringify({ value:'strict' }) });
    await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/settings/always_use_https`, { method:'PATCH', headers:H, body: JSON.stringify({ value:'on' }) });
    log('SSL: Full (Strict), Always HTTPS enabled', 'success'); done(s10);

    // ── 11. Check zone status → issue Origin cert if active, else defer SSL
    const zoneCheck = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}`, { headers: H });
    const zStatus = (await zoneCheck.json()).result?.status || 'pending';
    const zoneActive = zStatus === 'active';

    let sslInstalled = false;
    if (zoneActive) {
      const s11 = step('Generating SSL certificate (15-year Origin CA)');
      await sshExec(client, `mkdir -p /etc/ssl/${slug} && cd /etc/ssl/${slug} && openssl genrsa -out origin.key 2048 2>&1`);
      await sshExec(client, `cd /etc/ssl/${slug} && openssl req -new -key origin.key -out origin.csr -subj "/CN=${w.deploy_domain}" -addext "subjectAltName=DNS:${w.deploy_domain},DNS:*.${w.deploy_domain}" 2>&1`);
      const csr = (await sshExec(client, `cat /etc/ssl/${slug}/origin.csr`)).stdout.trim();
      const certRes = await fetch('https://api.cloudflare.com/client/v4/certificates', {
        method:'POST', headers: H,
        body: JSON.stringify({ hostnames:[w.deploy_domain, '*.' + w.deploy_domain], requested_validity: 5475, request_type: 'origin-rsa', csr })
      });
      const certJ = await certRes.json();
      if (certJ.success) {
        const b64cert = Buffer.from(certJ.result.certificate).toString('base64');
        await sshExec(client, `echo '${b64cert}' | base64 -d > /etc/ssl/${slug}/origin.crt`);
        await sshExec(client, `chmod 600 /etc/ssl/${slug}/origin.key`);
        log(`✓ Certificate installed (expires ${certJ.result.expires_on})`, 'success');
        sslInstalled = true;
        done(s11);
      } else {
        log(`SSL cert issue failed: ${JSON.stringify(certJ.errors)} — will fall back to HTTP-only`, 'warn');
        done(s11, 'warning');
      }
    } else {
      const s11 = step('SSL certificate (deferred — zone still pending)');
      log(`Zone status: ${zStatus} — waiting for nameserver propagation before issuing cert`, 'warn');
      log(`Switching CF SSL mode to Flexible (HTTP→origin) so site works immediately`, 'info');
      await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/settings/ssl`, { method:'PATCH', headers:H, body: JSON.stringify({ value:'flexible' }) });
      done(s11, 'warning');
    }

    // ── 12. Deploy antibot cloaking sidecar
    const sidecarPort = sidecarPortFor(slug);
    const s12 = step('Deploying antibot cloaking sidecar');
    try {
      const abInfo = await deployAntibot({
        ssh: client,
        slug,
        docroot: remoteDir,
        port: sidecarPort,
        panelUrl: panelURL,
        onLog: (line) => log(line, 'info'),
      });
      log(`Sidecar ${abInfo.serviceName} healthy on 127.0.0.1:${abInfo.port}`, 'success');
    } catch (e) {
      log(`Sidecar deploy failed: ${e.message}`, 'warn');
    }
    done(s12);

    // ── 13. Install default catch-all server block (drops unknown Host headers)
    const s13 = step('Installing default catch-all server block');
    try {
      await sshExec(client, `test -f /etc/ssl/default-catchall.crt || openssl req -x509 -nodes -days 3650 -newkey rsa:2048 -keyout /etc/ssl/default-catchall.key -out /etc/ssl/default-catchall.crt -subj "/CN=localhost" 2>&1`);
      const catchallCfg = [
        '# ALP catch-all — drop connections with unknown Host headers',
        'server {',
        '    listen 80 default_server;',
        '    listen [::]:80 default_server;',
        '    listen 443 ssl http2 default_server;',
        '    listen [::]:443 ssl http2 default_server;',
        '    server_name _;',
        '    ssl_certificate /etc/ssl/default-catchall.crt;',
        '    ssl_certificate_key /etc/ssl/default-catchall.key;',
        '    return 444;',
        '}',
      ].join('\n');
      const cab64 = Buffer.from(catchallCfg).toString('base64');
      await sshExec(client, `echo '${cab64}' | base64 -d > /etc/nginx/sites-available/_default-catchall`);
      await sshExec(client, `ln -sf /etc/nginx/sites-available/_default-catchall /etc/nginx/sites-enabled/_default-catchall`);
      log('Catch-all installed (drops unknown Host requests)', 'success');
    } catch (e) {
      log(`Catch-all install failed (non-fatal): ${e.message}`, 'warn');
    }
    done(s13);

    // ── 14. Clean conflicting nginx configs
    const s14 = step('Cleaning conflicting nginx configs');
    try {
      const grepCmd = `grep -rl 'server_name.*${w.deploy_domain}' /etc/nginx/sites-available/ 2>/dev/null || true`;
      const conflicts = (await sshExec(client, grepCmd)).stdout.trim().split('\n').filter(Boolean);
      let cleaned = 0;
      for (const f of conflicts) {
        const base = f.split('/').pop();
        if (base === slug) continue;
        await sshExec(client, `rm -f /etc/nginx/sites-enabled/${base} /etc/nginx/sites-available/${base}`);
        log(`Removed conflicting config: ${base}`, 'warn');
        cleaned++;
      }
      if (!cleaned) log('No conflicts found', 'success');
    } catch (e) {
      log(`Conflict check failed (non-fatal): ${e.message}`, 'warn');
    }
    done(s14);

    // ── 15. Write nginx config (sidecar proxy — matches domain pipeline)
    const s15 = step('Writing nginx config');
    const proxyLocations = buildProxyLocations(sidecarPort);
    const nginxConf = sslInstalled ? [
      `# Auto-generated by ALP Panel for ${slug} (HTTPS + sidecar)`,
      `server {`,
      `    listen 80; listen [::]:80;`,
      `    server_name ${w.deploy_domain} www.${w.deploy_domain};`,
      `    return 301 https://$host$request_uri;`,
      `}`,
      `server {`,
      `    listen 443 ssl http2; listen [::]:443 ssl http2;`,
      `    server_name ${w.deploy_domain} www.${w.deploy_domain};`,
      `    root ${remoteDir};`,
      ``,
      `    ssl_certificate     /etc/ssl/${slug}/origin.crt;`,
      `    ssl_certificate_key /etc/ssl/${slug}/origin.key;`,
      `    ssl_protocols       TLSv1.2 TLSv1.3;`,
      `    ssl_ciphers         HIGH:!aNULL:!MD5;`,
      ``,
      `    add_header X-Content-Type-Options nosniff;`,
      `    add_header X-Frame-Options SAMEORIGIN;`,
      `    add_header X-Robots-Tag "noindex, nofollow, noarchive, nosnippet" always;`,
      ``,
      ...proxyLocations,
      `}`,
    ].join('\n') : [
      `# Auto-generated by ALP Panel for ${slug} (HTTP-only + sidecar, SSL pending)`,
      `server {`,
      `    listen 80; listen [::]:80;`,
      `    server_name ${w.deploy_domain} www.${w.deploy_domain};`,
      `    root ${remoteDir};`,
      ``,
      `    add_header X-Content-Type-Options nosniff;`,
      `    add_header X-Frame-Options SAMEORIGIN;`,
      `    add_header X-Robots-Tag "noindex, nofollow, noarchive, nosnippet" always;`,
      ``,
      ...proxyLocations,
      `}`,
    ].join('\n');
    const ngb64 = Buffer.from(nginxConf).toString('base64');
    await sshExec(client, `echo '${ngb64}' | base64 -d > /etc/nginx/sites-available/${slug}`);
    await sshExec(client, `ln -sf /etc/nginx/sites-available/${slug} /etc/nginx/sites-enabled/${slug}`);
    await sshExec(client, `rm -f /etc/nginx/sites-enabled/default`);
    const test = await sshExec(client, 'nginx -t 2>&1');
    const ok = (test.stdout + test.stderr).includes('successful');
    if (ok) { await sshExec(client, 'systemctl reload nginx 2>&1'); log('✓ nginx configured & reloaded', 'success'); done(s15); }
    else    { log(`nginx test failed: ${test.stdout + test.stderr}`, 'error'); done(s15, 'error'); throw new Error('nginx config invalid'); }

    // ── 16. Firewall (idempotent)
    const s16 = step('Opening firewall ports');
    const ufw = await sshExec(client, 'which ufw 2>/dev/null');
    if (ufw.code === 0) {
      await sshExec(client, 'ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable 2>&1');
      log('Ports 22, 80, 443 open', 'success');
    } else log('ufw not installed — skipping', 'warn');
    done(s16);

    // ── 17. Create DNS A records → VPS (LAST — domain only resolves after VPS is armed)
    const s17 = step('Setting Cloudflare DNS records');
    for (const rec of [{ type:'A', name:'@', content: w.vps_host, proxied: true, ttl: 1 },
                       { type:'A', name:'www', content: w.vps_host, proxied: true, ttl: 1 }]) {
      const rr = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, { method:'POST', headers:H, body: JSON.stringify(rec) });
      const jj = await rr.json();
      if (jj.success)         log(`✓ ${rec.name === '@' ? w.deploy_domain : rec.name + '.' + w.deploy_domain} → ${w.vps_host}`);
      else if (jj.errors?.[0]?.code === 81058) log(`✓ ${rec.name} already exists`);
      else log(`⚠ ${rec.name}: ${JSON.stringify(jj.errors)}`, 'warn');
    }
    done(s17);

    // ── 13. Save status
    await updateWebsite(w.id, {
      deploy_status: nameservers ? 'ns_pending' : 'live',
      deployed_at:   new Date().toISOString(),
      ssl_issued_at: new Date().toISOString(),
      panel_url:     panelURL || null,
    });

    client.end();
    session.status = 'success';
    const duration = ((Date.now() - session.startedAt) / 1000).toFixed(1);
    emit({ type: 'done', success: true, duration: parseFloat(duration),
           nameservers: nameservers.join(', '),
           domain: w.deploy_domain });
    await logAudit(user, `Website "${w.name}" setup completed`, { host: w.vps_host, domain: w.deploy_domain, duration: `${duration}s` });

  } catch (err) {
    log(`✗ ${err.message}`, 'error');
    session.status = 'failed';
    emit({ type: 'done', success: false, error: err.message });
    if (client) try { client.end(); } catch {}
    await logAudit(user, `Website "${w.name}" setup FAILED`, { error: err.message }).catch(() => {});
  }
}

// ─── Deploy runner (quick redeploy: files only) ─────────────────────────────

async function runWebsiteDeploy(session, w, slug, localDir, user) {
  const emit = (e) => sessionEmit(session, e);
  const step = (l) => { session._n = (session._n || 0) + 1; emit({ type:'step', id:session._n, label:l, status:'running' }); return session._n; };
  const done = (id, st = 'done') => emit({ type:'step', id, status: st });
  const log  = (line, lvl = 'info') => emit({ type:'log', line: String(line).trim(), level: lvl });

  let client;
  const remoteDir = `/var/www/${slug}`;
  const panelURL  = (await loadPanelDomain()) ? `https://${await loadPanelDomain()}` : '';

  try {
    const s1 = step(`Connecting to ${w.vps_host}`);
    client = await sshConnect({ host: w.vps_host, port: w.vps_ssh_port || 22, username: w.vps_ssh_user || 'root',
                                password: w.vps_ssh_pass || undefined, privateKey: w.vps_ssh_key || undefined });
    log('Connected', 'success'); done(s1);

    const s2 = step(`Syncing site files`);
    const uploaded = await sftpUploadDir(client, localDir, remoteDir, (n, total, name) => {
      if (n % 10 === 0 || n === total) log(`  ${n}/${total}  ${name}`);
    });
    log(`✓ Uploaded ${uploaded.files} files`, 'success'); done(s2);

    if (panelURL && w.api_key) {
      const s3 = step('Re-patching tracker script');
      const trackerUrl = `${panelURL}/tracker.js`;
      const escSrc = trackerUrl.replace(/[&|]/g, '\\$&');
      const escKey = String(w.api_key).replace(/[&|]/g, '\\$&');
      const htmlFiles = (await sshExec(client, `find ${remoteDir} -type f -name "*.html" 2>/dev/null`)).stdout.trim().split('\n').filter(Boolean);
      for (const f of htmlFiles) {
        await sshExec(client, `sed -i 's|src="/tracker.js"|src="${escSrc}"|g; s|src=./tracker.js.|src="${escSrc}"|g' "${f}"`);
        await sshExec(client, `sed -i 's|%%API_KEY%%|${escKey}|g' "${f}"`);
      }
      log(`Patched ${htmlFiles.length} HTML files`, 'success');
      done(s3);
    }

    // Refresh per-website antibot.js (always ON — no toggle).
    if (!panelURL) {
      const s3b = step('Antibot install skipped');
      log('⚠ Panel domain not set — cannot install antibot.js', 'warn');
      done(s3b, 'warning');
    } else {
      const s3b = step('Refreshing antibot.js');
      const info = await installAntibot(client, remoteDir, panelURL);
      log(`Installed ${remoteDir}/antibot.js (${info.bytes} bytes)`, 'success');
      done(s3b);
    }

    // Refresh antibot cloaking sidecar (picks up latest guard.js + data files)
    const s3c = step('Refreshing antibot sidecar');
    try {
      const sidecarPort = sidecarPortFor(slug);
      const abInfo = await deployAntibot({
        ssh: client,
        slug,
        docroot: remoteDir,
        port: sidecarPort,
        panelUrl: panelURL,
        onLog: (line) => log(line, 'info'),
      });
      log(`Sidecar ${abInfo.serviceName} refreshed on 127.0.0.1:${abInfo.port}`, 'success');
    } catch (e) {
      log(`Sidecar refresh failed (non-fatal): ${e.message}`, 'warn');
    }
    done(s3c);

    const s4 = step('Reloading nginx');
    await sshExec(client, 'systemctl reload nginx 2>&1');
    log('✓ Reloaded', 'success'); done(s4);

    await updateWebsite(w.id, { deployed_at: new Date().toISOString() });
    client.end();
    session.status = 'success';
    const duration = ((Date.now() - session.startedAt) / 1000).toFixed(1);
    emit({ type: 'done', success: true, duration: parseFloat(duration) });
    await logAudit(user, `Website "${w.name}" redeployed`, { duration: `${duration}s` });
  } catch (err) {
    log(`✗ ${err.message}`, 'error');
    session.status = 'failed';
    emit({ type: 'done', success: false, error: err.message });
    if (client) try { client.end(); } catch {}
    await logAudit(user, `Website "${w.name}" deploy FAILED`, { error: err.message }).catch(() => {});
  }
}

// (strip-antibot endpoint removed — antibot is now nginx sub_filter,
//  files on disk are never modified. No cleanup needed.)

// ─── Audit ──────────────────────────────────────────────────────────────────

async function logAudit(user, action, details) {
  try {
    const db = getAdapter();
    await db.run(
      `INSERT INTO audit_logs (user_id, username, action, category, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)`,
      [user.id, user.username, action, 'website-deploy', JSON.stringify(details), '127.0.0.1']
    );
  } catch {}
}

module.exports = router;
