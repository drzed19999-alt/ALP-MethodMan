-- Migration 011: strip websites.domain / domain_active leaked to clients
--
-- Migration 009 wiped VPS/deploy/CF/tg-bot fields when websites were owned by
-- non-god users, but it MISSED websites.domain and websites.domain_active.
-- Those two feed the dashboard's "ACTIVE DOMAINS" tile — which counts
-- `websites WHERE domain_active = 1 AND domain <> ''`. Result: a client saw
-- non-zero ACTIVE DOMAINS on their dashboard for every website god had
-- previously connected a domain to, even after the domains table itself
-- had been cleaned out. The client couldn't act on those numbers (Domains
-- page rightly showed empty), but the mismatch was a leak of god's setup.
--
-- websites.domain is NOT NULL in the schema, so we set it to '' (empty
-- string) rather than NULL. The tracker treats '' the same as unconfigured.
--
-- Idempotent — nulling already-empty rows is a no-op.

UPDATE websites
   SET domain        = '',
       domain_active = 0,
       domain_alt    = NULL,
       domain_alt_active = 0
 WHERE owner_id IN (SELECT id FROM users WHERE role <> 'god');
