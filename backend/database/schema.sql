CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Bangkok',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cameras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  location_name TEXT,
  stream_source TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS person_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
  external_id TEXT,
  label TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (site_id, external_id)
);

CREATE TABLE IF NOT EXISTS notification_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL DEFAULT 'line',
  target_id TEXT NOT NULL,
  display_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (channel, target_id)
);

CREATE TABLE IF NOT EXISTS event_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
  camera_id UUID REFERENCES cameras(id) ON DELETE SET NULL,
  person_profile_id UUID REFERENCES person_profiles(id) ON DELETE SET NULL,
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
  relay_version TEXT,
  mlflow_run_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  notification_target_id UUID REFERENCES notification_targets(id) ON DELETE SET NULL,
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

CREATE TABLE IF NOT EXISTS mlflow_run_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES event_records(id) ON DELETE SET NULL,
  run_id TEXT UNIQUE,
  experiment_name TEXT,
  tracking_uri TEXT,
  run_status TEXT,
  line_push_success BOOLEAN,
  has_image BOOLEAN,
  line_image_message BOOLEAN,
  image_artifact_uploaded BOOLEAN,
  confidence_pct NUMERIC(5,2),
  image_payload_kb NUMERIC(10,2),
  params_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  metrics_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  tags_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS relay_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  event_id UUID REFERENCES event_records(id) ON DELETE SET NULL,
  request_path TEXT,
  method TEXT,
  status_code INTEGER,
  success BOOLEAN,
  error_message TEXT,
  remote_ip TEXT,
  request_body_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_records_occurred_at ON event_records (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_records_event_type ON event_records (event_type);
CREATE INDEX IF NOT EXISTS idx_event_records_person_label ON event_records (person_label);
CREATE INDEX IF NOT EXISTS idx_event_records_location_name ON event_records (location_name);
CREATE UNIQUE INDEX IF NOT EXISTS ux_cameras_site_name ON cameras (site_id, name);
CREATE INDEX IF NOT EXISTS idx_event_images_event_id ON event_images (event_id);
CREATE INDEX IF NOT EXISTS idx_alert_deliveries_event_id ON alert_deliveries (event_id);
CREATE INDEX IF NOT EXISTS idx_alert_deliveries_notification_target_id ON alert_deliveries (notification_target_id);
CREATE INDEX IF NOT EXISTS idx_alert_deliveries_attempted_at ON alert_deliveries (attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_mlflow_run_logs_event_id ON mlflow_run_logs (event_id);
CREATE INDEX IF NOT EXISTS idx_mlflow_run_logs_logged_at ON mlflow_run_logs (logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_relay_audit_logs_created_at ON relay_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_relay_audit_logs_event_id ON relay_audit_logs (event_id);

ALTER TABLE alert_deliveries
ADD COLUMN IF NOT EXISTS notification_target_id UUID REFERENCES notification_targets(id) ON DELETE SET NULL;

ALTER TABLE relay_audit_logs
ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES event_records(id) ON DELETE SET NULL;

DROP TRIGGER IF EXISTS trg_sites_updated_at ON sites;
CREATE TRIGGER trg_sites_updated_at BEFORE UPDATE ON sites
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_cameras_updated_at ON cameras;
CREATE TRIGGER trg_cameras_updated_at BEFORE UPDATE ON cameras
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_person_profiles_updated_at ON person_profiles;
CREATE TRIGGER trg_person_profiles_updated_at BEFORE UPDATE ON person_profiles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_notification_targets_updated_at ON notification_targets;
CREATE TRIGGER trg_notification_targets_updated_at BEFORE UPDATE ON notification_targets
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_event_records_updated_at ON event_records;
CREATE TRIGGER trg_event_records_updated_at BEFORE UPDATE ON event_records
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO sites (code, name)
VALUES ('default', 'Default Site')
ON CONFLICT (code) DO NOTHING;
