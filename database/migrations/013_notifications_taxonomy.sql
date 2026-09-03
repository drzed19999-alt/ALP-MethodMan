-- 013 — Notifications taxonomy + grouping + undo, plus per-user prefs / watch.
--
-- category   — routing bucket (security | tenant | system | activity)
-- severity   — low | normal | high | critical (controls toast/sound/badge)
-- actor_id   — user who caused the event; nullable for system events
-- event      — machine-readable event slug (matches socket payload)
-- group_key  — collapse-key used to merge similar events within a 5-min window
-- count      — how many events collapsed into this row (>=1)
-- expires_at — undo window deadline for destructive events
-- undo_action — JSON: { kind, params } consumed by POST /notifications/:id/undo
-- undone_at  — set when the undo has been performed
--
-- users.notification_prefs — JSON per-category/per-channel delivery map
-- users.watched_user_ids   — JSON array of user ids whose actions escalate to high
-- users.telegram_chat_id   — where to mirror high/critical for this user

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS category    TEXT DEFAULT 'system';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS severity    TEXT DEFAULT 'normal';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS actor_id    BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS event       TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS group_key   TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS count       INTEGER DEFAULT 1;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS expires_at  TIMESTAMPTZ;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS undo_action TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS undone_at   TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_notifications_group     ON notifications(owner_id, group_key, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_severity  ON notifications(severity, is_read);

ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_prefs TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS watched_user_ids   TEXT DEFAULT '[]';
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id   TEXT;
