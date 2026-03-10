CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS event_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL CHECK (event_type IN ('fall_alert', 'near_fall', 'test_alert', 'manual_alert', 'webhook')),
  occurred_at TIMESTAMPTZ NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  location_name TEXT,
  person_id TEXT,
  person_label TEXT,
  confidence_pct NUMERIC(5,2),
  reason TEXT,
  raw_message TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  has_image_payload BOOLEAN NOT NULL DEFAULT FALSE,
  image_message_included BOOLEAN NOT NULL DEFAULT FALSE,
  image_public_url TEXT,
  line_success BOOLEAN,
  line_status_code INTEGER,
  line_error_message TEXT,
  line_response_body TEXT,
  relay_version TEXT,
  mlflow_run_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS event_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES event_records(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  public_url TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  sha256 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alert_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES event_records(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'line',
  target_id TEXT,
  success BOOLEAN NOT NULL,
  status_code INTEGER,
  error_message TEXT,
  provider_response TEXT,
  requested_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  latency_ms INTEGER,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_records_occurred_at ON event_records (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_records_event_type ON event_records (event_type);
CREATE INDEX IF NOT EXISTS idx_event_records_location_name ON event_records (location_name);
CREATE INDEX IF NOT EXISTS idx_event_records_person_label ON event_records (person_label);
CREATE INDEX IF NOT EXISTS idx_event_images_event_id ON event_images (event_id);
CREATE INDEX IF NOT EXISTS idx_alert_deliveries_event_id ON alert_deliveries (event_id);
CREATE INDEX IF NOT EXISTS idx_alert_deliveries_attempted_at ON alert_deliveries (attempted_at DESC);

ALTER TABLE event_records
ADD COLUMN IF NOT EXISTS line_success BOOLEAN,
ADD COLUMN IF NOT EXISTS line_status_code INTEGER,
ADD COLUMN IF NOT EXISTS line_error_message TEXT,
ADD COLUMN IF NOT EXISTS line_response_body TEXT,
ADD COLUMN IF NOT EXISTS relay_version TEXT,
ADD COLUMN IF NOT EXISTS mlflow_run_id TEXT;

ALTER TABLE alert_deliveries
DROP COLUMN IF EXISTS notification_target_id;

DROP TABLE IF EXISTS mlflow_run_logs CASCADE;
DROP TABLE IF EXISTS relay_audit_logs CASCADE;
DROP TABLE IF EXISTS notification_targets CASCADE;
DROP TABLE IF EXISTS person_profiles CASCADE;
DROP TABLE IF EXISTS cameras CASCADE;
DROP TABLE IF EXISTS sites CASCADE;
DROP TABLE IF EXISTS system_settings CASCADE;
