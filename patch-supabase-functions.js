/**
 * One-time patch: updates exec_sql and exec_sql_mutate in Supabase
 * with the corrected replace()-based parameter substitution.
 *
 * Usage:  node patch-supabase-functions.js
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌  SUPABASE_URL and SUPABASE_SERVICE_KEY must be in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
});

const EXEC_SQL = `
CREATE OR REPLACE FUNCTION exec_sql(query text, params jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  result    jsonb;
  n         int;
  i         int;
  elem      jsonb;
BEGIN
  n := CASE WHEN params IS NULL THEN 0 ELSE jsonb_array_length(params) END;

  FOR i IN REVERSE n..1 LOOP
    elem := params->(i-1);
    IF jsonb_typeof(elem) = 'null' THEN
      query := replace(query, '$' || i, 'NULL');
    ELSIF jsonb_typeof(elem) = 'string' THEN
      query := replace(query, '$' || i, quote_literal(elem#>>'{}'));
    ELSE
      query := replace(query, '$' || i, elem::text);
    END IF;
  END LOOP;

  EXECUTE 'SELECT coalesce(jsonb_agg(t), ''[]''::jsonb) FROM (' || query || ') t' INTO result;
  RETURN result;
END;
$func$;
`;

const EXEC_SQL_MUTATE = `
CREATE OR REPLACE FUNCTION exec_sql_mutate(query text, params jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  affected_count  int;
  last_insert_id  bigint := 0;
  n               int;
  i               int;
  elem            jsonb;
BEGIN
  n := CASE WHEN params IS NULL THEN 0 ELSE jsonb_array_length(params) END;

  FOR i IN REVERSE n..1 LOOP
    elem := params->(i-1);
    IF jsonb_typeof(elem) = 'null' THEN
      query := replace(query, '$' || i, 'NULL');
    ELSIF jsonb_typeof(elem) = 'string' THEN
      query := replace(query, '$' || i, quote_literal(elem#>>'{}'));
    ELSE
      query := replace(query, '$' || i, elem::text);
    END IF;
  END LOOP;

  EXECUTE query;
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  BEGIN
    SELECT lastval() INTO last_insert_id;
  EXCEPTION WHEN OTHERS THEN
    last_insert_id := 0;
  END;
  RETURN jsonb_build_array(jsonb_build_object('affected_rows', affected_count, 'last_id', last_insert_id));
END;
$func$;
`;

async function patch() {
  console.log('\n🔧  Patching Supabase RPC functions...\n');

  // Patch exec_sql_mutate first so we can use it for exec_sql
  console.log('  Updating exec_sql_mutate...');
  let { error } = await supabase.rpc('exec_sql_mutate', { query: EXEC_SQL_MUTATE.trim(), params: [] });
  if (error) {
    console.error('  ❌  exec_sql_mutate patch failed:', error.message);
    console.log('\n  → Run the SQL manually in Supabase SQL Editor instead (see schema.sql)');
    process.exit(1);
  }
  console.log('  ✅  exec_sql_mutate updated');

  console.log('  Updating exec_sql...');
  ({ error } = await supabase.rpc('exec_sql_mutate', { query: EXEC_SQL.trim(), params: [] }));
  if (error) {
    console.error('  ❌  exec_sql patch failed:', error.message);
    process.exit(1);
  }
  console.log('  ✅  exec_sql updated');

  // Quick smoke-test
  console.log('\n  Running smoke test...');
  const { data, error: testErr } = await supabase.rpc('exec_sql', {
    query: "SELECT * FROM users WHERE username = $1",
    params: ['admin']
  });
  if (testErr) {
    console.error('  ❌  Smoke test failed:', testErr.message);
    process.exit(1);
  }
  console.log(`  ✅  Smoke test passed — found ${data.length} user(s) named "admin"`);
  console.log('\n✅  Patch complete! Login should now work.\n');
}

patch().catch(err => {
  console.error('❌  Unexpected error:', err.message);
  process.exit(1);
});
