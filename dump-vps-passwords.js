// Prints stored SSH passwords for every VPS in your registry so you can try
// them against the panel VPS (186.240.151.94) when the panel itself has no
// creds saved. Read-only; nothing is modified.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

(async () => {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY, { auth: { persistSession: false } });
  const { data: vpses } = await sb.from('vpses')
    .select('id, host, ssh_user, ssh_port, ssh_pass, label')
    .order('id');

  console.log('\n── Stored SSH passwords (try each against 186.240.151.94) ──\n');
  const seen = new Set();
  const uniquePw = [];
  (vpses || []).forEach(v => {
    const pw = v.ssh_pass || '(none)';
    console.log(`  #${v.id}  ${v.host.padEnd(18)}  user=${v.ssh_user || 'root'}  pass=${pw}  ${v.label ? '"'+v.label+'"' : ''}`);
    if (v.ssh_pass && !seen.has(v.ssh_pass)) { seen.add(v.ssh_pass); uniquePw.push(v.ssh_pass); }
  });
  console.log(`\n  Unique passwords across your fleet: ${uniquePw.length}`);
  uniquePw.forEach(p => console.log(`    → ${p}`));

  console.log('\n── SSH into the panel VPS ────────────────────────────────');
  console.log('  ssh root@186.240.151.94');
  console.log('  (try each of the unique passwords above when prompted)\n');
  console.log('Once in:');
  console.log('  pm2 status');
  console.log('  pm2 logs alp --lines 80 --nostream');
  console.log('  # if crashed:  pm2 restart alp\n');
})();
