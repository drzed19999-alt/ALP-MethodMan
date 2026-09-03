const { getAdapter } = require('./database/adapter');
(async () => {
  const db = getAdapter();

  // Delete the credential-less godadmin duplicates (id=13, id=14)
  // These IPs already exist under methodman with proper creds
  await db.run('DELETE FROM vpses WHERE id IN (13, 14)');
  console.log('Deleted duplicate godadmin rows (id=13, id=14)');

  // Also fix 91.229.239.62 if it has the same problem
  const dupes91 = await db.all(
    "SELECT id, owner_id, ssh_pass IS NOT NULL as has_pass FROM vpses WHERE host = '91.229.239.62' ORDER BY id"
  );
  if (dupes91.length > 1) {
    const empty = dupes91.filter(r => !r.has_pass);
    for (const e of empty) {
      await db.run('DELETE FROM vpses WHERE id = ?', [e.id]);
      console.log('Deleted duplicate 91.229.239.62 row id=' + e.id);
    }
  }

  // Verify — all remaining VPSes should have credentials
  const all = await db.all(
    "SELECT id, host, owner_id, ssh_pass IS NOT NULL as has_pass, ssh_key IS NOT NULL as has_key FROM vpses ORDER BY id"
  );
  console.log('\nAll VPSes after cleanup:');
  all.forEach(r => console.log(`  id=${r.id} | ${r.host} | owner=${r.owner_id} | pass=${r.has_pass ? 'YES' : 'NULL'} | key=${r.has_key ? 'YES' : 'NULL'}`));

  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
