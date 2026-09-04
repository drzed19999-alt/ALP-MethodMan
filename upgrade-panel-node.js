// Upgrade the panel VPS from Node 20 → Node 22 LTS (Supabase realtime-js
// v2.111 requires it — otherwise every DB call throws "native WebSocket
// not found"). Then rebuild native deps and restart pm2.
//
// Uses the SSH creds saved in Supabase settings.
require('dotenv').config();
const { Client } = require('ssh2');
const { createClient } = require('@supabase/supabase-js');

(async () => {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY, { auth: { persistSession: false } });
  const { data } = await sb.from('settings').select('key, value');
  const m = {}; (data || []).forEach(r => m[r.key] = r.value);
  const host = m.panel_vps_host, user = m.panel_vps_ssh_user || 'root', port = Number(m.panel_vps_ssh_port || 22), password = m.panel_deploy_ssh_pass;
  const pm2Name = m.panel_deploy_pm2_name || 'alp';
  const appDir  = m.panel_deploy_app_dir  || '/var/www/alp';

  const c = new Client();
  c.on('error', e => { console.error('SSH error:', e.message); process.exit(2); });
  c.on('ready', () => {
    console.log(`🔑 SSH connected to ${user}@${host}\n`);
    const script = `
      set -e
      echo "── Removing Node 20 ──"
      DEBIAN_FRONTEND=noninteractive apt-get remove -yqq nodejs || true

      echo "── Installing Node 22 LTS from NodeSource ──"
      curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
      DEBIAN_FRONTEND=noninteractive apt-get install -yqq nodejs

      echo "── Verifying Node version ──"
      node --version
      npm --version

      echo "── Reinstall pm2 globally (it lives outside app deps) ──"
      npm install -g pm2 --no-fund --no-audit

      echo "── Rebuild native modules against Node 22 ──"
      cd ${appDir}
      npm rebuild --no-audit --no-fund || true

      echo "── Restart pm2 process ──"
      pm2 delete ${pm2Name} 2>/dev/null || true
      pm2 start server.js --name ${pm2Name} --update-env
      pm2 save

      echo "── Wait 5s then health-check ──"
      sleep 5
      pm2 status
      curl -sSI -m 5 http://127.0.0.1:3000 | head -1
      echo
      echo "── Last 40 log lines (should show no WebSocket errors) ──"
      pm2 logs ${pm2Name} --lines 40 --nostream 2>&1 | tail -c 6000
    `;
    // Base64-encode so bash sees real newlines regardless of how ssh2 quotes
    const b64 = Buffer.from(script, 'utf8').toString('base64');
    c.exec(`echo ${b64} | base64 -d | bash`, (err, stream) => {
      if (err) { console.error(err.message); c.end(); return; }
      stream.on('data', d => process.stdout.write(d.toString()));
      stream.stderr.on('data', d => process.stderr.write(d.toString()));
      stream.on('close', () => { console.log('\n✅ Done.'); c.end(); });
    });
  });
  c.connect({ host, port, username: user, password, readyTimeout: 12000 });
})();
