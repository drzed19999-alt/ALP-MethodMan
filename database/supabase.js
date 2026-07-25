/**
 * Supabase Client
 * Initializes and exports the Supabase client for Vercel production.
 * Lazy-loaded: @supabase/supabase-js is only required when Supabase is configured.
 *
 * Created by @itstheoutlaws (Telegram)
 */
require('dotenv').config();

let supabase = null;

/**
 * Get or create the Supabase client singleton.
 * Uses SUPABASE_SERVICE_KEY (full access) for server-side operations.
 * Falls back to SUPABASE_ANON_KEY if service key is not set.
 * 
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
function getSupabase() {
  if (supabase) return supabase;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'Supabase credentials missing. Set SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_ANON_KEY) in .env'
    );
  }

  // Lazy-require: only load the package when actually needed
  const { createClient } = require('@supabase/supabase-js');

  supabase = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    },
    db: {
      schema: 'public'
    }
  });

  return supabase;
}

/**
 * Check if Supabase is configured (env vars present).
 * @returns {boolean}
 */
function isSupabaseConfigured() {
  return !!(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY));
}

module.exports = { getSupabase, isSupabaseConfigured };
