/**
 * One-shot migration: add session_token column to users table in Supabase.
 * Safe to run multiple times (uses IF NOT EXISTS).
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function run() {
  console.log('Adding session_token column to users table...');

  const { error } = await supabase.rpc('exec_sql_mutate', {
    query: `ALTER TABLE users ADD COLUMN IF NOT EXISTS session_token TEXT DEFAULT NULL`,
    params: []
  });

  if (error) {
    console.error('Failed:', error.message);
    process.exit(1);
  }

  console.log('Done. Verifying...');

  const { data, error: selErr } = await supabase.rpc('exec_sql', {
    query: `SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'session_token'`,
    params: []
  });

  if (selErr) {
    console.error('Verify error:', selErr.message);
  } else if (data && data.length > 0) {
    console.log('✓ session_token column confirmed in users table.');
  } else {
    console.warn('Column not found after ALTER — check Supabase permissions.');
  }
}

run();
