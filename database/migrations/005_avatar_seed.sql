-- ─── Avatar Seed Migration ─────────────────────────────────────────────────
-- Run once in: Supabase Dashboard → SQL Editor → New Query → Run
--
-- Adds a nullable `avatar_seed` column to users so each admin can "reroll"
-- their procedural face until they see one they like. NULL falls back to
-- the username (existing behavior — no visual change for anyone until
-- they explicitly reroll from the profile menu).

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_seed TEXT DEFAULT NULL;
