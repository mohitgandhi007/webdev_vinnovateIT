-- Migration 006: Optional Numerical Value Tracking Over Time
ALTER TABLE monitors
  ADD COLUMN IF NOT EXISTS numeric_selector VARCHAR(255),
  ADD COLUMN IF NOT EXISTS numeric_unit VARCHAR(50);

CREATE TABLE IF NOT EXISTS numeric_metric_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_id UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  snapshot_id UUID REFERENCES snapshots(id) ON DELETE SET NULL,
  raw_text TEXT NOT NULL,
  parsed_value NUMERIC(16, 4),
  unit_or_currency VARCHAR(50),
  is_valid BOOLEAN NOT NULL DEFAULT true,
  error_reason VARCHAR(255),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_numeric_series_monitor 
  ON numeric_metric_series(monitor_id, captured_at ASC);

CREATE INDEX IF NOT EXISTS idx_numeric_series_snapshot 
  ON numeric_metric_series(snapshot_id);
