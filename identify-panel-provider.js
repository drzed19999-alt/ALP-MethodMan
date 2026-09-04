// Identify the panel VPS provider by IP, and surface every SSH key we could
// possibly try (local ~/.ssh + Supabase settings + vpses registry).
// Read-only.
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const https = require('https');
const { createClient } = require('@supabase/supabase-js');

const IP = '186.240.151.94';

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'alp-diag/1.0' } }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

(async () => {
  console.log(`\n── IP → provider lookup for ${IP} ────────────────────`);
  try {
    // ip-api.com — no auth, gives ISP/org/AS + country/city
    const r = await get(`https://ip-api.com/json/${IP}?fields=status,country,city,isp,org,as,asname,reverse`);
    const j = JSON.parse(r.body);
    console.log(`  country : ${j.country}${j.city ? ' / ' + j.city : ''}`);
    console.log(`  ISP     : ${j.isp}`);
    console.log(`  Org     : ${j.org}`);
    console.log(`  AS      : ${j.as}  (${j.asname})`);
    console.log(`  rDNS    : ${j.reverse || '(none)'}`);
  } catch (e) {
    console.log(`  ip-api failed: ${e.message}`);
  }
  try {
    // ipinfo.io — different data source; sometimes surfaces hosting-provider tag
    const r = await get(`https://ipinfo.io/${IP}/json`);
    const j = JSON.parse(r.body);
    console.log(`  ipinfo  : ${j.org}${j.hostname ? '  · ' + j.hostname : ''}`);
  } catch (e) { /* silent */ }

  console.log('\n── Local SSH keys on your machine ────────────────────');
  const sshDir = path.join(os.homedir(), '.ssh');
  if (fs.existsSync(sshDir)) {
    for (const f of fs.readdirSync(sshDir)) {
      const full = path.join(sshDir, f);
      try {
        const st = fs.statSync(full);
        if (!st.isFile()) continue;
        const head = fs.readFileSync(full, 'utf8').split('\n')[0];
        const kind = head.includes('PRIVATE KEY') ? '🔑 private key'
                   : head.startsWith('ssh-') || head.startsWith('ecdsa-') ? '📤 public key'
                   : '📄 other';
        console.log(`  ${kind}  ${full}  (${st.size} bytes)`);
      } catch {}
    }
  } else {
    console.log('  ~/.ssh does not exist');
  }

  console.log('\n── SSH keys stored in Supabase ───────────────────────');
  try {
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY, { auth: { persistSession: false } });
    const { data: settings } = await sb.from('settings').select('key, value')
      .in('key', ['panel_deploy_ssh_key', 'panel_deploy_ssh_pass']);
    (settings || []).forEach(s => {
      if (s.value) console.log(`  settings.${s.key}: ${s.value.slice(0, 40)}...  (${s.value.length}ch)`);
    });
    const { data: vpses } = await sb.from('vpses').select('id, host, ssh_key').not('ssh_key', 'is', null);
    (vpses || []).forEach(v => {
      console.log(`  vpses[#${v.id} ${v.host}].ssh_key: ${v.ssh_key.slice(0, 40)}...  (${v.ssh_key.length}ch)`);
    });
    if (!(settings || []).some(s => s.value) && !(vpses || []).some(v => v.ssh_key)) {
      console.log('  no SSH keys stored anywhere in the DB');
    }
  } catch (e) {
    console.log(`  DB lookup failed: ${e.message}`);
  }

  console.log('\n── What to do next ───────────────────────────────────');
  console.log(`  1. The provider name above tells you which dashboard to open.`);
  console.log(`  2. Log in with your Gmail. Find the VPS whose IP is ${IP}.`);
  console.log(`  3. Use the provider's web console (or "reset root password")`);
  console.log(`     to get in. Once in, run:`);
  console.log(`         pm2 status`);
  console.log(`         pm2 logs alp --lines 60 --nostream`);
  console.log(`         pm2 restart alp   # usually fixes it`);
  console.log(`  4. While you're in, save a new password back to the panel so`);
  console.log(`     heal-panel.js can rescue it automatically next time:`);
  console.log(`         passwd root`);
  console.log(`     then in the app: Settings → Panel Config → save SSH creds.`);
  console.log('');
})();
