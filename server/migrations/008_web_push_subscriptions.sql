-- Migration 008: Web Push Subscriptions for Real-Time Browser Notifications

CREATE TABLE IF NOT EXISTS web_push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active', 'revoked', 'expired'
    preferences JSONB NOT NULL DEFAULT '{"notify_on_change": true, "notify_on_failure": false, "importance": "all"}'::jsonb,
    user_agent TEXT,
    failure_count INT NOT NULL DEFAULT 0,
    last_failure_at TIMESTAMPTZ,
    failure_reason TEXT,
    last_successful_delivery_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(endpoint)
);

CREATE INDEX IF NOT EXISTS idx_web_push_status ON web_push_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_web_push_workspace ON web_push_subscriptions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_web_push_created ON web_push_subscriptions(created_at DESC);

-- Allow notification_deliveries to support Web Push deliveries without destination_id
ALTER TABLE notification_deliveries
    ALTER COLUMN destination_id DROP NOT NULL;

ALTER TABLE notification_deliveries
    ADD COLUMN IF NOT EXISTS web_push_subscription_id UUID REFERENCES web_push_subscriptions(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_web_push ON notification_deliveries (web_push_subscription_id, created_at DESC);
