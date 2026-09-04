// Read pm2 logs from the panel VPS so we can see WHY /api/auth/login is 500.
// Uses the SSH creds we just persisted to Supabase.
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
  c.on('ready', () => {
    const cmd = `pm2 logs ${pm2Name} --lines 120 --nostream 2>&1 | tail -c 12000; echo "\\n── /var/log/nginx/error.log tail ──"; tail -n 30 /var/log/nginx/error.log 2>/dev/null; echo "\\n── env sanity ──"; grep -c '^SUPABASE_URL' ${appDir}/.env; echo "\\n── pm2 jlist status ──"; pm2 jlist | node -e "let d='';process.stdin.on('data',x=>d+=x).on('end',()=>{const j=JSON.parse(d);j.forEach(p=>console.log(p.name,p.pm2_env.status,'restarts='+p.pm2_env.restart_time))})"`;
    c.exec(cmd, (err, stream) => {
      if (err) { console.error(err.message); c.end(); return; }
      stream.on('data', d => process.stdout.write(d.toString()));
      stream.stderr.on('data', d => process.stderr.write(d.toString()));
      stream.on('close', () => c.end());
    });
  }).on('error', e => { console.error('SSH failed:', e.message); process.exit(2); });
  c.connect({ host, port, username: user, password, readyTimeout: 10000 });
})();
