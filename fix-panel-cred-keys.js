// One-shot: the servers page reads settings under `deploy_ssh_pass` / `deploy_ssh_key`
// but my provision script wrote them as `panel_deploy_ssh_pass` / `_key`. Copy them
// across so the panel's own health check can SSH into itself.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

(async () => {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY, { auth: { persistSession: false } });
  const { data } = await sb.from('settings').select('key, value');
  const m = {}; (data || []).forEach(r => m[r.key] = r.value);

  const copies = [
    ['panel_deploy_ssh_pass',   'deploy_ssh_pass'],
    ['panel_deploy_ssh_key',    'deploy_ssh_key'],
    ['panel_deploy_app_dir',    'deploy_app_dir'],
    ['panel_deploy_pm2_name',   'deploy_pm2_name'],
    ['panel_deploy_git_repo',   'deploy_git_repo'],
    ['panel_deploy_git_branch', 'deploy_git_branch'],
    ['panel_deploy_auth_mode',  'deploy_auth_mode'],
  ];

  for (const [src, dst] of copies) {
    if (m[src] == null || m[src] === '') { console.log(`skip ${src} → ${dst}  (source empty)`); continue; }
    if (m[dst] === m[src])              { console.log(`ok   ${dst}                (already matches)`); continue; }
    await sb.from('settings').upsert({ key: dst, value: m[src], updated_at: new Date().toISOString() }, { onConflict: 'key' });
    console.log(`✓    ${src.padEnd(24)} → ${dst}`);
  }
  console.log('\nDone. Refresh /admin/#/vps — the panel row should turn green in a few seconds (cache is 11s).');
})();
