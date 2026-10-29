-- Migration 014: Add default_page column to websites table
-- Allows admins to configure which HTML page is served when a visitor hits the root domain path.
ALTER TABLE websites ADD COLUMN IF NOT EXISTS default_page TEXT DEFAULT NULL;

