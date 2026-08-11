-- Migration 008: drop Railway columns from `domains`
--
-- The panel is VPS-only. Railway support was removed from all code paths;
-- these columns are unused. They may not exist on installs older than 001,
-- so use IF EXISTS to keep the migration idempotent.

ALTER TABLE domains DROP COLUMN IF EXISTS railway_service_id;
ALTER TABLE domains DROP COLUMN IF EXISTS railway_environment_id;
ALTER TABLE domains DROP COLUMN IF EXISTS railway_domain_id;

-- Retire any lingering 'railway_linked' status by re-slotting into the closest
-- VPS state. Anything that was mid-Railway-provision becomes an error the user
-- can retry from the VPS pipeline.
UPDATE domains SET status = 'error',
                   error_message = 'Legacy Railway state — retry via re-check'
WHERE status = 'railway_linked';

-- Any old rows still marked hosting_provider='railway' become 'vps' so the
-- monitor picks them up on the VPS branch.
UPDATE domains SET hosting_provider = 'vps' WHERE hosting_provider = 'railway';
