// One-shot diagnostic: pulls panel-VPS host + SSH creds + god emails from
// Supabase so we can SSH into the panel to fix the 502.
// Run from the project root:  node find-panel-vps.js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

(async () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_KEY in .env');
    process.exit(1);
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  // ── Settings (panel host, ports, deploy config) ────────────────────────
  const { data: settings } = await sb.from('settings').select('key, value');
  const map = {};
  (settings || []).forEach(r => { map[r.key] = r.value; });

  const wanted = [
    'panel_vps_host', 'panel_vps_ssh_port', 'panel_vps_ssh_user',
    'panel_domain', 'panel_port', 'panel_ssl',
    'panel_deploy_git_repo', 'panel_deploy_git_branch',
    'panel_deploy_app_dir', 'panel_deploy_pm2_name',
    'panel_deploy_auth_mode',
  ];

  console.log('\n── PANEL VPS (from settings) ─────────────────────────');
  for (const k of wanted) {
    if (map[k] !== undefined && map[k] !== null && map[k] !== '') {
      console.log(`  ${k.padEnd(28)} = ${map[k]}`);
    }
  }
  const hasKey  = !!map.panel_deploy_ssh_key;
  const hasPass = !!map.panel_deploy_ssh_pass;
  console.log(`  SSH auth material stored     = ${hasKey ? 'PRIVATE KEY' : hasPass ? 'PASSWORD' : 'NONE'}`);

  // ── VPS registry (all VPSes this account owns) ─────────────────────────
  console.log('\n── VPS registry ──────────────────────────────────────');
  const { data: vpses } = await sb.from('vpses')
    .select('id, owner_id, host, ssh_user, ssh_port, label, ssh_pass, ssh_key, created_at')
    .order('id');
  (vpses || []).forEach(v => {
    const auth = v.ssh_key ? 'key' : v.ssh_pass ? 'pass' : 'none';
    console.log(`  #${v.id}  ${v.host}:${v.ssh_port || 22}  user=${v.ssh_user || 'root'}  auth=${auth}  ${v.label ? '"'+v.label+'"' : ''}`);
  });

  // ── God accounts (email → provider guess) ──────────────────────────────
  console.log('\n── God accounts ──────────────────────────────────────');
  const { data: users } = await sb.from('users')
    .select('id, username, email, role, last_login')
    .eq('role', 'god');
  (users || []).forEach(u => {
    console.log(`  #${u.id}  ${u.username}  <${u.email || '(no email)'}>  last_login=${u.last_login || 'never'}`);
  });

  // ── Print the panel SSH password if it's stored ────────────────────────
  if (hasPass) {
    console.log('\n── Panel SSH password (from settings) ────────────────');
    console.log(`  panel_deploy_ssh_pass = ${map.panel_deploy_ssh_pass}`);
  }
  if (hasKey) {
    console.log('\n── Panel SSH key is stored (not printed here).');
  }

  console.log('\nNext: ssh <ssh_user>@<panel_vps_host> -p <ssh_port>');
  console.log('     then: pm2 status && pm2 logs alp --lines 80 --nostream\n');
})();
