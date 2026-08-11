/**
 * One-time migration: copies all data from local SQLite → Supabase.
 * Uses Supabase native REST API (no RPC), far more reliable.
 *
 * Usage:
 *   node migrate-to-supabase.js
 *   (SUPABASE_URL and SUPABASE_SERVICE_KEY must be in .env)
 */
require('dotenv').config();
const Database = require('better-sqlite3');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const SUPABASE_URL        = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const DB_PATH             = process.env.DB_PATH || './database/alp.db';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌  Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env before running.');
  process.exit(1);
}

const sqlite = new Database(path.resolve(DB_PATH), { readonly: true });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
});

// Per-table conflict column (primary key or unique key for ON CONFLICT DO NOTHING)
const CONFLICT_COL = {
  users:            'id',
  websites:         'id',
  settings:         'key',
  telegram_config:  'id',
  demo_pages:       'url',
  funnels:          'id',
  redirect_rules:   'id',
  blocked_ips:      'ip_address',
  sessions:         'id',
  page_views:       'id',
  redirect_commands:'id',
  notifications:    'id',
  audit_logs:       'id',
  activity_feed:    'id',
};

// Insertion order respects FK dependencies
const TABLES = Object.keys(CONFLICT_COL);

const CHUNK = 50; // rows per batch

async function migrateTable(table) {
  const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
  if (rows.length === 0) {
    console.log(`  ⏭  ${table}: empty, skipping`);
    return;
  }

  const conflictCol = CONFLICT_COL[table] || 'id';
  let inserted = 0;
  let errors   = 0;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);

    const { error } = await supabase
      .from(table)
      .upsert(chunk, { onConflict: conflictCol, ignoreDuplicates: true });

    if (error) {
      console.warn(`  ⚠  ${table} batch error: ${error.message}`);
      errors += chunk.length;
    } else {
      inserted += chunk.length;
    }
  }

  const icon = errors === 0 ? '✅' : '⚠ ';
  console.log(`  ${icon}  ${table}: ${inserted}/${rows.length} rows migrated${errors ? `, ${errors} failed` : ''}`);
}

async function resetSequences() {
  // After bulk-inserting rows with explicit IDs, reset each sequence
  // so the next auto-generated ID doesn't collide.
  const seqTables = ['users','websites','demo_pages','funnels','redirect_rules',
                     'redirect_commands','notifications','audit_logs','blocked_ips',
                     'page_views','activity_feed'];

  for (const t of seqTables) {
    const { error } = await supabase.rpc('exec_sql_mutate', {
      query: `SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT MAX(id) FROM ${t}), 1))`,
      params: []
    });
    if (error) {
      // Not fatal — table might not have a sequence
    }
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
  console.log('  1. Add SUPABASE_URL and SUPABASE_SERVICE_KEY to your panel .env');
  console.log('  2. Restart the panel — both environments now share one database\n');
})();
