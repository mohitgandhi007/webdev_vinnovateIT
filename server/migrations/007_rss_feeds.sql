-- Migration 007: RSS Feeds for Monitor Detected Changes
ALTER TABLE monitors
  ADD COLUMN IF NOT EXISTS feed_token VARCHAR(64),
  ADD COLUMN IF NOT EXISTS feed_enabled BOOLEAN NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_monitors_feed_token 
  ON monitors(feed_token) 
  WHERE feed_token IS NOT NULL;
