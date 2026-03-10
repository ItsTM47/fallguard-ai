import path from 'node:path';
import { createHash } from 'node:crypto';
import { withTransaction, isDatabaseEnabled } from './connection.mjs';
import { parseImageDataUrl } from '../api/services/imageService.mjs';
import { relayConfig, projectRoot } from '../api/config/env.mjs';

const toNumericOrNull = (value) => {
  const num = Number.parseFloat(String(value));
  return Number.isFinite(num) ? num : null;
};

const normalizeConfidencePct = (value, fallbackMessage = '') => {
  const fromValue = toNumericOrNull(value);
  if (fromValue !== null) {
    return fromValue <= 1 ? fromValue * 100 : fromValue;
  }

  const match = fallbackMessage.match(/ความมั่นใจ:\s*([0-9]+(?:\.[0-9]+)?)%/);
  return match ? toNumericOrNull(match[1]) : null;
};

const deriveEventType = (metadata, message) => {
  const allowed = new Set(['fall_alert', 'near_fall', 'test_alert', 'manual_alert', 'webhook']);
  const fromMetadata = typeof metadata?.eventType === 'string' ? metadata.eventType.trim() : '';
  if (fromMetadata && allowed.has(fromMetadata)) return fromMetadata;
  if (message.includes('FALL DETECTED')) return 'fall_alert';
  return 'webhook';
};

const deriveOccurredAt = (metadata) => {
  const raw = metadata?.timestamp;
  if (typeof raw === 'string' || typeof raw === 'number') {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
};

const buildImageMeta = (imageDataUrl) => {
  if (!imageDataUrl) return null;

  try {
    const parsed = parseImageDataUrl(imageDataUrl);
    const imageBuffer = Buffer.from(parsed.base64Data, 'base64');
    const sha256 = createHash('sha256').update(imageBuffer).digest('hex');
    return {
      mime: parsed.mime,
      bytes: imageBuffer.byteLength,
      sha256
    };
  } catch {
    return null;
  }
};

const toJsonObject = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
};

const sanitizeRequestPayload = (payload) => {
  const base = toJsonObject(payload);
  const snapshot = { ...base };

  if (typeof snapshot.image === 'string') {
    snapshot.image = `[base64 image omitted, length=${snapshot.image.length}]`;
  }

  return snapshot;
};

const ensureDefaultSiteId = async (client) => {
  const existing = await client.query(
    `
      SELECT id
      FROM sites
      WHERE code = 'default'
      LIMIT 1
    `
  );
  if (existing.rowCount > 0) return existing.rows[0].id;

  const inserted = await client.query(
    `
      INSERT INTO sites (code, name)
      VALUES ('default', 'Default Site')
      ON CONFLICT (code) DO UPDATE SET
        name = EXCLUDED.name
      RETURNING id
    `
  );
  return inserted.rows[0].id;
};

const ensureCameraId = async (client, siteId, locationName) => {
  const normalizedLocation = typeof locationName === 'string' ? locationName.trim() : '';
  if (!normalizedLocation) return null;

  const result = await client.query(
    `
      INSERT INTO cameras (site_id, name, location_name, is_active)
      VALUES ($1, $2, $3, TRUE)
      ON CONFLICT (site_id, name) DO UPDATE SET
        location_name = EXCLUDED.location_name,
        is_active = TRUE,
        updated_at = NOW()
      RETURNING id
    `,
    [siteId, normalizedLocation, normalizedLocation]
  );
  return result.rows[0].id;
};

const ensurePersonProfileId = async (client, siteId, personId, personLabel) => {
  const normalizedPersonId = typeof personId === 'string' ? personId.trim() : '';
  if (!normalizedPersonId) return null;

  const normalizedLabel = typeof personLabel === 'string' && personLabel.trim()
    ? personLabel.trim()
    : normalizedPersonId;

  const result = await client.query(
    `
      INSERT INTO person_profiles (site_id, external_id, label, is_active)
      VALUES ($1, $2, $3, TRUE)
      ON CONFLICT (site_id, external_id) DO UPDATE SET
        label = EXCLUDED.label,
        is_active = TRUE,
        updated_at = NOW()
      RETURNING id
    `,
    [siteId, normalizedPersonId, normalizedLabel]
  );
  return result.rows[0].id;
};

const ensureNotificationTargetId = async (client, targetId) => {
  const normalizedTargetId = typeof targetId === 'string' ? targetId.trim() : '';
  if (!normalizedTargetId) return null;

  const result = await client.query(
    `
      INSERT INTO notification_targets (channel, target_id, display_name, is_active)
      VALUES ('line', $1, 'Primary LINE target', TRUE)
      ON CONFLICT (channel, target_id) DO UPDATE SET
        is_active = TRUE,
        updated_at = NOW()
      RETURNING id
    `,
    [normalizedTargetId]
  );
  return result.rows[0].id;
};

export const persistWebhookEvent = async ({
  message,
  metadata,
  imageDataUrl,
  imageMessageIncluded,
  savedImageFilename,
  savedImageUrl,
  lineSuccess,
  lineStatusCode,
  lineErrorMessage,
  lineResponseBody,
  requestPayload,
  elapsedMs,
  mlflowResult,
  requestPath,
  method,
  remoteIp
}) => {
  if (!isDatabaseEnabled()) {
    return { saved: false, reason: 'disabled' };
  }

  try {
    return await withTransaction(async (client) => {
      const eventType = deriveEventType(metadata, message);
      const occurredAt = deriveOccurredAt(metadata);
      const confidencePct = normalizeConfidencePct(metadata?.confidence, message);
      const imageMeta = buildImageMeta(imageDataUrl);
      const siteId = await ensureDefaultSiteId(client);
      const cameraId = await ensureCameraId(client, siteId, metadata?.location);
      const personProfileId = await ensurePersonProfileId(
        client,
        siteId,
        metadata?.personId,
        metadata?.personLabel
      );
      const notificationTargetId = await ensureNotificationTargetId(client, relayConfig.targetUserId);
      const normalizedMetadata = toJsonObject(metadata);
      const requestPayloadSnapshot = sanitizeRequestPayload(requestPayload);

      const insertEvent = await client.query(
        `
          INSERT INTO event_records (
            site_id,
            camera_id,
            person_profile_id,
            event_type,
            occurred_at,
            location_name,
            person_id,
            person_label,
            confidence_pct,
            reason,
            raw_message,
            metadata_json,
            has_image_payload,
            image_message_included,
            image_public_url,
            relay_version,
            mlflow_run_id
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12::jsonb, $13, $14, $15, $16, $17
          )
          RETURNING id
        `,
        [
          siteId,
          cameraId,
          personProfileId,
          eventType,
          occurredAt,
          metadata?.location || null,
          metadata?.personId || null,
          metadata?.personLabel || null,
          confidencePct,
          metadata?.reason || null,
          message,
          JSON.stringify(normalizedMetadata),
          Boolean(imageDataUrl),
          Boolean(imageMessageIncluded),
          savedImageUrl || null,
          relayConfig.relayAppVersion,
          mlflowResult?.runId || null
        ]
      );

      const eventId = insertEvent.rows[0].id;

      if (savedImageFilename) {
        const storagePath = path.relative(projectRoot, path.join(relayConfig.imageStorageDir, savedImageFilename));
        await client.query(
          `
            INSERT INTO event_images (
              event_id,
              filename,
              storage_path,
              public_url,
              mime_type,
              size_bytes,
              sha256
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          `,
          [
            eventId,
            savedImageFilename,
            storagePath,
            savedImageUrl || null,
            imageMeta?.mime || null,
            imageMeta?.bytes || null,
            imageMeta?.sha256 || null
          ]
        );
      }

      await client.query(
        `
          INSERT INTO alert_deliveries (
            event_id,
            notification_target_id,
            channel,
            target_id,
            success,
            status_code,
            error_message,
            provider_response,
            requested_payload,
            latency_ms
          )
          VALUES ($1, $2, 'line', $3, $4, $5, $6, $7, $8::jsonb, $9)
        `,
        [
          eventId,
          notificationTargetId,
          relayConfig.targetUserId || null,
          Boolean(lineSuccess),
          lineStatusCode,
          lineErrorMessage || null,
          lineResponseBody || null,
          JSON.stringify(requestPayloadSnapshot),
          elapsedMs ?? null
        ]
      );

      if (mlflowResult?.logged && mlflowResult?.runId) {
        await client.query(
          `
            INSERT INTO mlflow_run_logs (
              event_id,
              run_id,
              experiment_name,
              tracking_uri,
              run_status,
              line_push_success,
              has_image,
              line_image_message,
              image_artifact_uploaded,
              confidence_pct,
              image_payload_kb,
              params_json,
              metrics_json,
              tags_json
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14::jsonb
            )
            ON CONFLICT (run_id) DO UPDATE SET
              event_id = EXCLUDED.event_id,
              run_status = EXCLUDED.run_status,
              line_push_success = EXCLUDED.line_push_success,
              has_image = EXCLUDED.has_image,
              line_image_message = EXCLUDED.line_image_message,
              image_artifact_uploaded = EXCLUDED.image_artifact_uploaded,
              confidence_pct = EXCLUDED.confidence_pct,
              image_payload_kb = EXCLUDED.image_payload_kb,
              params_json = EXCLUDED.params_json,
              metrics_json = EXCLUDED.metrics_json,
              tags_json = EXCLUDED.tags_json,
              logged_at = NOW()
          `,
          [
            eventId,
            mlflowResult.runId,
            mlflowResult.experimentName,
            mlflowResult.trackingUri,
            mlflowResult.runStatus,
            mlflowResult.linePushSuccess,
            mlflowResult.hasImage,
            mlflowResult.lineImageMessage,
            mlflowResult.imageArtifactUploaded,
            mlflowResult.confidencePct,
            mlflowResult.imagePayloadKb,
            JSON.stringify(toJsonObject(mlflowResult.params)),
            JSON.stringify(toJsonObject(mlflowResult.metrics)),
            JSON.stringify(toJsonObject(mlflowResult.tags))
          ]
        );
      }

      await client.query(
        `
          INSERT INTO relay_audit_logs (
            event_id,
            request_path,
            method,
            status_code,
            success,
            error_message,
            remote_ip,
            request_body_json
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
        `,
        [
          eventId,
          requestPath || null,
          method || null,
          lineStatusCode ?? null,
          Boolean(lineSuccess),
          lineErrorMessage || null,
          remoteIp || null,
          JSON.stringify(requestPayloadSnapshot)
        ]
      );

      return { saved: true, eventId };
    });
  } catch (error) {
    console.error(`Postgres logging failed: ${error.message || 'unknown error'}`);
    return { saved: false, reason: error.message || 'unknown error' };
  }
};
