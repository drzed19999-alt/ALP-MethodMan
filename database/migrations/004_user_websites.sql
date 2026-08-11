-- ─── User ⇄ Website Assignments Migration ────────────────────────────────────
-- Run once in: Supabase Dashboard → SQL Editor → New Query → Run
-- Join table backing the god admin's "Assigned Websites" feature.
--
-- god role bypasses this table entirely and sees every website.
-- Non-god users only see websites listed here for their user_id.

CREATE TABLE IF NOT EXISTS user_websites (
  user_id    BIGINT NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  website_id BIGINT NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, website_id)
);

CREATE INDEX IF NOT EXISTS idx_user_websites_user    ON user_websites(user_id);
CREATE INDEX IF NOT EXISTS idx_user_websites_website ON user_websites(website_id);

ALTER TABLE user_websites DISABLE ROW LEVEL SECURITY;
