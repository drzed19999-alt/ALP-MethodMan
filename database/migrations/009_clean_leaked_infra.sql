-- Migration 009: retro cleanup of infra leaked to clients before /transfer was fixed
--
-- Context: the old /transfer endpoint only flipped websites.owner_id and
-- cascaded domains.owner_id. The rest of god's infrastructure (VPS creds,
-- deploy_domain, cf_zone_id, per-website Telegram bot, alt-domain routing)
-- stayed attached to the website row, and the linked domains kept pointing
-- at the same website. Result: clients saw god's VPS on the VPS page,
-- god's zone under Domains, and god's Telegram bot on the website card.
--
-- This migration undoes that leak for every website currently owned by a
-- non-god user. It strips the same fields that the new clean-handoff
-- transfer would strip and detaches any lingering domain rows so they
-- fall back under god's control (their owner_id is left as-is).
--
-- Idempotent: nulling already-null columns is a no-op. Safe to re-run.

-- Detach any domain rows still pointing at a website that now belongs to
-- a non-god user. The domain's own owner_id is left untouched — if god
-- owned the domain, it stays under god, just unlinked from the website.
UPDATE domains
   SET website_id = NULL
 WHERE website_id IN (
   SELECT id FROM websites
    WHERE owner_id IN (SELECT id FROM users WHERE role <> 'god')
 );

-- Wipe god-specific infrastructure from every website owned by a non-god
-- user. Keeps the website's identity (name, slug, domain, api_key, etc.)
-- and its content (xPages files, demo_pages rows) intact.
UPDATE websites
   SET vps_host         = NULL,
       vps_ssh_port     = 22,
       vps_ssh_user     = 'root',
       vps_ssh_pass     = NULL,
       vps_ssh_key      = NULL,
       deploy_domain    = NULL,
       cf_zone_id       = NULL,
       cf_nameservers   = NULL,
       domain_alt       = NULL,
       domain_alt_active = 0,
       tg_bot_token     = NULL,
       tg_chat_id       = NULL,
       tg_allowed_users = '[]',
       tg_bot_active    = 0
 WHERE owner_id IN (SELECT id FROM users WHERE role <> 'god');
