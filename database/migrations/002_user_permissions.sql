-- ─── User Permissions Migration ──────────────────────────────────────────────
-- Run once in: Supabase Dashboard → SQL Editor → New Query → Run
-- Adds per-user page-level permission overrides for the god role to manage.

ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}'::jsonb;

-- Disable RLS so the service key can write permissions
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
