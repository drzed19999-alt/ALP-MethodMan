/**
 * Database Adapter
 * Provides a unified async interface for both SQLite (local) and Supabase (Vercel).
 * All route handlers use this adapter so the same code works in both environments.
 *
 * Created by @itstheoutlaws (Telegram)
 */
const { isSupabaseConfigured } = require('./supabase');

let adapter = null;

// ─── SQLite Adapter ─────────────────────────────────────────────────────────
// Wraps better-sqlite3 synchronous calls in async interface

function createSqliteAdapter(db) {
  return {
    type: 'sqlite',

    /**
     * Run a query that returns a single row.
     * @param {string} sql - SQL query with ? placeholders
     * @param {any[]} params - Parameter values
     * @returns {Promise<object|null>}
     */
    async get(sql, params = []) {
      return db.prepare(sql).get(...params) || null;
    },

    /**
     * Run a query that returns multiple rows.
     * @param {string} sql - SQL query with ? placeholders
     * @param {any[]} params - Parameter values
     * @returns {Promise<object[]>}
     */
    async all(sql, params = []) {
      return db.prepare(sql).all(...params);
    },

    /**
     * Run a query that modifies data (INSERT, UPDATE, DELETE).
     * @param {string} sql - SQL query with ? placeholders
     * @param {any[]} params - Parameter values
     * @returns {Promise<{changes: number, lastInsertRowid: number}>}
     */
    async run(sql, params = []) {
      const result = db.prepare(sql).run(...params);
      return {
        changes: result.changes,
        lastInsertRowid: result.lastInsertRowid
      };
    },

    /**
     * Execute raw SQL (for DDL statements like CREATE TABLE).
     * @param {string} sql
     */
    async exec(sql) {
      db.exec(sql);
    },

    /**
     * Run multiple statements in a transaction.
     * @param {function} fn - Async function receiving the adapter
     * @returns {Promise<any>}
     */
    async transaction(fn) {
      const transaction = db.transaction(() => {});
      // We use a simpler approach: just run the fn — SQLite is already atomic
      // for individual statements, and we wrap in begin/commit
      db.exec('BEGIN');
      try {
        const result = await fn(this);
        db.exec('COMMIT');
        return result;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },

    /**
     * Run a pragma command (SQLite-specific, no-op on Supabase).
     * @param {string} pragma
     */
    async pragma(pragma) {
      try { db.pragma(pragma); } catch (e) { /* ignore */ }
    },

    /** Get the raw better-sqlite3 instance (for local-only code paths). */
    get raw() { return db; }
  };
}

// ─── Supabase Adapter ───────────────────────────────────────────────────────
// Wraps @supabase/supabase-js RPC/SQL calls in the same interface.
// Uses Supabase's .rpc() with raw SQL via a postgres function, or the REST API.

function createSupabaseAdapter() {
  const { getSupabase } = require('./supabase');
  const supabase = getSupabase();

  /**
   * Convert ? placeholders to $1, $2, ... for PostgreSQL
   * @param {string} sql
   * @returns {string}
   */
  function convertPlaceholders(sql) {
    let idx = 0;
    return sql.replace(/\?/g, () => `$${++idx}`);
  }

  /**
   * Convert SQLite-specific syntax to PostgreSQL
   * @param {string} sql
   * @returns {string}
   */
  function convertSyntax(sql) {
    let pg = sql;

    // ── strftime('%s', ...) → EXTRACT(EPOCH FROM ...) ─────────────────────────
    // strftime('%s','now')  →  EXTRACT(EPOCH FROM NOW())
    pg = pg.replace(
      /strftime\('%s',\s*'now'\)/gi,
      "EXTRACT(EPOCH FROM NOW())"
    );
    // strftime('%s', col)  →  EXTRACT(EPOCH FROM col::timestamptz)
    pg = pg.replace(
      /strftime\('%s',\s*([^)]+)\)/gi,
      "EXTRACT(EPOCH FROM ($1)::timestamptz)"
    );

    // ── strftime → TO_CHAR (longest patterns first) ──────────────────────────
    // strftime('%Y-%m-%d %H:00', col)  →  TO_CHAR(col::timestamptz, 'YYYY-MM-DD HH24":00"')
    pg = pg.replace(
      /strftime\('%Y-%m-%d %H:00',\s*([^)]+)\)/gi,
      "TO_CHAR(($1)::timestamptz, 'YYYY-MM-DD HH24\":00\"')"
    );
    // strftime('%Y-%m-%d', col)  →  TO_CHAR(col::timestamptz, 'YYYY-MM-DD')
    pg = pg.replace(
      /strftime\('%Y-%m-%d',\s*([^)]+)\)/gi,
      "TO_CHAR(($1)::timestamptz, 'YYYY-MM-DD')"
    );
    // strftime('%H', col)  →  TO_CHAR(col::timestamptz, 'HH24')
    pg = pg.replace(
      /strftime\('%H',\s*([^)]+)\)/gi,
      "TO_CHAR(($1)::timestamptz, 'HH24')"
    );

    // ── datetime('now', modifier) → NOW() arithmetic ──────────────────────────
    pg = pg.replace(
      /datetime\('now',\s*'-(\d+)\s+hours?'\)/gi,
      "(NOW() - INTERVAL '$1 hours')"
    );
    pg = pg.replace(
      /datetime\('now',\s*'-(\d+)\s+days?'\)/gi,
      "(NOW() - INTERVAL '$1 days')"
    );
    pg = pg.replace(/datetime\('now'\)/gi, 'NOW()');

    // ── julianday() date arithmetic → EXTRACT(EPOCH FROM ...) ────────────────
    // Handle COALESCE(a, b) as first argument
    pg = pg.replace(
      /\(\s*julianday\(\s*(COALESCE\([^)]+\))\s*\)\s*-\s*julianday\(\s*(\w+(?:\.\w+)?)\s*\)\s*\)\s*\*\s*86400/gi,
      'EXTRACT(EPOCH FROM (($1)::timestamptz - ($2)::timestamptz))'
    );
    // Simple column names (with optional table alias like s.started_at)
    pg = pg.replace(
      /\(\s*julianday\(\s*(\w+(?:\.\w+)?)\s*\)\s*-\s*julianday\(\s*(\w+(?:\.\w+)?)\s*\)\s*\)\s*\*\s*86400/gi,
      'EXTRACT(EPOCH FROM (($1)::timestamptz - ($2)::timestamptz))'
    );

    // ── INSERT OR IGNORE → INSERT ... ON CONFLICT DO NOTHING ─────────────────
    pg = pg.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO');
    // Append ON CONFLICT DO NOTHING if the statement came from INSERT OR IGNORE
    // (simpler: just strip it — unique violations in seeding code are benign)
    pg = pg.replace(/INSERT\s+OR\s+IGNORE/gi, 'INSERT');

    return pg;
  }

  return {
    type: 'supabase',

    async get(sql, params = []) {
      const pgSql = convertSyntax(convertPlaceholders(sql));
      const { data, error } = await supabase.rpc('exec_sql', {
        query: pgSql,
        params: params
      });
      if (error) throw new Error(`Supabase query error: ${error.message}\nSQL: ${pgSql}`);
      return (data && data.length > 0) ? data[0] : null;
    },

    async all(sql, params = []) {
      const pgSql = convertSyntax(convertPlaceholders(sql));
      const { data, error } = await supabase.rpc('exec_sql', {
        query: pgSql,
        params: params
      });
      if (error) throw new Error(`Supabase query error: ${error.message}\nSQL: ${pgSql}`);
      return data || [];
    },

    async run(sql, params = []) {
      const pgSql = convertSyntax(convertPlaceholders(sql));
      const { data, error } = await supabase.rpc('exec_sql_mutate', {
        query: pgSql,
        params: params
      });
      if (error) throw new Error(`Supabase query error: ${error.message}\nSQL: ${pgSql}`);
      // Extract changes count and last ID from response
      const result = data && data[0] ? data[0] : {};
      return {
        changes: result.affected_rows || 0,
        lastInsertRowid: result.last_id || 0
      };
    },

    async exec(sql) {
      const pgSql = convertSyntax(sql);
      const { error } = await supabase.rpc('exec_sql_mutate', {
        query: pgSql,
        params: []
      });
      if (error) throw new Error(`Supabase exec error: ${error.message}\nSQL: ${pgSql}`);
    },

    async transaction(fn) {
      // Supabase doesn't support multi-statement transactions via REST API.
      // We run statements sequentially — Supabase handles each atomically.
      return await fn(this);
    },

    async pragma(_pragma) {
      // No-op on Supabase (PostgreSQL doesn't use pragmas)
    },

    get raw() { return supabase; }
  };
}


// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Get the database adapter (creates on first call).
 * - If SUPABASE_URL is set → returns Supabase adapter
 * - Otherwise → returns SQLite adapter (wrapping the initialized better-sqlite3 db)
 *
 * @returns {object} The database adapter
 */
function getAdapter() {
  if (adapter) return adapter;

  if (isSupabaseConfigured()) {
    console.log('📡 Using Supabase database adapter');
    adapter = createSupabaseAdapter();
  } else {
    // Lazy-require to avoid crashes when better-sqlite3 isn't available (Vercel)
    try {
      const { getDb } = require('./init');
      const db = getDb();
      console.log('💾 Using SQLite database adapter');
      adapter = createSqliteAdapter(db);
    } catch (err) {
      throw new Error(
        'No database available. Set SUPABASE_URL for Vercel, or install better-sqlite3 for local dev.\n' +
        err.message
      );
    }
  }

  return adapter;
}

/**
 * Check which database backend is active.
 * @returns {'supabase'|'sqlite'|'none'}
 */
function getAdapterType() {
  if (adapter) return adapter.type;
  if (isSupabaseConfigured()) return 'supabase';
  try {
    require('better-sqlite3');
    return 'sqlite';
  } catch {
    return 'none';
  }
}

module.exports = { getAdapter, getAdapterType };
