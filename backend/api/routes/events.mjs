import { isDatabaseEnabled, query } from '../../database/connection.mjs';
import { relayConfig } from '../config/env.mjs';
import { sendJson } from '../utils/http.mjs';

const EVENT_PATHS = new Set(['/api/events', '/events']);
const ALLOWED_EVENT_TYPES = new Set(['fall_alert', 'near_fall', 'test_alert', 'manual_alert', 'webhook']);

const toIsoIfValid = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
};

const toIntegerInRange = (value, fallback, min, max) => {
  const num = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
};

const getRequestOrigin = (req) => {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const proto = typeof forwardedProto === 'string' && forwardedProto.trim()
    ? forwardedProto.split(',')[0].trim()
    : (req.socket?.encrypted ? 'https' : 'http');

  const forwardedHost = req.headers['x-forwarded-host'];
  const hostHeader = typeof forwardedHost === 'string' && forwardedHost.trim()
    ? forwardedHost.split(',')[0].trim()
    : req.headers.host;
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;

  if (!host) return '';
  return `${proto}://${host}`;
};

export const handleEventsRoute = async (req, res, method, requestPath) => {
  if (method !== 'GET' || !EVENT_PATHS.has(requestPath)) return false;

  if (!isDatabaseEnabled()) {
    sendJson(res, 503, {
      success: false,
      message: 'Database is disabled. Set DATABASE_ENABLED=true and DATABASE_URL.'
    });
    return true;
  }

  try {
    const url = new URL(req.url || '/api/events', 'http://localhost');
    const search = url.searchParams;

    const limit = toIntegerInRange(search.get('limit'), 500, 1, 2000);
    const days = toIntegerInRange(search.get('days'), 0, 0, 3650);

    const fromParam = toIsoIfValid(search.get('from'));
    const toParam = toIsoIfValid(search.get('to'));

    const eventTypeRaw = (search.get('eventType') || '').trim();
    const eventType = ALLOWED_EVENT_TYPES.has(eventTypeRaw) ? eventTypeRaw : '';

    const whereClauses = [];
    const params = [getRequestOrigin(req), relayConfig.imageRoutePrefix];
    let index = params.length + 1;

    if (eventType) {
      whereClauses.push(`e.event_type = $${index}`);
      params.push(eventType);
      index += 1;
    }

    if (fromParam) {
      whereClauses.push(`e.occurred_at >= $${index}::timestamptz`);
      params.push(fromParam);
      index += 1;
    } else if (days > 0) {
      const fromByDays = new Date(Date.now() - (days * 24 * 60 * 60 * 1000)).toISOString();
      whereClauses.push(`e.occurred_at >= $${index}::timestamptz`);
      params.push(fromByDays);
      index += 1;
    }

    if (toParam) {
      whereClauses.push(`e.occurred_at <= $${index}::timestamptz`);
      params.push(toParam);
      index += 1;
    }

    params.push(limit);
    const limitIndex = params.length;
    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const sql = `
      SELECT
        e.id,
        e.event_type,
        e.occurred_at,
        (EXTRACT(EPOCH FROM e.occurred_at) * 1000)::bigint AS timestamp_ms,
        e.location_name,
        e.person_id,
        e.person_label,
        e.confidence_pct,
        e.reason,
        e.raw_message,
        e.metadata_json,
        e.has_image_payload,
        e.image_message_included,
        COALESCE(
          NULLIF(e.image_public_url, ''),
          NULLIF(img.public_url, ''),
          CASE
            WHEN img.filename IS NOT NULL AND $1 <> ''
              THEN $1 || $2 || img.filename
            ELSE NULL
          END
        ) AS screenshot_url
      FROM event_records e
      LEFT JOIN LATERAL (
        SELECT filename, public_url
        FROM event_images i
        WHERE i.event_id = e.id
        ORDER BY i.created_at DESC
        LIMIT 1
      ) img ON TRUE
      ${whereSql}
      ORDER BY e.occurred_at DESC
      LIMIT $${limitIndex}
    `;

    const result = await query(sql, params);
    const events = result.rows.map((row) => {
      const timestamp = Number.parseInt(String(row.timestamp_ms), 10);
      const confidencePct = row.confidence_pct !== null ? Number.parseFloat(String(row.confidence_pct)) : null;

      return {
        id: row.id,
        eventType: row.event_type,
        timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
        occurredAt: row.occurred_at,
        location: row.location_name || '',
        personId: row.person_id || '',
        personLabel: row.person_label || '',
        confidencePct: confidencePct !== null && Number.isFinite(confidencePct) ? confidencePct : null,
        reason: row.reason || '',
        rawMessage: row.raw_message || '',
        metadata: row.metadata_json && typeof row.metadata_json === 'object' ? row.metadata_json : {},
        hasImagePayload: Boolean(row.has_image_payload),
        imageMessageIncluded: Boolean(row.image_message_included),
        screenshotUrl: row.screenshot_url || ''
      };
    });

    sendJson(res, 200, {
      success: true,
      count: events.length,
      events
    });
    return true;
  } catch (error) {
    sendJson(res, 500, {
      success: false,
      message: `Failed to load events: ${error.message || 'unknown error'}`
    });
    return true;
  }
};
