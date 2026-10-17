-- Schema Migrations Tracking Table
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1. Workspaces
CREATE TABLE IF NOT EXISTS workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Canonical Target Registry (Shared fetch deduplication pool)
CREATE TABLE IF NOT EXISTS canonical_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    normalized_url TEXT NOT NULL,
    url_hash CHAR(64) NOT NULL,
    css_selector TEXT DEFAULT '',
    viewport_width INT NOT NULL DEFAULT 1440,
    viewport_height INT NOT NULL DEFAULT 900,
    last_fetched_at TIMESTAMPTZ,
    last_fetch_status VARCHAR(50) DEFAULT 'unpolled',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(url_hash, css_selector, viewport_width, viewport_height)
);
CREATE INDEX IF NOT EXISTS idx_canonical_targets_hash ON canonical_targets(url_hash);

-- 3. Monitors (Tenant & Workspace Specific Configurations)
CREATE TABLE IF NOT EXISTS monitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    canonical_target_id UUID NOT NULL REFERENCES canonical_targets(id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    mode VARCHAR(20) NOT NULL DEFAULT 'both',
    check_cadence VARCHAR(20) NOT NULL DEFAULT '15m',
    css_selector TEXT DEFAULT '',
    noise_threshold_percent INT NOT NULL DEFAULT 5,
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    previous_status VARCHAR(30) DEFAULT 'healthy',
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_reviewed BOOLEAN NOT NULL DEFAULT true,
    last_checked_at TIMESTAMPTZ,
    last_change_at TIMESTAMPTZ,
    last_change_summary TEXT,
    consecutive_failures INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_cadence CHECK (check_cadence IN ('15m', '30m', '1h', '6h', '12h', '24h')),
    CONSTRAINT chk_mode CHECK (mode IN ('text', 'visual', 'both'))
);
CREATE INDEX IF NOT EXISTS idx_monitors_workspace ON monitors(workspace_id);
CREATE INDEX IF NOT EXISTS idx_monitors_status ON monitors(status);
CREATE INDEX IF NOT EXISTS idx_monitors_active ON monitors(is_active);

-- 4. Captured Snapshots (Immutable Time-Series Record)
CREATE TABLE IF NOT EXISTS snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_target_id UUID NOT NULL REFERENCES canonical_targets(id) ON DELETE CASCADE,
    scan_number INT NOT NULL,
    http_status_code INT,
    response_time_ms INT,
    text_content TEXT,
    text_hash CHAR(64) NOT NULL,
    screenshot_path TEXT,
    screenshot_hash CHAR(64),
    dom_node_count INT DEFAULT 0,
    status_category VARCHAR(50) NOT NULL DEFAULT 'NOMINAL_CLEAN',
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_snapshots_target_captured ON snapshots(canonical_target_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_text_hash ON snapshots(text_hash);

-- 5. Detected Changes
CREATE TABLE IF NOT EXISTS detected_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    monitor_id UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
    baseline_snapshot_id UUID NOT NULL REFERENCES snapshots(id) ON DELETE RESTRICT,
    current_snapshot_id UUID NOT NULL REFERENCES snapshots(id) ON DELETE RESTRICT,
    change_type VARCHAR(50) NOT NULL DEFAULT 'content',
    title VARCHAR(255) NOT NULL,
    description TEXT,
    dom_nodes_modified INT DEFAULT 0,
    text_diff_json JSONB,
    visual_diff_percent NUMERIC(5,2),
    diff_overlay_path TEXT,
    is_reviewed BOOLEAN NOT NULL DEFAULT false,
    reviewed_at TIMESTAMPTZ,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_changes_monitor ON detected_changes(monitor_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_changes_reviewed ON detected_changes(is_reviewed);

-- 6. AI Intelligence Dispatches
CREATE TABLE IF NOT EXISTS ai_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    detected_change_id UUID NOT NULL REFERENCES detected_changes(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    headline VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'General',
    impact_level VARCHAR(20) NOT NULL DEFAULT 'medium',
    observed_facts JSONB NOT NULL DEFAULT '[]'::jsonb,
    business_inference TEXT NOT NULL DEFAULT '',
    executive_summary TEXT NOT NULL DEFAULT '',
    model_version VARCHAR(50) NOT NULL DEFAULT 'gemini-2.5-flash',
    prompt_tokens INT DEFAULT 0,
    completion_tokens INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_insights_workspace ON ai_insights(workspace_id, created_at DESC);

-- 7. Notification Destinations
CREATE TABLE IF NOT EXISTS notification_destinations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    channel VARCHAR(30) NOT NULL,
    target_destination TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Notification Delivery Logs
CREATE TABLE IF NOT EXISTS notification_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    destination_id UUID NOT NULL REFERENCES notification_destinations(id) ON DELETE CASCADE,
    detected_change_id UUID NOT NULL REFERENCES detected_changes(id) ON DELETE CASCADE,
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    http_status_code INT,
    error_message TEXT,
    attempt_count INT NOT NULL DEFAULT 1,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
