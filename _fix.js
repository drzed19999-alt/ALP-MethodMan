const path = require('path');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const Database = require('better-sqlite3');

(async () => {
  const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { data, error } = await sb.from('settings').select('key, value')
    .or('key.like.panel_%,key.like.deploy_ssh_%');
  if (error) { console.error(error); process.exit(1); }

  const db = new Database(path.resolve(__dirname, 'database', 'alp.db'));
  const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const r of data) {
    upsert.run(r.key, r.value);
    console.log('synced', r.key);
  }
  db.close();
  console.log('local SQLite synced from Supabase');
})();
