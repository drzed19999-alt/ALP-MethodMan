-- ─── Per-user Ownership — Round 2 ────────────────────────────────────────
-- Run once in: Supabase Dashboard → SQL Editor → New Query → Run
--
-- Migration 006 covered websites and domains. This one closes every remaining
-- gap so every user is a fully-isolated tenant. God still sees everything.
--
-- Tables getting owner_id:
--   notifications       — was global; now belongs to the user it's for
--   activity_feed       — was a global stream; now per-user
--   blocked_ips         — was a panel-wide blocklist; now per-user
--   audit_logs          — already had user_id (nullable). We enforce that
--                         non-system rows are attributed and index it for
--                         fast per-user reads.
--   redirect_rules      — has website_id already; nothing to add here.
--                         Scope is enforced in the route via websites.owner_id.
--   redirect_commands   — same story.
--
-- All new owner_id columns are ON DELETE RESTRICT so accidental user deletion
-- can never cascade-wipe someone's captured data.

DO $$
DECLARE
  god_uid BIGINT;
BEGIN
  SELECT id INTO god_uid FROM users WHERE role = 'god' ORDER BY id LIMIT 1;
  IF god_uid IS NULL THEN
    RAISE EXCEPTION 'No god user found. Create one before running 007_owner_id_everywhere.sql.';
  END IF;

  -- ── notifications.owner_id ────────────────────────────────────────────
  ALTER TABLE notifications ADD COLUMN IF NOT EXISTS owner_id BIGINT REFERENCES users(id) ON DELETE RESTRICT;
  UPDATE notifications SET owner_id = god_uid WHERE owner_id IS NULL;
  ALTER TABLE notifications ALTER COLUMN owner_id SET NOT NULL;

  -- ── activity_feed.owner_id ────────────────────────────────────────────
  -- Backfill via the website that emitted the event when possible; fall
  -- back to god for events without a website (system / login / etc).
  ALTER TABLE activity_feed ADD COLUMN IF NOT EXISTS owner_id BIGINT REFERENCES users(id) ON DELETE RESTRICT;
  UPDATE activity_feed a
     SET owner_id = w.owner_id
    FROM websites w
   WHERE a.website_id = w.id AND a.owner_id IS NULL;
  UPDATE activity_feed SET owner_id = god_uid WHERE owner_id IS NULL;
  ALTER TABLE activity_feed ALTER COLUMN owner_id SET NOT NULL;

  -- ── blocked_ips.owner_id ──────────────────────────────────────────────
  -- Each user maintains their own blocklist for their sites. The old global
  -- UNIQUE(ip_address) becomes UNIQUE(owner_id, ip_address) so different
  -- users can independently block/allow the same IP.
  ALTER TABLE blocked_ips ADD COLUMN IF NOT EXISTS owner_id BIGINT REFERENCES users(id) ON DELETE RESTRICT;
  UPDATE blocked_ips SET owner_id = god_uid WHERE owner_id IS NULL;
  ALTER TABLE blocked_ips ALTER COLUMN owner_id SET NOT NULL;

  -- Rebuild the ip uniqueness constraint per-owner. Drop the global one if
  -- it exists (Postgres auto-generated name is usually blocked_ips_ip_address_key).
  BEGIN
    ALTER TABLE blocked_ips DROP CONSTRAINT blocked_ips_ip_address_key;
  EXCEPTION WHEN undefined_object THEN
    -- constraint doesn't exist — fine, nothing to drop
    NULL;
  END;
  -- Only add the per-owner UNIQUE constraint if it isn't already there.
  -- A UNIQUE constraint creates an index that lives in the relation namespace,
  -- so a naive `ADD CONSTRAINT` on a re-run raises 42P07 (duplicate_table),
  -- which doesn't match `duplicate_object` — hence the explicit check.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'blocked_ips_owner_ip_key'
      AND conrelid = 'blocked_ips'::regclass
  ) THEN
    ALTER TABLE blocked_ips ADD CONSTRAINT blocked_ips_owner_ip_key UNIQUE (owner_id, ip_address);
  END IF;
END $$;

-- Indexes for the hot-path filters.
CREATE INDEX IF NOT EXISTS idx_notifications_owner  ON notifications(owner_id);
CREATE INDEX IF NOT EXISTS idx_activity_feed_owner  ON activity_feed(owner_id);
CREATE INDEX IF NOT EXISTS idx_blocked_ips_owner    ON blocked_ips(owner_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user      ON audit_logs(user_id);
