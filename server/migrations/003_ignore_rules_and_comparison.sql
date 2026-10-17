-- Migration 003: Ignored Selectors, Noise Filter Configuration, and Comparison Support
ALTER TABLE monitors
  ADD COLUMN IF NOT EXISTS ignored_selectors TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS ignore_patterns JSONB DEFAULT '[]'::jsonb;

ALTER TABLE canonical_targets
  ADD COLUMN IF NOT EXISTS ignored_selectors TEXT DEFAULT '';

-- Index for change querying with filters
CREATE INDEX IF NOT EXISTS idx_detected_changes_query ON detected_changes(monitor_id, is_reviewed, detected_at DESC);
