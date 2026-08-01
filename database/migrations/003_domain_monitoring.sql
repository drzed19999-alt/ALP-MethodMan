-- ─── Domain Monitoring Migration ──────────────────────────────────────────────
-- Run this once in: Supabase Dashboard → SQL Editor → New Query → Run
-- Adds flag detection columns to the domains table.

ALTER TABLE domains ADD COLUMN IF NOT EXISTS flagged          INTEGER DEFAULT 0;
ALTER TABLE domains ADD COLUMN IF NOT EXISTS flag_reason      TEXT    DEFAULT NULL;
ALTER TABLE domains ADD COLUMN IF NOT EXISTS flag_detected_at TIMESTAMPTZ DEFAULT NULL;
