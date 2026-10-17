-- Migration 005: Notification Delivery & Destinations Enhancements

ALTER TABLE notification_destinations
  ADD COLUMN IF NOT EXISTS name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS triggers JSONB DEFAULT '{"on_change": true, "on_high_importance": false, "on_failure": false, "keywords": []}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE notification_deliveries
  ALTER COLUMN detected_change_id DROP NOT NULL;

ALTER TABLE notification_deliveries
  ADD COLUMN IF NOT EXISTS monitor_id UUID REFERENCES monitors(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS dedup_key VARCHAR(255),
  ADD COLUMN IF NOT EXISTS trigger_type VARCHAR(50) DEFAULT 'change',
  ADD COLUMN IF NOT EXISTS payload JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_retries INT DEFAULT 3,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_deliveries_dedup ON notification_deliveries (dedup_key);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_status ON notification_deliveries (status);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_dest ON notification_deliveries (destination_id, created_at DESC);

ALTER TABLE monitors
  ADD COLUMN IF NOT EXISTS notification_settings JSONB DEFAULT '{"notify_on_change": true, "notify_on_failure": false, "keywords": []}'::jsonb;
