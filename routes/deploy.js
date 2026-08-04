/**
 * Deploy Route
 *
 * Provides SSH-based deployment for the admin panel and (later) individual websites.
 * Uses Server-Sent Events (SSE) to stream live step/log output to the browser.
 *
 * Routes:
 *   POST /api/deploy/panel          — start a panel deploy (git pull + pm2 restart)
 *   POST /api/deploy/panel/setup    — first-time server setup (Node, PM2, nginx, clone)
 *   GET  /api/deploy/stream?id=:id  — SSE stream for a running/completed deploy
 *   GET  /api/deploy/history        — last 20 deploy entries from audit_logs
 *   GET  /api/deploy/config         — current deploy config (keys masked)
 *   PUT  /api/deploy/config         — save deploy config to settings table
 */

const router           = require('express').Router();
const { EventEmitter } = require('events');
const jwt              = require('jsonwebtoken');
const config           = require('../config/default');
const { getAdapter }   = require('../database/adapter');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { sshConnect, sshExec, sshExecStream } = require('../services/deploy/ssh');

// All routes except /stream require standard header-based auth
router.use((req, res, next) => {
  if (req.path === '/stream') return next(); // SSE uses ?token query param
  return authenticateToken(req, res, next);
});
router.use((req, res, next) => {
  if (req.path === '/stream') return next();
  return requireRole('super_admin', 'god')(req, res, next);
});

// ─── In-memory deploy sessions ────────────────────────────────────────────────

const sessions = new Map(); // deployId → DeploySession

function createSession(type) {
  const id      = `${type}_${Date.now()}`;
  const emitter = new EventEmitter();
  const session = { id, type, status: 'running', startedAt: Date.now(), emitter, logs: [] };
  sessions.set(id, session);
  return session;
}

function sessionEmit(session, event) {
  session.logs.push(event);
  session.emitter.emit('e', event);
}

// Auto-clean finished sessions after 10 min
function scheduleCleanup(id) {
  setTimeout(() => sessions.delete(id), 10 * 60 * 1000);
}

// ─── Config helpers ───────────────────────────────────────────────────────────

function mask(val) {
  if (!val) return '';
  const s = String(val);
  if (s.length <= 8) return '••••••••';
  return s.slice(0, 4) + '••••••••' + s.slice(-4);
}

async function loadDeployCfg() {
  const db   = getAdapter();
  const rows = await db.all(
    `SELECT key, value FROM settings
     WHERE key LIKE 'panel_%' OR key LIKE 'deploy_%'`
  );
  const c = {};
  for (const r of rows) c[r.key] = r.value;
  return {
    host:      c.panel_vps_host      || process.env.PANEL_VPS_HOST || '',
    port:      c.panel_vps_ssh_port  || '22',
    user:      c.panel_vps_ssh_user  || 'root',
    authMode:  c.deploy_ssh_auth     || 'key',
    sshKey:    c.deploy_ssh_key      || '',
    sshPass:   c.deploy_ssh_pass     || '',
    gitRepo:   c.deploy_git_repo     || '',
    gitBranch: c.deploy_git_branch   || 'main',
    appDir:    c.deploy_app_dir      || '/var/www/alp',
    pm2Name:   c.deploy_pm2_name     || 'alp',
    nodePort:  c.panel_port          || '3000',
    domain:    c.panel_domain        || '',
  };
}

async function upsert(db, key, value) {
  const existing = await db.get('SELECT key FROM settings WHERE key = ?', [key]);
  if (existing) {
    await db.run('UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?', [String(value), key]);
  } else {
    await db.run('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)', [key, String(value)]);
  }
}

// ─── GET /api/deploy/config ───────────────────────────────────────────────────

router.get('/config', async (req, res) => {
  try {
    const cfg = await loadDeployCfg();
    res.json({
      auth_mode:  cfg.authMode,
      has_key:    !!(cfg.sshKey),
      has_pass:   !!(cfg.sshPass),
      key_hint:   cfg.sshKey ? mask(cfg.sshKey) : '',
      git_repo:   cfg.gitRepo,
      git_branch: cfg.gitBranch,
      app_dir:    cfg.appDir,
      pm2_name:   cfg.pm2Name,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/deploy/config ───────────────────────────────────────────────────

router.put('/config', async (req, res) => {
  try {
    const db   = getAdapter();
    const body = req.body || {};
    const updates = {};

    if (body.auth_mode  !== undefined) updates.deploy_ssh_auth   = body.auth_mode;
    if (body.ssh_key    && body.ssh_key.trim())  updates.deploy_ssh_key  = body.ssh_key.trim();
    if (body.ssh_pass   && body.ssh_pass.trim()) updates.deploy_ssh_pass = body.ssh_pass.trim();
    if (body.git_repo   !== undefined) updates.deploy_git_repo   = body.git_repo;
    if (body.git_branch !== undefined) updates.deploy_git_branch = body.git_branch  || 'main';
    if (body.app_dir    !== undefined) updates.deploy_app_dir    = body.app_dir     || '/var/www/alp';
    if (body.pm2_name   !== undefined) updates.deploy_pm2_name   = body.pm2_name    || 'alp';

    if (Object.keys(updates).length === 0) return res.json({ ok: true, updated: [] });

    for (const [key, value] of Object.entries(updates)) await upsert(db, key, value);

    try {
      const safe = { ...updates };
      if (safe.deploy_ssh_key)  safe.deploy_ssh_key  = '[redacted]';
      if (safe.deploy_ssh_pass) safe.deploy_ssh_pass = '[redacted]';
      await db.run(
        `INSERT INTO audit_logs (user_id, username, action, category, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)`,
        [req.user.id, req.user.username, 'Updated deploy config', 'deploy', JSON.stringify(safe), req.ip]
      );
    } catch {}

    res.json({ ok: true, updated: Object.keys(updates) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/deploy/stream?id=:id&token=:jwt ────────────────────────────────
// EventSource cannot send custom headers, so auth falls back to ?token query param.

router.get('/stream', (req, res) => {
  // Verify JWT from ?token query param (EventSource can't send headers)
  try {
    const token = req.query.token;
    if (!token) { res.status(401).end(); return; }
    const decoded = jwt.verify(token, config.jwt.secret);
    if (!decoded) { res.status(401).end(); return; }
    const role = decoded.role;
    if (role !== 'super_admin' && role !== 'god') { res.status(403).end(); return; }
  } catch { res.status(401).end(); return; }

  const session = sessions.get(req.query.id);

  res.setHeader('Content-Type',   'text/event-stream');
  res.setHeader('Cache-Control',  'no-cache');
  res.setHeader('Connection',     'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (evt) => res.write(`data: ${JSON.stringify(evt)}\n\n`);

  if (!session) { send({ type: 'error', message: 'Deploy session not found' }); return res.end(); }

  // Replay buffered events
  session.logs.forEach(send);

  if (session.status !== 'running') return res.end();

  const onEvent = (evt) => { send(evt); if (evt.type === 'done') res.end(); };
  session.emitter.on('e', onEvent);
  req.on('close', () => session.emitter.off('e', onEvent));
});

// ─── GET /api/deploy/env ─────────────────────────────────────────────────────

router.get('/env', async (req, res) => {
  try {
    const db   = getAdapter();
    const rows = await db.all(`SELECT key, value FROM settings WHERE key LIKE 'deploy_env_%' ORDER BY key`);
    const vars = rows.map(r => ({ key: r.key.replace(/^deploy_env_/, ''), value: r.value || '' }));
    res.json({ vars });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/deploy/env ──────────────────────────────────────────────────────

router.put('/env', async (req, res) => {
  try {
    const db   = getAdapter();
    const vars = req.body.vars || [];
    await db.run(`DELETE FROM settings WHERE key LIKE 'deploy_env_%'`);
    for (const { key, value } of vars) {
      if (!key || !key.trim()) continue;
      const k = key.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
      await upsert(db, `deploy_env_${k}`, value || '');
    }
    try {
      await db.run(
        `INSERT INTO audit_logs (user_id, username, action, category, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)`,
        [req.user.id, req.user.username, 'Updated env vars', 'deploy', JSON.stringify({ count: vars.length }), req.ip]
      );
    } catch {}
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/deploy/history ──────────────────────────────────────────────────

router.get('/history', async (req, res) => {
  try {
    const db   = getAdapter();
    const rows = await db.all(
      `SELECT id, username, action, details, created_at
       FROM audit_logs WHERE category = 'deploy'
       ORDER BY created_at DESC LIMIT 20`
    );
    res.json({ history: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/deploy/panel ───────────────────────────────────────────────────

router.post('/panel', async (req, res) => {
  const session = createSession('deploy');
  res.json({ ok: true, deployId: session.id });
  runDeploy(session, req.user).catch(() => {});
});

// ─── POST /api/deploy/panel/setup ────────────────────────────────────────────

router.post('/panel/setup', async (req, res) => {
  const session = createSession('setup');
  res.json({ ok: true, deployId: session.id });
  runSetup(session, req.user).catch(() => {});
});

// ─── Deploy runner ────────────────────────────────────────────────────────────

async function runDeploy(session, user) {
  const emit = (evt) => sessionEmit(session, evt);
  let client;
  let stepN = 0;

  const step  = (label)            => { stepN++; emit({ type: 'step', id: stepN, label, status: 'running' }); return stepN; };
  const done  = (id, st = 'done') =>  emit({ type: 'step', id, status: st });
  const log   = (line, lvl = 'info') => emit({ type: 'log', line: String(line).trim(), level: lvl });

  try {
    const cfg = await loadDeployCfg();
    if (!cfg.host)    throw new Error('VPS host not configured — set it in Panel Config → Panel VPS.');
    if (!cfg.gitRepo) throw new Error('Git repository URL not configured — set it in Panel Config → Deployment.');
    if (cfg.authMode === 'key'  && !cfg.sshKey)  throw new Error('SSH key not configured.');
    if (cfg.authMode === 'password' && !cfg.sshPass) throw new Error('SSH password not configured.');

    // ── 1. Connect
    const s1 = step('Connecting to server');
    log(`→ SSH ${cfg.user}@${cfg.host}:${cfg.port}`);
    client = await sshConnect({
      host: cfg.host, port: cfg.port, username: cfg.user,
      privateKey: cfg.authMode === 'key' ? cfg.sshKey : undefined,
      password:   cfg.authMode === 'password' ? cfg.sshPass : undefined,
    });
    log(`Connected`, 'success'); done(s1);

    // ── 2. Node.js check
    const s2 = step('Verifying Node.js');
    const nodeVer = await sshExec(client, 'node --version 2>&1');
    if (nodeVer.code !== 0) { done(s2, 'error'); throw new Error('Node.js not found — run Server Setup first.'); }
    log(nodeVer.stdout.trim(), 'success'); done(s2);

    // ── 3. PM2 check
    const s3 = step('Verifying PM2');
    const pm2Ver = await sshExec(client, 'pm2 --version 2>&1');
    if (pm2Ver.code !== 0) { done(s3, 'error'); throw new Error('PM2 not found — run Server Setup first.'); }
    log(`PM2 v${pm2Ver.stdout.trim()}`, 'success'); done(s3);

    // ── 4. Pull code
    const s4  = step('Pulling latest code');
    const gitCheck = await sshExec(client, `test -d ${cfg.appDir}/.git && echo yes || echo no`);
    if (gitCheck.stdout.trim() === 'no') {
      log(`Directory not found — cloning ${cfg.gitRepo}...`);
      const code = await sshExecStream(client, `git clone --branch ${cfg.gitBranch} ${cfg.gitRepo} ${cfg.appDir} 2>&1`, log);
      if (code !== 0) { done(s4, 'error'); throw new Error('git clone failed — check repo URL and credentials.'); }
    } else {
      log(`git pull origin ${cfg.gitBranch}...`);
      const code = await sshExecStream(client, `cd ${cfg.appDir} && git fetch origin && git reset --hard origin/${cfg.gitBranch} 2>&1`, log);
      if (code !== 0) { done(s4, 'error'); throw new Error('git pull failed.'); }
    }
    done(s4);

    // ── 5. npm install
    const s5 = step('Installing dependencies');
    const npmCode = await sshExecStream(client, `cd ${cfg.appDir} && npm install --production --no-audit 2>&1`, log);
    if (npmCode !== 0) { done(s5, 'error'); throw new Error('npm install failed.'); }
    done(s5);

    // ── 6. Restart PM2
    const s6 = step(`Restarting "${cfg.pm2Name}" via PM2`);
    const pm2Status = await sshExec(client, `pm2 describe ${cfg.pm2Name} 2>&1`);
    if (pm2Status.stdout.includes('status') && !pm2Status.stdout.includes('errored')) {
      await sshExecStream(client, `pm2 restart ${cfg.pm2Name} 2>&1`, log);
    } else {
      await sshExecStream(client, `cd ${cfg.appDir} && PORT=${cfg.nodePort} pm2 start server.js --name ${cfg.pm2Name} 2>&1`, log);
    }
    await sshExec(client, 'pm2 save 2>&1');
    done(s6);

    // ── 7. Health check
    const s7 = step('Verifying process health');
    await new Promise(r => setTimeout(r, 2500));
    const health = await sshExec(client, `pm2 show ${cfg.pm2Name} --no-color 2>&1`);
    if (health.stdout.includes('online')) {
      log('Process is online ✓', 'success'); done(s7);
    } else {
      log('Process status unclear — check pm2 logs', 'warning'); done(s7, 'warning');
    }

    client.end();
    session.status = 'success';
    const duration = ((Date.now() - session.startedAt) / 1000).toFixed(1);
    emit({ type: 'done', success: true, duration: parseFloat(duration) });
    await logDeploy(user, 'Panel deployed', { gitBranch: cfg.gitBranch, appDir: cfg.appDir, duration: `${duration}s` });

  } catch (err) {
    log(`✗  ${err.message}`, 'error');
    session.status = 'failed';
    emit({ type: 'done', success: false });
    if (client) try { client.end(); } catch {}
    await logDeploy(user, 'Panel deploy FAILED', { error: err.message }).catch(() => {});
  }

  scheduleCleanup(session.id);
}

// ─── Setup runner ─────────────────────────────────────────────────────────────

async function runSetup(session, user) {
  const emit = (evt) => sessionEmit(session, evt);
  let client;
  let stepN = 0;

  const step = (label)              => { stepN++; emit({ type: 'step', id: stepN, label, status: 'running' }); return stepN; };
  const done = (id, st = 'done')    => emit({ type: 'step', id, status: st });
  const log  = (line, lvl = 'info') => emit({ type: 'log', line: String(line).trim(), level: lvl });

  const run = async (sid, cmd, opts = {}) => {
    const code = await sshExecStream(client, cmd, (line, ch) => {
      if (line.trim()) log(line, ch === 'stderr' && !opts.noStderr ? 'warn' : 'info');
    });
    if (code !== 0 && !opts.allowFail) { done(sid, 'error'); throw new Error(`Command failed (exit ${code}): ${cmd.slice(0, 60)}`); }
    done(sid);
    return code;
  };

  try {
    const cfg = await loadDeployCfg();
    if (!cfg.host)    throw new Error('VPS host not configured.');
    if (!cfg.gitRepo) throw new Error('Git repository URL not configured.');

    // ── 1. Connect
    const s1 = step('Connecting to server');
    log(`→ SSH ${cfg.user}@${cfg.host}:${cfg.port}`);
    client = await sshConnect({
      host: cfg.host, port: cfg.port, username: cfg.user,
      privateKey: cfg.authMode === 'key' ? cfg.sshKey : undefined,
      password:   cfg.authMode === 'password' ? cfg.sshPass : undefined,
    });
    log('Connected', 'success'); done(s1);

    // ── 2. Gather system info
    const s2 = step('Gathering system information');
    const sysInfo = {};
    const gather = async (key, cmd) => {
      const r = await sshExec(client, cmd);
      sysInfo[key] = (r.code === 0 ? r.stdout : '').trim();
    };
    await gather('os',       'cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 | tr -d \'"\'');
    await gather('kernel',   'uname -r');
    await gather('arch',     'uname -m');
    await gather('hostname', 'hostname');
    await gather('cpu',      'grep "model name" /proc/cpuinfo | head -1 | cut -d: -f2');
    await gather('cores',    'nproc');
    await gather('ram',      'free -h | grep Mem | awk \'{print $2}\'');
    await gather('disk',     'df -h / | tail -1 | awk \'{print $2 " total, " $4 " free"}\'');
    await gather('ip',       'hostname -I | awk \'{print $1}\'');
    await gather('uptime',   'uptime -p 2>/dev/null || uptime');
    log(`OS: ${sysInfo.os || 'unknown'}`, 'success');
    log(`Kernel: ${sysInfo.kernel} (${sysInfo.arch})`);
    log(`CPU: ${(sysInfo.cpu || 'unknown').trim()} × ${sysInfo.cores} cores`);
    log(`RAM: ${sysInfo.ram} · Disk: ${sysInfo.disk}`);
    log(`IP: ${sysInfo.ip} · Host: ${sysInfo.hostname}`);
    try {
      const db = getAdapter();
      await upsert(db, 'server_info', JSON.stringify(sysInfo));
    } catch {}
    done(s2);

    // ── 3. System update
    const s3 = step('Updating system packages (apt update)');
    await run(s3, 'export DEBIAN_FRONTEND=noninteractive && apt-get update -qq 2>&1');

    // ── 4. Install prerequisites
    const s4 = step('Installing git, curl, build-essential');
    await run(s4, 'apt-get install -y -qq git curl build-essential 2>&1');

    // ── 5. Node.js (v22 required for Supabase realtime WebSocket)
    const s5 = step('Installing Node.js 22 LTS');
    const nodeOk = await sshExec(client, 'node --version 2>/dev/null');
    const currentMajor = nodeOk.code === 0 ? parseInt((nodeOk.stdout.match(/v(\d+)/) || [])[1] || '0', 10) : 0;
    if (currentMajor >= 22) {
      log(`Already installed: ${nodeOk.stdout.trim()}`, 'success'); done(s5);
    } else {
      if (currentMajor > 0) log(`Upgrading from ${nodeOk.stdout.trim()} → v22 LTS`);
      await run(s5, 'curl -fsSL https://deb.nodesource.com/setup_22.x | bash - 2>&1 && DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs 2>&1');
    }
    sysInfo.node = (await sshExec(client, 'node --version 2>/dev/null')).stdout.trim();

    // ── 6. PM2
    const s6 = step('Installing PM2');
    const pm2Ok = await sshExec(client, 'pm2 --version 2>/dev/null');
    if (pm2Ok.code === 0) {
      log(`Already installed: v${pm2Ok.stdout.trim()}`, 'success'); done(s6);
    } else {
      await run(s6, 'npm install -g pm2 2>&1');
    }
    sysInfo.pm2 = (await sshExec(client, 'pm2 --version 2>/dev/null')).stdout.trim();

    // ── 7. nginx
    const s7 = step('Installing nginx');
    const ngOk = await sshExec(client, 'nginx -v 2>&1');
    if (ngOk.code === 0 || ngOk.stderr.includes('nginx')) {
      log('Already installed', 'success'); done(s7);
    } else {
      await run(s7, 'apt-get install -y -qq nginx 2>&1');
    }
    sysInfo.nginx = ((await sshExec(client, 'nginx -v 2>&1')).stderr || '').replace('nginx version: ', '').trim();

    // ── 8. Clone / pull repo
    const s8 = step(`Deploying repo to ${cfg.appDir}`);
    const dirOk = await sshExec(client, `test -d ${cfg.appDir}/.git && echo yes || echo no`);
    if (dirOk.stdout.trim() === 'yes') {
      log('Repo exists — pulling latest...');
      await sshExecStream(client, `cd ${cfg.appDir} && git fetch origin && git reset --hard origin/${cfg.gitBranch} 2>&1`, log);
      done(s8);
    } else {
      await run(s8, `git clone --branch ${cfg.gitBranch} ${cfg.gitRepo} ${cfg.appDir} 2>&1`);
    }

    // ── 9. npm install
    const s9 = step('Installing Node.js dependencies');
    await run(s9, `cd ${cfg.appDir} && npm install --production --no-audit 2>&1`);

    // ── 10. Write .env file
    const s10 = step('Writing .env file');
    try {
      const envDb   = getAdapter();
      const envRows = await envDb.all(`SELECT key, value FROM settings WHERE key LIKE 'deploy_env_%' ORDER BY key`);
      if (envRows.length > 0) {
        const envContent = envRows.map(r => {
          const k = r.key.replace(/^deploy_env_/, '');
          const v = String(r.value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          return `${k}="${v}"`;
        }).join('\n');
        const b64env = Buffer.from(envContent + '\n').toString('base64');
        await sshExec(client, `echo '${b64env}' | base64 -d > ${cfg.appDir}/.env`);
        log(`.env written (${envRows.length} variable${envRows.length === 1 ? '' : 's'})`, 'success');
      } else {
        log('No env vars configured — skipping .env', 'warn');
      }
      done(s10);
    } catch (envErr) {
      log(`Warning: could not write .env — ${envErr.message}`, 'warn');
      done(s10, 'warning');
    }

    // ── 11. Start PM2
    const s11 = step(`Starting "${cfg.pm2Name}" with PM2`);
    const pm2Run = await sshExec(client, `pm2 describe ${cfg.pm2Name} 2>&1`);
    if (pm2Run.stdout.includes('online') || pm2Run.stdout.includes('stopped')) {
      await run(s11, `pm2 restart ${cfg.pm2Name} 2>&1`);
    } else {
      await run(s11, `cd ${cfg.appDir} && PORT=${cfg.nodePort} pm2 start server.js --name ${cfg.pm2Name} --env production 2>&1`);
    }

    // ── 12. PM2 startup
    const s12 = step('Configuring PM2 auto-start on reboot');
    const startupOut = await sshExec(client, 'pm2 startup systemd -u root --hp /root 2>&1');
    const startupCmd = (startupOut.stdout + startupOut.stderr).match(/sudo (env .+|systemctl .+)/);
    if (startupCmd) {
      await sshExec(client, startupCmd[0].replace(/^sudo /, ''));
    }
    await sshExec(client, 'pm2 save 2>&1');
    done(s12);

    // ── 13. nginx config
    const s13 = step('Writing nginx reverse-proxy config');
    const domain = cfg.domain || '_';
    const nginxConf = [
      'server {',
      '    listen 80;',
      `    server_name ${domain};`,
      '    location / {',
      `        proxy_pass http://127.0.0.1:${cfg.nodePort};`,
      '        proxy_http_version 1.1;',
      '        proxy_set_header Upgrade $http_upgrade;',
      '        proxy_set_header Connection "upgrade";',
      '        proxy_set_header Host $host;',
      '        proxy_set_header X-Real-IP $remote_addr;',
      '        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
      '        proxy_cache_bypass $http_upgrade;',
      '        client_max_body_size 50M;',
      '    }',
      '}',
    ].join('\n');

    const b64 = Buffer.from(nginxConf).toString('base64');
    await sshExec(client, `echo '${b64}' | base64 -d > /etc/nginx/sites-available/alp`);
    await sshExec(client, 'ln -sf /etc/nginx/sites-available/alp /etc/nginx/sites-enabled/alp');
    await sshExec(client, 'rm -f /etc/nginx/sites-enabled/default');
    const ngTest = await sshExec(client, 'nginx -t 2>&1');
    if (ngTest.code === 0) {
      await sshExec(client, 'systemctl reload nginx 2>&1');
      log('nginx configured ✓', 'success'); done(s13);
    } else {
      log(`nginx config warning: ${ngTest.stdout}`, 'warning'); done(s13, 'warning');
    }

    // ── 14. Firewall
    const s14 = step('Opening firewall ports (ufw)');
    const ufwOk = await sshExec(client, 'which ufw 2>/dev/null');
    if (ufwOk.code === 0) {
      await sshExec(client, 'ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable 2>&1');
      log('Ports 22, 80, 443 open', 'success'); done(s14);
    } else {
      log('ufw not found — skipping firewall config', 'warn'); done(s14, 'warning');
    }

    // Save final server profile
    try {
      const db = getAdapter();
      await upsert(db, 'server_info', JSON.stringify(sysInfo));
    } catch {}

    client.end();
    session.status = 'success';
    const duration = ((Date.now() - session.startedAt) / 1000).toFixed(1);
    emit({ type: 'done', success: true, duration: parseFloat(duration) });
    await logDeploy(user, 'Panel setup completed', {
      host: cfg.host, duration: `${duration}s`,
      os: sysInfo.os, node: sysInfo.node, pm2: sysInfo.pm2, nginx: sysInfo.nginx,
      ram: sysInfo.ram, cpu: (sysInfo.cpu || '').trim(), cores: sysInfo.cores, disk: sysInfo.disk,
    });

  } catch (err) {
    log(`✗  ${err.message}`, 'error');
    session.status = 'failed';
    emit({ type: 'done', success: false });
    if (client) try { client.end(); } catch {}
    await logDeploy(user, 'Panel setup FAILED', { error: err.message }).catch(() => {});
  }

  scheduleCleanup(session.id);
}

// ─── Audit log helper ─────────────────────────────────────────────────────────

async function logDeploy(user, action, details) {
  const db = getAdapter();
  await db.run(
    `INSERT INTO audit_logs (user_id, username, action, category, details, ip_address)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [user.id, user.username, action, 'deploy', JSON.stringify(details), '127.0.0.1']
  );
}

router._sessions = sessions;
module.exports = router;
