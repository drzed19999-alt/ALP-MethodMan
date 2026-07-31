/**
 * One-time migration: copies all data from local SQLite → Supabase.
 * Run AFTER creating the schema in Supabase (paste database/schema.sql into SQL editor).
 * Run BEFORE switching to Supabase in production.
 *
 * Usage:
 *   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_KEY=eyJ... node migrate-to-supabase.js
 *   (or set them in .env first)
 */
require('dotenv').config();
const Database = require('better-sqlite3');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const DB_PATH = process.env.DB_PATH || './database/alp.db';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌  Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env before running.');
  process.exit(1);
}

const sqlite = new Database(path.resolve(DB_PATH), { readonly: true });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
});

// Tables in insertion order (respecting FK dependencies)
const TABLES = [
  'users',
  'websites',
  'settings',
  'telegram_config',
  'demo_pages',
  'funnels',
  'redirect_rules',
  'blocked_ips',
  'sessions',
  'page_views',
  'redirect_commands',
  'notifications',
  'audit_logs',
  'activity_feed',
];

async function rpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(`${fn} error: ${error.message}`);
  return data;
}

async function migrateTable(table) {
  const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
  if (rows.length === 0) {
    console.log(`  ⏭  ${table}: empty, skipping`);
    return;
  }

  let inserted = 0;
  for (const row of rows) {
    // Build parameterised INSERT with ON CONFLICT DO NOTHING
    const cols = Object.keys(row);
    const vals = Object.values(row);
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
    const colList = cols.map(c => `"${c}"`).join(', ');
    const sql = `INSERT INTO ${table} (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;

    try {
      await rpc('exec_sql_mutate', { query: sql, params: vals.map(v => v === null ? null : String(v)) });
      inserted++;
    } catch (err) {
      console.warn(`  ⚠  ${table} row skipped: ${err.message.split('\n')[0]}`);
    }
  }
  console.log(`  ✅  ${table}: ${inserted}/${rows.length} rows migrated`);
}

async function resetSequences() {
  const seqTables = ['users', 'websites', 'demo_pages', 'funnels', 'redirect_rules',
    'redirect_commands', 'notifications', 'audit_logs', 'blocked_ips',
    'page_views', 'activity_feed'];
  for (const t of seqTables) {
    try {
      await rpc('exec_sql_mutate', {
        query: `SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT MAX(id) FROM ${t}), 0) + 1, false)`,
        params: []
      });
    } catch (_) { /* table might not have a sequence — ignore */ }
  }
  console.log('  ✅  Sequences reset');
}

(async () => {
  console.log('\n🚀  Starting SQLite → Supabase migration\n');
  for (const table of TABLES) {
    process.stdout.write(`  📋  ${table}... `);
    try {
      await migrateTable(table);
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
    }
  }
  console.log('\n🔢  Resetting auto-increment sequences...');
  await resetSequences();
  console.log('\n✅  Migration complete!\n');
  console.log('Next steps:');
  console.log('  1. Add SUPABASE_URL and SUPABASE_SERVICE_KEY to Railway environment variables');
  console.log('  2. Add them to your local .env too (so localhost also uses Supabase)');
  console.log('  3. git push and Railway will redeploy automatically\n');
})();
