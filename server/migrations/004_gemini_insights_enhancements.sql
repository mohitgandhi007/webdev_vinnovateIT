-- Migration 004: Enhance AI Insights schema for Gemini-Powered Change Intelligence

ALTER TABLE ai_insights
ADD COLUMN IF NOT EXISTS title VARCHAR(255),
ADD COLUMN IF NOT EXISTS summary TEXT,
ADD COLUMN IF NOT EXISTS importance VARCHAR(20) DEFAULT 'medium',
ADD COLUMN IF NOT EXISTS evidence JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'completed',
ADD COLUMN IF NOT EXISTS raw_response JSONB,
ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Prevent duplicate AI insights for the same detected change record
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_insights_change_unique ON ai_insights(detected_change_id);
