-- Migration 002: Monitoring Engine Fields & Scheduler Support
ALTER TABLE monitors 
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_check_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS is_checking BOOLEAN NOT NULL DEFAULT false;

-- Index for scheduler poll queries
CREATE INDEX IF NOT EXISTS idx_monitors_scheduler ON monitors(is_active, is_checking, next_check_at);
