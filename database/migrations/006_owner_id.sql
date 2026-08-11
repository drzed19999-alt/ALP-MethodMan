-- ─── Per-user Ownership Migration ─────────────────────────────────────────
-- Run once in: Supabase Dashboard → SQL Editor → New Query → Run
--
-- Introduces single-owner tenancy. Every website and every domain now has
-- exactly one owning user. Non-god users only see rows they own. God still
-- sees everything, and can filter to any single user's view via ?as_user=<id>.
--
-- Legacy rows (created before this migration) are backfilled to the earliest
-- god account. If no god exists this migration will fail loudly — that is
-- intentional, we need someone to inherit the rows.
--
-- After this runs, `user_websites` is no longer read anywhere in the app.
-- Leaving the table in place for now; drop in a later migration once we're
-- comfortable nothing regressed.
--
-- FK uses ON DELETE RESTRICT (NOT CASCADE): deleting a user who still owns
-- websites or domains is refused at the database level. This prevents an
-- admin-panel "delete user" click from silently wiping their captured data.
-- The god UI should first reassign or hard-delete owned rows, then delete
-- the user.

DO $$
DECLARE
  god_uid BIGINT;
BEGIN
  SELECT id INTO god_uid FROM users WHERE role = 'god' ORDER BY id LIMIT 1;
  IF god_uid IS NULL THEN
    RAISE EXCEPTION 'No god user found. Create one before running 006_owner_id.sql.';
  END IF;

  -- ── websites.owner_id ──────────────────────────────────────────────────
  ALTER TABLE websites   ADD COLUMN IF NOT EXISTS owner_id BIGINT REFERENCES users(id) ON DELETE RESTRICT;
  UPDATE websites SET owner_id = god_uid WHERE owner_id IS NULL;
  ALTER TABLE websites   ALTER COLUMN owner_id SET NOT NULL;

  -- ── domains.owner_id ───────────────────────────────────────────────────
  ALTER TABLE domains    ADD COLUMN IF NOT EXISTS owner_id BIGINT REFERENCES users(id) ON DELETE RESTRICT;
  UPDATE domains SET owner_id = god_uid WHERE owner_id IS NULL;
  ALTER TABLE domains    ALTER COLUMN owner_id SET NOT NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_websites_owner ON websites(owner_id);
CREATE INDEX IF NOT EXISTS idx_domains_owner  ON domains(owner_id);

-- Uniqueness rules:
--   websites.api_key   — kept globally unique (identifies a site to trackers)
--   websites.demo_slug — kept globally unique (used in public /demo/<slug> URLs).
--                        Collisions on create are handled in application code
--                        by auto-suffixing.
--   websites.name      — was never unique, still not unique. Two users can
--                        each have "Chase Bank"; that's the whole point.
--   domains.domain     — kept globally unique (DNS is global anyway).

-- No new RLS work needed — the app enforces ownership in middleware.
