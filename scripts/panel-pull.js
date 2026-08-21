#!/usr/bin/env node
/**
 * Panel VPS git-pull helper.
 * SSH into the panel VPS using creds from settings, then run
 *   git fetch origin && git reset --hard origin/<branch>
 * Same command the /api/deploy/panel route runs for step 4.
 *
 * Usage: node scripts/panel-pull.js
 */

const path = require('path');
const Database = require('better-sqlite3');
const { Client } = require('ssh2');

const dbPath = path.resolve(__dirname, '..', 'database', 'alp.db');
const db = new Database(dbPath, { readonly: true });

const rows = db.prepare(
  "SELECT key, value FROM settings WHERE key LIKE 'panel_%' OR key LIKE 'deploy_%'"
).all();
db.close();

const c = {};
for (const r of rows) c[r.key] = r.value;

const cfg = {
  host:      c.panel_vps_host      || '',
  port:      parseInt(c.panel_vps_ssh_port || '22', 10),
  user:      c.panel_vps_ssh_user  || 'root',
  authMode:  c.deploy_ssh_auth     || 'key',
  sshKey:    c.deploy_ssh_key      || '',
  sshPass:   c.deploy_ssh_pass     || '',
  gitBranch: c.deploy_git_branch   || 'main',
  appDir:    c.deploy_app_dir      || '/var/www/alp',
};

console.log(`[cfg] host=${cfg.host} port=${cfg.port} user=${cfg.user} authMode=${cfg.authMode} appDir=${cfg.appDir} branch=${cfg.gitBranch}`);
if (!cfg.host)                                            { console.error('No panel_vps_host in settings'); process.exit(1); }
if (cfg.authMode === 'key' && !cfg.sshKey)                { console.error('deploy_ssh_key missing');       process.exit(1); }
if (cfg.authMode === 'password' && !cfg.sshPass)          { console.error('deploy_ssh_pass missing');      process.exit(1); }

const auth = {
  host: cfg.host,
  port: cfg.port,
  username: cfg.user,
  readyTimeout: 20000,
  keepaliveInterval: 5000,
};
if (cfg.authMode === 'key') auth.privateKey = cfg.sshKey;
else                        auth.password   = cfg.sshPass;

const client = new Client();

function exec(cmd) {
  return new Promise((resolve, reject) => {
    client.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '', errOut = '';
      stream.on('data',        d => { const s = String(d); out    += s; process.stdout.write(s); });
      stream.stderr.on('data', d => { const s = String(d); errOut += s; process.stderr.write(s); });
      stream.on('close', code => resolve({ code, stdout: out, stderr: errOut }));
    });
  });
}

client.on('ready', async () => {
  console.log('\n[ssh] connected — running git pull');
  try {
    const cmd = `cd ${cfg.appDir} && git fetch origin && git reset --hard origin/${cfg.gitBranch} && git log -1 --oneline`;
    console.log(`[cmd] ${cmd}\n`);
    const r = await exec(cmd);
    console.log(`\n[exit] ${r.code}`);
    client.end();
    process.exit(r.code === 0 ? 0 : 2);
  } catch (err) {
    console.error('\n[error]', err.message);
    client.end();
    process.exit(3);
  }
});
client.on('error', err => { console.error('[ssh error]', err.message); process.exit(4); });
client.connect(auth);
