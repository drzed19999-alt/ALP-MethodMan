/**
 * Antibot VPS Deployer — installs the guard sidecar on a target VPS.
 *
 * Usage from panel code:
 *   const { deployAntibot } = require('./services/antibot-vps/deploy');
 *   const info = await deployAntibot({ ssh, slug, docroot, port, panelUrl });
 *   // info.port — where the sidecar listens (loopback)
 *
 * Idempotent — safe to re-run to update the guard binary / data files.
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const { sshExec }        = require('../deploy/ssh');
const { sftpUploadDir }  = require('../deploy/sftp');

const SRC_DIR = __dirname;

async function deployAntibot({ ssh, slug, docroot, port = 3001, panelUrl = '', onLog = () => {} }) {
  if (!ssh)     throw new Error('deployAntibot: ssh connection required');
  if (!slug)    throw new Error('deployAntibot: slug required');
  if (!docroot) throw new Error('deployAntibot: docroot required');

  const installDir = `/opt/alp-antibot/${slug}`;
  const serviceName = `alp-antibot-${slug}`;

  onLog(`[antibot] deploying to ${installDir}`);

  // 1. Ensure Node.js is on the box (Node 22 minimum for Supabase compatibility)
  const nodeCheck = await sshExec(ssh, 'command -v node >/dev/null && node -v || echo MISSING');
  if (String(nodeCheck.stdout || '').includes('MISSING')) {
    onLog('[antibot] installing Node.js 22');
    await sshExec(ssh, 'curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null 2>&1 && apt-get install -y -qq nodejs >/dev/null 2>&1');
  }

  // 1b. Ensure nginx is on the box — the panel writes site configs into
  //     /etc/nginx/sites-available and expects sites-enabled to exist. Without
  //     nginx pre-installed, the domain-attach step would fail with cryptic
  //     "directory not found" errors.
  const nginxCheck = await sshExec(ssh, 'command -v nginx >/dev/null && echo OK || echo MISSING');
  if (String(nginxCheck.stdout || '').includes('MISSING')) {
    onLog('[antibot] installing nginx');
    await sshExec(ssh, 'apt-get update -qq >/dev/null 2>&1 && apt-get install -y -qq nginx >/dev/null 2>&1 && systemctl enable --now nginx >/dev/null 2>&1');
  }

  // 2. Create install dir + data dir
  await sshExec(ssh, `mkdir -p ${installDir}/data && chmod 755 ${installDir}`);

  // 3. Upload files (guard.js + data/cloak.html + data/datacenter-cidrs.txt)
  const files = [
    { src: 'guard.js',                  dest: `${installDir}/guard.js`,                  b64: true },
    { src: 'data/cloak.html',           dest: `${installDir}/data/cloak.html`,           b64: true },
    { src: 'data/datacenter-cidrs.txt', dest: `${installDir}/data/datacenter-cidrs.txt`, b64: true },
  ];
  for (const f of files) {
    const buf = fs.readFileSync(path.join(SRC_DIR, f.src));
    const b64 = buf.toString('base64');
    // Write via base64 to survive arbitrary bytes / quotes
    await sshExec(ssh, `echo '${b64}' | base64 -d > ${f.dest}`);
    onLog(`[antibot] uploaded ${f.src} (${buf.length} bytes)`);
  }

  // 4. Persistent secret (regen only if missing)
  const secretPath = `${installDir}/.secret`;
  await sshExec(ssh, `test -f ${secretPath} || (head -c 32 /dev/urandom | base64 -w 0 > ${secretPath} && chmod 600 ${secretPath})`);
  const secretOut = await sshExec(ssh, `cat ${secretPath}`);
  const secret = String(secretOut.stdout || '').trim();

  // 5. systemd unit
  const unit = [
    '[Unit]',
    `Description=ALP Antibot Guard (${slug})`,
    'After=network.target',
    '',
    '[Service]',
    'Type=simple',
    `Environment=ALP_SLUG=${slug}`,
    `Environment=ALP_DOCROOT=${docroot}`,
    `Environment=ALP_PORT=${port}`,
    `Environment=ALP_SECRET=${secret}`,
    panelUrl ? `Environment=ALP_PANEL_URL=${panelUrl}` : '',
    `ExecStart=/usr/bin/node ${installDir}/guard.js`,
    'Restart=always',
    'RestartSec=3',
    'User=root',
    `StandardOutput=append:/var/log/${serviceName}.log`,
    `StandardError=append:/var/log/${serviceName}.err.log`,
    '',
    '[Install]',
    'WantedBy=multi-user.target',
  ].filter(Boolean).join('\n');

  const unitB64 = Buffer.from(unit).toString('base64');
  await sshExec(ssh, `echo '${unitB64}' | base64 -d > /etc/systemd/system/${serviceName}.service`);

  // 6. Reload + start
  await sshExec(ssh, 'systemctl daemon-reload');
  await sshExec(ssh, `systemctl enable ${serviceName} >/dev/null 2>&1`);
  await sshExec(ssh, `systemctl restart ${serviceName}`);

  // 7. Health check (wait up to 5s)
  let alive = false;
  for (let i = 0; i < 5; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const h = await sshExec(ssh, `curl -sf http://127.0.0.1:${port}/__alp_health || echo FAIL`);
    if (String(h.stdout || '').includes('"ok":true')) { alive = true; break; }
  }
  if (!alive) {
    const logs = await sshExec(ssh, `journalctl -u ${serviceName} -n 30 --no-pager 2>&1 | tail -30`);
    throw new Error(`antibot service failed to start: ${logs.stdout || logs.stderr}`);
  }

  onLog(`[antibot] ✓ ${serviceName} healthy on 127.0.0.1:${port}`);
  return { port, serviceName, installDir };
}

/**
 * Build nginx location blocks that proxy real HTML requests through the
 * antibot sidecar. Static assets bypass the sidecar for speed.
 */
function buildProxyLocations(sidecarPort) {
  return [
    // Static assets — served directly from disk, no antibot overhead
    `    location ~* \\.(?:css|js|jpg|jpeg|png|gif|ico|svg|woff2?|ttf|otf|pdf)$ {`,
    `        expires 30d;`,
    `        access_log off;`,
    `        try_files $uri =404;`,
    `    }`,
    ``,
    // Everything else → antibot sidecar (which serves HTML or cloaks)
    `    location / {`,
    `        proxy_pass http://127.0.0.1:${sidecarPort};`,
    `        proxy_http_version 1.1;`,
    `        proxy_set_header Host $host;`,
    `        proxy_set_header X-Real-IP $remote_addr;`,
    `        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`,
    `        proxy_set_header X-Forwarded-Proto $scheme;`,
    `        proxy_read_timeout 30s;`,
    `    }`,
  ];
}

module.exports = { deployAntibot, buildProxyLocations };
