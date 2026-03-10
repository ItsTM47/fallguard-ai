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
  mlflowResult
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
      const normalizedMetadata = toJsonObject(metadata);
      const requestPayloadSnapshot = sanitizeRequestPayload(requestPayload);

      const insertEvent = await client.query(
        `
          INSERT INTO event_records (
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
            line_success,
            line_status_code,
            line_error_message,
            line_response_body,
            relay_version,
            mlflow_run_id
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, $15, $16, $17, $18
          )
          RETURNING id
        `,
        [
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
          Boolean(lineSuccess),
          lineStatusCode,
          lineErrorMessage || null,
          lineResponseBody || null,
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
            channel,
            target_id,
            success,
            status_code,
            error_message,
            provider_response,
            requested_payload,
            latency_ms
          )
          VALUES ($1, 'line', $2, $3, $4, $5, $6, $7::jsonb, $8)
        `,
        [
          eventId,
          relayConfig.targetUserId || null,
          Boolean(lineSuccess),
          lineStatusCode,
          lineErrorMessage || null,
          lineResponseBody || null,
          JSON.stringify(requestPayloadSnapshot),
          elapsedMs ?? null
        ]
      );

      return { saved: true, eventId };
    });
  } catch (error) {
    console.error(`Postgres logging failed: ${error.message || 'unknown error'}`);
    return { saved: false, reason: error.message || 'unknown error' };
  }
};
