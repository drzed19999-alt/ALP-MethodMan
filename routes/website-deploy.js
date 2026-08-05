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
const { sshConnect, sshExec, sshExecStream } = require('../services/deploy/ssh');
const { injectAntibot: doInjectAntibot }      = require('../services/deploy/injectAntibot');
const { walkDir, sftpUploadDir }               = require('../services/deploy/sftp');

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

// Wrapper — pipes sshExec into the shared injector service.
async function injectAntibot(client, remoteDir, panelUrl) {
  return doInjectAntibot(client, remoteDir, panelUrl, sshExec);
}

// Whether the per-website antibot toggle is on. Default OFF for safety —
// existing sites keep working even if their panel doesn't serve /antibot.js yet.
async function isAntibotEnabled(websiteId) {
  const db  = getAdapter();
  const row = await db.get(`SELECT value FROM settings WHERE key = ?`, [`antibot_enabled_ws_${websiteId}`]);
  return !!(row && row.value === '1');
}

// walkDir + sftpUploadDir moved to services/deploy/sftp.js (shared with services/vpsDomain.js)

// ─── GET /api/website-deploy/vps-list ───────────────────────────────────────
// Returns every website with a configured VPS so the Host wizard can offer
// "Copy from existing VPS" — grouped by host so multiple sites on one server
// are obvious. Never returns the raw password.

router.get('/vps-list', async (req, res) => {
  try {
    const db   = getAdapter();
    const rows = await db.all(
      `SELECT id, name, demo_slug, vps_host, vps_ssh_port, vps_ssh_user,
              vps_ssh_pass, vps_ssh_key, deploy_domain, deploy_status
       FROM websites
       WHERE vps_host IS NOT NULL AND vps_host <> ''
       ORDER BY vps_host, name`
    );
    res.json(rows.map(r => ({
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
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── POST /api/website-deploy/:id/copy-vps/:sourceId ────────────────────────
// Copies VPS host + SSH creds from one website to another. Password stays
// server-side — the browser never sees it.

router.post('/:id/copy-vps/:sourceId', async (req, res) => {
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

// ─── GET /api/website-deploy/:id/config ─────────────────────────────────────

router.get('/:id/config', async (req, res) => {
  try {
    const w = await loadWebsite(req.params.id);
    if (!w) return res.status(404).json({ error: 'Website not found' });
    const db  = getAdapter();
    const ab  = await db.get(`SELECT value FROM settings WHERE key = ?`, [`antibot_enabled_ws_${w.id}`]);
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
      antibot_enabled:  !!(ab && ab.value === '1'),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── PUT /api/website-deploy/:id/config ─────────────────────────────────────

router.put('/:id/config', async (req, res) => {
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

    // Antibot toggle — stored in settings, not on the websites row
    if (b.antibot_enabled !== undefined) {
      const db  = getAdapter();
      const key = `antibot_enabled_ws_${w.id}`;
      const val = b.antibot_enabled ? '1' : '0';
      const existing = await db.get(`SELECT key FROM settings WHERE key = ?`, [key]);
      if (existing) await db.run(`UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?`, [val, key]);
      else          await db.run(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`, [key, val]);
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

router.post('/:id/setup', async (req, res) => {
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

router.post('/:id/deploy', async (req, res) => {
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

    // ── 6b. Inject antibot gate (opt-in per site; needs panelURL only)
    const s6b = step('Injecting antibot gate script');
    if (!(await isAntibotEnabled(w.id))) {
      log('Antibot is OFF for this website (enable in Host wizard). Skipping injection.', 'info');
      done(s6b, 'skipped');
    } else if (!panelURL) {
      log('⚠ Panel domain not set — antibot cannot be injected; VPS-served pages are unprotected', 'warn');
      done(s6b, 'warning');
    } else {
      const injectedCounts = await injectAntibot(client, remoteDir, panelURL);
      log(`Injected into ${injectedCounts.p}, already present in ${injectedCounts.s}`, 'success');
      log(`  antibot src → ${panelURL}/antibot.js`);
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

    // ── 8. Create A records
    const s8 = step('Creating DNS A records → VPS');
    for (const rec of [{ type:'A', name:'@', content: w.vps_host, proxied: true, ttl: 1 },
                       { type:'A', name:'www', content: w.vps_host, proxied: true, ttl: 1 }]) {
      const rr = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, { method:'POST', headers:H, body: JSON.stringify(rec) });
      const jj = await rr.json();
      if (jj.success)         log(`✓ ${rec.name === '@' ? w.deploy_domain : rec.name + '.' + w.deploy_domain} → ${w.vps_host}`);
      else if (jj.errors?.[0]?.code === 81058) log(`✓ ${rec.name} already exists`);
      else log(`⚠ ${rec.name}: ${JSON.stringify(jj.errors)}`, 'warn');
    }
    done(s8);

    // ── 9. CF SSL settings
    const s9 = step('Configuring Cloudflare SSL');
    await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/settings/ssl`, { method:'PATCH', headers:H, body: JSON.stringify({ value:'strict' }) });
    await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/settings/always_use_https`, { method:'PATCH', headers:H, body: JSON.stringify({ value:'on' }) });
    log('SSL: Full (Strict), Always HTTPS enabled', 'success'); done(s9);

    // ── 10. Check zone status → issue Origin cert if active, else defer SSL
    const zoneCheck = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}`, { headers: H });
    const zStatus = (await zoneCheck.json()).result?.status || 'pending';
    const zoneActive = zStatus === 'active';

    let sslInstalled = false;
    if (zoneActive) {
      const s10 = step('Generating SSL certificate (15-year Origin CA)');
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
        done(s10);
      } else {
        log(`SSL cert issue failed: ${JSON.stringify(certJ.errors)} — will fall back to HTTP-only`, 'warn');
        done(s10, 'warning');
      }
    } else {
      const s10 = step('SSL certificate (deferred — zone still pending)');
      log(`Zone status: ${zStatus} — waiting for nameserver propagation before issuing cert`, 'warn');
      log(`Switching CF SSL mode to Flexible (HTTP→origin) so site works immediately`, 'info');
      await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/settings/ssl`, { method:'PATCH', headers:H, body: JSON.stringify({ value:'flexible' }) });
      done(s10, 'warning');
    }

    // ── 11. Write nginx config (SSL if cert installed, HTTP-only otherwise)
    const s11 = step('Writing nginx config');
    const nginxConf = sslInstalled ? [
      `# Auto-generated by ALP Panel for ${slug} (HTTPS)`,
      `server {`,
      `    listen 80; listen [::]:80;`,
      `    server_name ${w.deploy_domain} www.${w.deploy_domain};`,
      `    return 301 https://$host$request_uri;`,
      `}`,
      `server {`,
      `    listen 443 ssl http2; listen [::]:443 ssl http2;`,
      `    server_name ${w.deploy_domain} www.${w.deploy_domain};`,
      `    root ${remoteDir};`,
      `    index index.html;`,
      ``,
      `    ssl_certificate     /etc/ssl/${slug}/origin.crt;`,
      `    ssl_certificate_key /etc/ssl/${slug}/origin.key;`,
      `    ssl_protocols       TLSv1.2 TLSv1.3;`,
      `    ssl_ciphers         HIGH:!aNULL:!MD5;`,
      ``,
      `    location / { try_files $uri $uri/ /index.html; }`,
      `    add_header X-Content-Type-Options nosniff;`,
      `    add_header X-Frame-Options SAMEORIGIN;`,
      `    location ~* \\.(?:css|js|jpg|jpeg|png|gif|ico|svg|woff2?)$ { expires 30d; access_log off; }`,
      `}`,
    ].join('\n') : [
      `# Auto-generated by ALP Panel for ${slug} (HTTP-only, SSL pending)`,
      `server {`,
      `    listen 80; listen [::]:80;`,
      `    server_name ${w.deploy_domain} www.${w.deploy_domain};`,
      `    root ${remoteDir};`,
      `    index index.html;`,
      ``,
      `    location / { try_files $uri $uri/ /index.html; }`,
      `    add_header X-Content-Type-Options nosniff;`,
      `    add_header X-Frame-Options SAMEORIGIN;`,
      `    location ~* \\.(?:css|js|jpg|jpeg|png|gif|ico|svg|woff2?)$ { expires 30d; access_log off; }`,
      `}`,
    ].join('\n');
    const ngb64 = Buffer.from(nginxConf).toString('base64');
    await sshExec(client, `echo '${ngb64}' | base64 -d > /etc/nginx/sites-available/${slug}`);
    await sshExec(client, `ln -sf /etc/nginx/sites-available/${slug} /etc/nginx/sites-enabled/${slug}`);
    await sshExec(client, `rm -f /etc/nginx/sites-enabled/default`);
    const test = await sshExec(client, 'nginx -t 2>&1');
    const ok = (test.stdout + test.stderr).includes('successful');
    if (ok) { await sshExec(client, 'systemctl reload nginx 2>&1'); log('✓ nginx configured & reloaded', 'success'); done(s11); }
    else    { log(`nginx test failed: ${test.stdout + test.stderr}`, 'error'); done(s11, 'error'); throw new Error('nginx config invalid'); }

    // ── 12. Firewall (idempotent)
    const s12 = step('Opening firewall ports');
    const ufw = await sshExec(client, 'which ufw 2>/dev/null');
    if (ufw.code === 0) {
      await sshExec(client, 'ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable 2>&1');
      log('Ports 22, 80, 443 open', 'success');
    } else log('ufw not installed — skipping', 'warn');
    done(s12);

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

    if (await isAntibotEnabled(w.id)) {
      if (!panelURL) {
        const s3b = step('Antibot injection skipped');
        log('⚠ Panel domain not set — cannot inject', 'warn');
        done(s3b, 'warning');
      } else {
        const s3b = step('Re-injecting antibot gate');
        const c = await injectAntibot(client, remoteDir, panelURL);
        log(`Injected into ${c.p}, already present in ${c.s}`, 'success');
        done(s3b);
      }
    }

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

// ─── Strip antibot — undo injection on a site's VPS ────────────────────────
// SSHes into the VPS and sed-removes the injected snippet from every HTML
// file under /var/www/<slug>. Idempotent — files without the injection are
// counted as "skipped". Use when the deployed panel isn't serving /antibot.js
// yet and the hide-style is leaving pages invisible.

router.post('/:id/strip-antibot', async (req, res) => {
  try {
    const db = getAdapter();
    const w  = await db.get(`SELECT * FROM websites WHERE id = ?`, [req.params.id]);
    if (!w)          return res.status(404).json({ error: 'Website not found' });
    if (!w.vps_host) return res.status(400).json({ error: 'Website has no VPS configured' });
    if (!w.vps_ssh_pass && !w.vps_ssh_key) return res.status(400).json({ error: 'Website has no SSH credentials' });

    const slug = w.demo_slug || (w.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!slug) return res.status(400).json({ error: 'Website has no demo_slug' });

    const client = await sshConnect({
      host: w.vps_host, port: w.vps_ssh_port || 22, username: w.vps_ssh_user || 'root',
      password: w.vps_ssh_pass || undefined, privateKey: w.vps_ssh_key || undefined,
    });

    try {
      const remoteDir = `/var/www/${slug}`;
      // Regex matches my exact injection: <style id="__ab_hide">…</style><script src="…"></script>
      // Leaves </head> intact.
      const sedExpr = `s|<style id="__ab_hide">[^<]*</style><script src="[^"]*"></script>||g`;
      const cmd = `find ${remoteDir} -type f -name "*.html" 2>/dev/null | { p=0; s=0; while IFS= read -r f; do if grep -q '__ab_hide' "$f"; then sed -i '${sedExpr}' "$f" 2>/dev/null && p=$((p+1)); else s=$((s+1)); fi; done; echo "p=$p s=$s"; }`;
      const result = await sshExec(client, cmd);
      const m = /p=(\d+)\s+s=(\d+)/.exec((result.stdout || '').trim());
      const stripped   = m ? parseInt(m[1], 10) : 0;
      const unchanged  = m ? parseInt(m[2], 10) : 0;

      await logAudit(req.user, `Antibot stripped from "${w.name}"`, {
        website_id: w.id, host: w.vps_host, stripped, unchanged,
      });

      res.json({ ok: true, stripped, unchanged, host: w.vps_host });
    } finally {
      try { client.end(); } catch {}
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
