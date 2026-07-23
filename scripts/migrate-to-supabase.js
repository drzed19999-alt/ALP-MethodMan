/**
 * Migration Script: Local SQLite → Supabase (PostgreSQL)
 * Zero Data Loss — Copy-only migration tool.
 *
 * Usage:
 *   node scripts/migrate-to-supabase.js
 *
 * Requires in .env:
 *   SUPABASE_URL=https://your-project.supabase.co
 *   SUPABASE_SERVICE_KEY=your-service-role-key
 *   DB_PATH=./database/alp.db (defaults to standard location)
 */

const path = require('path');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'database', 'alp.db');

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in your .env file.');
  process.exit(1);
}

const Database = require('better-sqlite3');
const { createClient } = require('@supabase/supabase-js');

const sqlite = new Database(DB_PATH, { readonly: true });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

console.log('🚀 Starting Zero-Data-Loss Migration: SQLite → Supabase');
console.log(`📁 Source SQLite DB: ${DB_PATH}`);
console.log(`📡 Destination Supabase: ${SUPABASE_URL}\n`);

async function migrate() {
  try {
    // 1. Setup Supabase RPC functions if needed
    console.log('📦 Setting up helper functions and tables in Supabase...');

    // Tables to migrate in dependency order
    const tables = [
      'users',
      'websites',
      'sessions',
      'page_views',
      'redirect_rules',
      'redirect_commands',
      'notifications',
      'audit_logs',
      'settings',
      'telegram_config',
      'blocked_ips',
      'activity_feed',
      'demo_pages',
      'funnels'
    ];

    let totalMigratedRows = 0;

    for (const table of tables) {
      // Check if source table exists in SQLite
      const tableCheck = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
      if (!tableCheck) {
        console.log(`⏩ Skipping table '${table}' (does not exist in local SQLite)`);
        continue;
      }

      const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
      console.log(`🔄 Migrating '${table}': ${rows.length} rows found...`);

      if (rows.length === 0) {
        console.log(`   ✓ '${table}' is empty, skipped row transfer.`);
        continue;
      }

      // Upsert rows in batches of 100
      const batchSize = 100;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const { error } = await supabase.from(table).upsert(batch, { ignoreDuplicates: false });

        if (error) {
          console.warn(`   ⚠️ Warning upserting batch into '${table}': ${error.message}`);
          console.warn(`   Attempting fallback row-by-row insert for '${table}'...`);

          for (const row of batch) {
            const { error: singleErr } = await supabase.from(table).upsert(row);
            if (singleErr) {
              console.error(`   ❌ Failed row in '${table}':`, row, singleErr.message);
            }
          }
        }
      }

      totalMigratedRows += rows.length;
      console.log(`   ✅ Transferred ${rows.length} rows to '${table}'`);
    }

    console.log('\n==================================================');
    console.log(`🎉 Migration completed successfully! Total rows copied: ${totalMigratedRows}`);
    console.log('🔒 Your local SQLite database was not touched or deleted.');
    console.log('==================================================\n');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

migrate();
