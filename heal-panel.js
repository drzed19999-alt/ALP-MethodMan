// One-shot panel-VPS rescue.
//
// Reads panel host + every stored SSH password from Supabase, tries each
// against 186.240.151.94 with user=root, then runs an escalating recipe
// until the panel is back:
//
//   1.  pm2 restart <pm2_name>
//   2.  cd <app_dir> && pm2 restart <pm2_name>
//   3.  cd <app_dir> && git pull && pm2 restart <pm2_name>
//   4.  cd <app_dir> && git pull && npm install --production && pm2 restart <pm2_name>
//
// Stops as soon as `pm2 status` reports the app online, then tails the last
// 40 log lines so you can see what crashed originally.
//
// Usage:  node heal-panel.js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { Client } = require('ssh2');

const HOST_OVERRIDE = process.env.PANEL_HOST || null;
const USER_OVERRIDE = process.env.PANEL_USER || null;

(async () => {
  const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
    { auth: { persistSession: false } }
  );

  // ── Look up panel host + deploy config ────────────────────────────────
  const { data: settings } = await sb.from('settings').select('key, value');
  const map = {}; (settings || []).forEach(r => { map[r.key] = r.value; });

  const host    = HOST_OVERRIDE || map.panel_vps_host;
  const port    = Number(map.panel_vps_ssh_port || 22);
  const user    = USER_OVERRIDE || map.panel_vps_ssh_user || 'root';
  const appDir  = map.panel_deploy_app_dir  || '/var/www/alp';
  const pm2Name = map.panel_deploy_pm2_name || 'alp';
  const savedPass = map.panel_deploy_ssh_pass || null;
  const savedKey  = map.panel_deploy_ssh_key  || null;

  if (!host) { console.error('❌ panel_vps_host is not set in settings'); process.exit(1); }
  console.log(`\n🎯 Target: ${user}@${host}:${port}`);
  console.log(`   App dir: ${appDir}   pm2 name: ${pm2Name}`);

  // ── Collect every SSH password we know about ──────────────────────────
  const pwSet = new Set();
  if (savedPass) pwSet.add(savedPass);
  const { data: vpses } = await sb.from('vpses').select('ssh_pass');
  (vpses || []).forEach(v => { if (v.ssh_pass) pwSet.add(v.ssh_pass); });
  const passwords = [...pwSet];
  console.log(`   Trying ${passwords.length} unique password(s)${savedKey ? ' + saved key' : ''}\n`);

  // ── Connect helper — crash-proof. ssh2 emits an 'error' after readyTimeout
  // that must be swallowed even after we resolve; a bare Client with no
  // error listener crashes Node.  We also cap our own timeout so the SSH
  // server can't drag us with a slow-drip handshake, and always call end()
  // on the client after a rejection so the socket dies immediately.
  async function tryConnect(auth) {
    return new Promise((resolve) => {
      const c = new Client();
      let settled = false;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        // Attach a permanent no-op listener so any post-settle 'error' is not
        // treated as unhandled (which would crash Node).
        c.on('error', () => {});
        if (!ok) { try { c.end(); } catch {} }
        resolve(ok ? c : null);
      };
      c.on('ready', () => finish(true));
      c.on('error', () => finish(false));
      const opts = { host, port, username: user, readyTimeout: 9000, tryKeyboard: false };
      if (auth.key)  opts.privateKey = auth.key;
      if (auth.pass) opts.password   = auth.pass;
      try { c.connect(opts); } catch { finish(false); }
      // Belt-and-suspenders wall-clock timeout in case ssh2 hangs
      setTimeout(() => finish(false), 11000);
    });
  }

  const pause = (ms) => new Promise(r => setTimeout(r, ms));

  let ssh = null, winningLabel = '';
  if (savedKey) {
    process.stdout.write(`  → trying saved private key ... `);
    ssh = await tryConnect({ key: savedKey });
    console.log(ssh ? '✓' : '✗');
    if (ssh) winningLabel = 'saved key';
  }
  if (!ssh) {
    for (const pw of passwords) {
      const masked = pw.slice(0, 2) + '***' + pw.slice(-2) + ` (${pw.length}ch)`;
      process.stdout.write(`  → trying password ${masked} ... `);
      ssh = await tryConnect({ pass: pw });
      console.log(ssh ? '✓ WORKS' : '✗');
      if (ssh) { winningLabel = `password ${masked}`; break; }
      // Small backoff so sshd doesn't rate-limit us
      await pause(800);
    }
  }

  if (!ssh) {
    console.error('\n❌ None of the stored credentials worked on the panel VPS.');
    console.error('   Reset the root password via your provider\'s web console,');
    console.error('   then re-run.  IP 186.240.x.x is Brazilian — check Locaweb /');
    console.error('   HostDime BR / UOL Host / KingHost dashboards.');
    process.exit(2);
  }

  console.log(`\n🔑 Connected via ${winningLabel}\n`);

  // ── Exec helper ───────────────────────────────────────────────────────
  function run(cmd, { silent = false } = {}) {
    return new Promise((resolve) => {
      if (!silent) console.log(`$ ${cmd}`);
      ssh.exec(cmd, (err, stream) => {
        if (err) return resolve({ code: -1, out: '', err: err.message });
        let out = '', errOut = '';
        stream.on('close', (code) => resolve({ code, out, err: errOut }))
              .on('data', d => { const s = d.toString(); out += s; if (!silent) process.stdout.write(s); })
              .stderr.on('data', d => { const s = d.toString(); errOut += s; if (!silent) process.stderr.write(s); });
      });
    });
  }

  // ── Diagnose current state ────────────────────────────────────────────
  console.log('── Current pm2 state ─────────────────────────────────────');
  await run(`pm2 jlist | head -c 4000`);

  // ── Escalating recipe ─────────────────────────────────────────────────
  const steps = [
    `pm2 restart ${pm2Name} --update-env`,
    `cd ${appDir} && pm2 restart ${pm2Name} --update-env`,
    `cd ${appDir} && git pull --ff-only && pm2 restart ${pm2Name} --update-env`,
    `cd ${appDir} && git pull --ff-only && npm install --production --no-audit --no-fund && pm2 restart ${pm2Name} --update-env`,
  ];

  let healed = false;
  for (const step of steps) {
    console.log(`\n── Trying: ${step}`);
    await run(step);
    // Wait a beat for pm2 to settle, then check
    await new Promise(r => setTimeout(r, 3000));
    const status = await run(`pm2 jlist`, { silent: true });
    const online = /"status"\s*:\s*"online"/.test(status.out) && /"name"\s*:\s*"${pm2Name}"/.test(status.out.replace('${pm2Name}', pm2Name));
    // Simpler: grep for our app being online
    const appOnline = status.out.includes(`"name":"${pm2Name}"`) && status.out.includes(`"status":"online"`);
    if (appOnline) { healed = true; console.log(`\n✅ pm2 reports ${pm2Name} online after: ${step}`); break; }
    console.log(`  … still not online, escalating.`);
  }

  console.log('\n── Last 40 pm2 log lines (why it crashed) ───────────────');
  await run(`pm2 logs ${pm2Name} --lines 40 --nostream 2>&1 | tail -c 8000`);

  if (healed) {
    console.log('\n🎉 Panel restarted. Open https://outlwas.online/admin/ to verify.');
  } else {
    console.log('\n⚠️  Escalation exhausted. Read the log lines above to see what is still failing.');
  }

  ssh.end();
})().catch(err => { console.error('Fatal:', err); process.exit(1); });
