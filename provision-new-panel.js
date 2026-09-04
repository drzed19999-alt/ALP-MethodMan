/**
 * One-shot: turn a bare fresh VPS into a working panel host, from your laptop.
 *
 * PRE-REQ:  a brand-new VPS you can SSH into as root with password auth.
 *           Any provider you can log into — Contabo / Vultr / Hetzner /
 *           Hostinger — as long as it's Ubuntu 22.04 or 24.04, 1 CPU, 2 GB+ RAM.
 *
 * WHAT IT DOES:
 *   1. Connects via SSH with the password you give
 *   2. apt update + installs: Node.js 20 LTS, git, nginx, certbot, pm2, ufw
 *   3. git clones your repo to /var/www/alp
 *   4. Uploads THIS machine's .env verbatim
 *   5. npm install --production
 *   6. Writes an nginx site config for panel_domain proxying to PORT
 *   7. Opens ufw for 22/80/443
 *   8. pm2 start server.js + persists across reboots
 *   9. Runs certbot on panel_domain (skips if DNS not switched over yet)
 *   10. Writes the new host + password back to Supabase so heal-panel.js can
 *       rescue this box automatically next time
 *
 * AFTER IT RUNS:
 *   - If DNS is already pointing at the new IP, you're done — panel is live.
 *   - If not, update your Cloudflare A record for outlwas.online → new IP,
 *     then re-run just the SSL step:  node provision-new-panel.js <ip> <pw> --ssl-only
 *
 * USAGE:
 *   node provision-new-panel.js <new-ip> <root-password>
 *   node provision-new-panel.js 1.2.3.4 mysecret --ssl-only
 */
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { Client } = require('ssh2');
const { createClient } = require('@supabase/supabase-js');

// ─── Parse args ───────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const [host, password] = args;
const sslOnly = args.includes('--ssl-only');
const noSsl   = args.includes('--no-ssl');
const port    = 22;

if (!host || !password) {
  console.error('Usage:  node provision-new-panel.js <new-vps-ip> <root-password> [--ssl-only|--no-ssl]');
  process.exit(1);
}

// ─── Load local .env + git URL ────────────────────────────────────────────
const envRaw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
const { execSync } = require('child_process');
const gitUrl = execSync('git config --get remote.origin.url', { encoding: 'utf8' }).trim();
if (!/^https?:\/\/.+github\.com/.test(gitUrl)) {
  console.error(`⚠️  Remote is "${gitUrl}" — expected an HTTPS github URL (token embedded works too).`);
  process.exit(2);
}

// ─── Connect helper ───────────────────────────────────────────────────────
function connect() {
  return new Promise((resolve, reject) => {
    const c = new Client();
    let done = false;
    const fin = (err, ok) => { if (done) return; done = true; c.on('error', () => {}); ok ? resolve(c) : reject(err); };
    c.on('ready', () => fin(null, true));
    c.on('error', (e) => fin(e, false));
    setTimeout(() => fin(new Error('timeout'), false), 12000);
    c.connect({ host, port, username: 'root', password, readyTimeout: 10000 });
  });
}

// ─── Streamed exec — echoes stdout/stderr live ─────────────────────────────
function exec(ssh, cmd, opts = {}) {
  return new Promise((resolve) => {
    if (!opts.silent) console.log(`\x1b[36m$ ${cmd.length > 200 ? cmd.slice(0, 200) + '…' : cmd}\x1b[0m`);
    ssh.exec(cmd, { pty: !!opts.pty }, (err, stream) => {
      if (err) return resolve({ code: -1, out: '', errOut: err.message });
      let out = '', errOut = '';
      stream.on('close', (code) => resolve({ code, out, errOut }))
            .on('data', (d) => { const s = d.toString(); out += s; if (!opts.silent) process.stdout.write(s); })
            .stderr.on('data', (d) => { const s = d.toString(); errOut += s; if (!opts.silent) process.stderr.write(s); });
    });
  });
}

// ─── Upload a file via sftp ────────────────────────────────────────────────
function writeRemoteFile(ssh, remotePath, content) {
  return new Promise((resolve, reject) => {
    ssh.sftp((err, sftp) => {
      if (err) return reject(err);
      const ws = sftp.createWriteStream(remotePath, { mode: 0o600 });
      ws.on('close', () => resolve());
      ws.on('error', reject);
      ws.end(content);
    });
  });
}

// ─── Main ────────────────────────────────────────────────────────────────
(async () => {
  console.log(`\n🎯 Target: root@${host}:${port}`);
  console.log(`   Git:    ${gitUrl.replace(/:[^:@]+@/, ':<token>@')}`);
  console.log(`   Mode:   ${sslOnly ? 'SSL-only refresh' : 'full provision'}\n`);

  // ── Read panel_domain from Supabase so nginx + certbot are configured right
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY, { auth: { persistSession: false } });
  const { data: settings } = await sb.from('settings').select('key, value');
  const settingsMap = {}; (settings || []).forEach(r => { settingsMap[r.key] = r.value; });
  const panelDomain = settingsMap.panel_domain;
  const appDir      = settingsMap.panel_deploy_app_dir  || '/var/www/alp';
  const pm2Name     = settingsMap.panel_deploy_pm2_name || 'alp';
  const panelPort   = Number(settingsMap.panel_port || 3000);
  if (!panelDomain) { console.error('❌ settings.panel_domain is empty — set it in the panel UI first, then re-run.'); process.exit(3); }
  console.log(`   Domain: ${panelDomain}   port: ${panelPort}   app_dir: ${appDir}   pm2: ${pm2Name}`);

  let ssh;
  try { ssh = await connect(); } catch (e) {
    console.error(`\n❌ Cannot SSH to ${host}: ${e.message}`);
    console.error('   Double-check the IP and root password (reset via provider console if needed).');
    process.exit(4);
  }
  console.log('🔑 Connected.\n');

  // ── SSL-only branch — just run certbot and exit ───────────────────────
  if (sslOnly) {
    await exec(ssh, `certbot --nginx -d ${panelDomain} --non-interactive --agree-tos -m admin@${panelDomain} --redirect --no-eff-email`);
    ssh.end();
    return;
  }

  // ── Full provision ────────────────────────────────────────────────────
  const steps = [
    ['System update',            `apt-get update -qq`],
    ['Base tools',               `DEBIAN_FRONTEND=noninteractive apt-get install -yqq curl git ufw build-essential`],
    ['Node.js 22 LTS',           `curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null && DEBIAN_FRONTEND=noninteractive apt-get install -yqq nodejs`],
    ['nginx + certbot',          `DEBIAN_FRONTEND=noninteractive apt-get install -yqq nginx certbot python3-certbot-nginx`],
    ['pm2 (global)',             `npm install -g pm2 --no-fund --no-audit`],
    ['Firewall',                 `ufw default deny incoming && ufw default allow outgoing && ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && echo y | ufw enable`],
    ['Web root',                 `mkdir -p /var/www && chown www-data:www-data /var/www`],
  ];
  for (const [label, cmd] of steps) {
    console.log(`\n── ${label} ─────────`);
    const r = await exec(ssh, cmd);
    if (r.code !== 0) { console.error(`⚠️  Step failed (${r.code}); continuing.`); }
  }

  // ── Clone / update repo ────────────────────────────────────────────────
  console.log(`\n── Clone repo ─────────`);
  await exec(ssh, `test -d ${appDir}/.git && (cd ${appDir} && git pull --ff-only) || git clone ${gitUrl} ${appDir}`);

  // ── Upload .env ────────────────────────────────────────────────────────
  console.log(`\n── Upload .env ─────────`);
  await writeRemoteFile(ssh, `${appDir}/.env`, envRaw);
  console.log(`  wrote ${envRaw.length} bytes to ${appDir}/.env`);

  // ── npm install ────────────────────────────────────────────────────────
  console.log(`\n── npm install --production ─────────`);
  await exec(ssh, `cd ${appDir} && npm install --production --no-audit --no-fund`);

  // ── nginx site ─────────────────────────────────────────────────────────
  const nginxConf = `server {
    listen 80;
    listen [::]:80;
    server_name ${panelDomain};
    client_max_body_size 25M;

    location / {
        proxy_pass http://127.0.0.1:${panelPort};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300s;
    }
}
`;
  console.log(`\n── nginx site ─────────`);
  await writeRemoteFile(ssh, `/etc/nginx/sites-available/panel.conf`, nginxConf);
  await exec(ssh, `ln -sf /etc/nginx/sites-available/panel.conf /etc/nginx/sites-enabled/panel.conf && rm -f /etc/nginx/sites-enabled/default && nginx -t && systemctl reload nginx`);

  // ── pm2 start ─────────────────────────────────────────────────────────
  console.log(`\n── pm2 start ─────────`);
  await exec(ssh, `cd ${appDir} && pm2 delete ${pm2Name} 2>/dev/null; pm2 start server.js --name ${pm2Name} --update-env`);
  await exec(ssh, `pm2 save && pm2 startup systemd -u root --hp /root | tail -1 | bash`);

  // ── certbot (best effort — DNS may not have flipped yet) ──────────────
  if (!noSsl) {
    console.log(`\n── certbot SSL for ${panelDomain} ─────────`);
    const cb = await exec(ssh, `certbot --nginx -d ${panelDomain} --non-interactive --agree-tos -m admin@${panelDomain} --redirect --no-eff-email`);
    if (cb.code !== 0) {
      console.log(`  ⚠️  certbot failed (probably DNS not pointing here yet).`);
      console.log(`     Point ${panelDomain} A-record → ${host}, then re-run:`);
      console.log(`         node provision-new-panel.js ${host} <pw> --ssl-only`);
    }
  }

  // ── Save creds back to Supabase for heal-panel.js next time ───────────
  console.log(`\n── Persist new panel creds to Supabase ─────────`);
  // Write both the `panel_deploy_*` names (used by heal-panel / logs scripts)
  // AND the unprefixed `deploy_*` names (used by the panel's own vps-dashboard
  // self-health-check). Both point to the same values.
  const upserts = [
    { key: 'panel_vps_host',            value: host },
    { key: 'panel_vps_ssh_port',        value: String(port) },
    { key: 'panel_vps_ssh_user',        value: 'root' },
    // Prefixed (my helper scripts)
    { key: 'panel_deploy_ssh_pass',     value: password },
    { key: 'panel_deploy_auth_mode',    value: 'password' },
    { key: 'panel_deploy_git_repo',     value: gitUrl },
    { key: 'panel_deploy_app_dir',      value: appDir },
    { key: 'panel_deploy_pm2_name',     value: pm2Name },
    // Unprefixed (panel's vps-dashboard self-check + deploy config UI)
    { key: 'deploy_ssh_pass',           value: password },
    { key: 'deploy_auth_mode',          value: 'password' },
    { key: 'deploy_git_repo',           value: gitUrl },
    { key: 'deploy_app_dir',            value: appDir },
    { key: 'deploy_pm2_name',           value: pm2Name },
  ];
  for (const row of upserts) {
    await sb.from('settings').upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    console.log(`  saved settings.${row.key}`);
  }

  // ── Final health check ────────────────────────────────────────────────
  console.log(`\n── Health check ─────────`);
  await exec(ssh, `pm2 status && curl -sSI -m 5 http://127.0.0.1:${panelPort} | head -1`);

  console.log(`\n✅ Provision complete.`);
  console.log(`   • Point DNS: ${panelDomain}  A  →  ${host}`);
  console.log(`   • Then reload: https://${panelDomain}/admin/`);
  console.log(`   • Next time it dies: node heal-panel.js  (creds are saved).\n`);

  ssh.end();
})().catch(err => { console.error('\nFatal:', err.message); process.exit(1); });
