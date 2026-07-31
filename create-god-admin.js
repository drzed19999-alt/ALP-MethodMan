/**
 * Creates the god admin account in both SQLite (local) and Supabase.
 * Run once after setting up the server.
 *
 * Usage:  node create-god-admin.js
 *
 * Credentials created:
 *   username : godadmin
 *   password : God@Admin1
 *   role     : god
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const USERNAME = 'godadmin';
const PASSWORD = 'God@Admin1';
const EMAIL    = 'god@alp.local';
const ROLE     = 'god';

async function createInSupabase() {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });

  const hash = bcrypt.hashSync(PASSWORD, 10);

  // Upsert so re-running is safe
  const { error } = await supabase
    .from('users')
    .upsert(
      { username: USERNAME, email: EMAIL, password_hash: hash, role: ROLE, avatar_color: '#D4AF37' },
      { onConflict: 'username', ignoreDuplicates: false }
    );

  if (error) throw new Error(error.message);
  console.log('  ✅  god admin created in Supabase');
}

function createInSQLite() {
  const Database = require('better-sqlite3');
  const path = require('path');
  const db = new Database(path.resolve(process.env.DB_PATH || './database/alp.db'));
  const hash = bcrypt.hashSync(PASSWORD, 10);
  try {
    db.prepare(`
      INSERT INTO users (username, email, password_hash, role, avatar_color)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(username) DO UPDATE SET
        password_hash = excluded.password_hash,
        role          = excluded.role,
        avatar_color  = excluded.avatar_color
    `).run(USERNAME, EMAIL, hash, ROLE, '#D4AF37');
    console.log('  ✅  god admin created in SQLite');
  } finally {
    db.close();
  }
}

(async () => {
  console.log('\n👑  Creating god admin account...\n');

  const hasSupabase = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);

  if (hasSupabase) {
    await createInSupabase();
  } else {
    createInSQLite();
  }

  console.log('\n─────────────────────────────────');
  console.log(`  Username : ${USERNAME}`);
  console.log(`  Password : ${PASSWORD}`);
  console.log(`  Role     : ${ROLE}`);
  console.log('─────────────────────────────────\n');
  console.log('✅  Done. Change the password from Settings after logging in.\n');
})().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});
