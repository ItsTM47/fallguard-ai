import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

const loadEnvFile = (filename) => {
  const filePath = path.join(projectRoot, filename);
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf8');
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) return;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
};

// Load local env first, then fallback env file.
loadEnvFile('.env.local');
loadEnvFile('.env');

const parseBooleanEnv = (value, defaultValue = false) => {
  if (value === undefined || value === null || value === '') return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
};

const PORT = Number.parseInt(process.env.LINE_RELAY_PORT || '8787', 10);
const MAX_BODY_BYTES = Number.parseInt(process.env.LINE_MAX_BODY_BYTES || '8000000', 10);
const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';
const IMAGE_ROUTE_PREFIX = '/images/';

const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
const targetUserId = process.env.LINE_TARGET_USER_ID || '';
const relaySecret = process.env.LINE_RELAY_SECRET || '';
const imageStorageDir = path.resolve(projectRoot, process.env.LINE_IMAGE_STORAGE_DIR || 'backend/uploads');
const publicBaseUrl = (process.env.LINE_PUBLIC_BASE_URL || '').replace(/\/$/, '');
const isPublicBaseUrlHttps = publicBaseUrl.startsWith('https://');
const imageRetentionHours = Number.parseFloat(process.env.LINE_IMAGE_RETENTION_HOURS || '24');
const imageCleanupIntervalSeconds = Number.parseInt(process.env.LINE_IMAGE_CLEANUP_INTERVAL_SECONDS || '300', 10);
const imageMaxFiles = Number.parseInt(process.env.LINE_IMAGE_MAX_FILES || '500', 10);
const mlflowTrackingUri = (process.env.MLFLOW_TRACKING_URI || '').replace(/\/$/, '');
const mlflowExperimentName = process.env.MLFLOW_EXPERIMENT_NAME || 'fallguard-alerts';
const mlflowTrackingToken = process.env.MLFLOW_TRACKING_TOKEN || '';
const mlflowTrackingUsername = process.env.MLFLOW_TRACKING_USERNAME || '';
const mlflowTrackingPassword = process.env.MLFLOW_TRACKING_PASSWORD || '';
const mlflowEnabled = !!mlflowTrackingUri;
const relayAppVersion = process.env.RELAY_APP_VERSION || process.env.npm_package_version || 'dev';
const relayGitSha = process.env.RELAY_GIT_SHA || process.env.GIT_SHA || '';
const mlflowLogImageArtifact = parseBooleanEnv(process.env.MLFLOW_LOG_IMAGE_ARTIFACT, false);
const mlflowImageArtifactPath = (process.env.MLFLOW_IMAGE_ARTIFACT_PATH || 'event-images').replace(/^\/+|\/+$/g, '');
const mlflowImageArtifactMaxBytes = Number.parseInt(process.env.MLFLOW_IMAGE_ARTIFACT_MAX_BYTES || '2000000', 10);
const publicBaseHost = (() => {
  if (!publicBaseUrl) return '';
  try {
    return new URL(publicBaseUrl).host;
  } catch {
    return '';
  }
})();

let mlflowExperimentIdCache = '';

fs.mkdirSync(imageStorageDir, { recursive: true });

const sendJson = (res, statusCode, payload) => {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Relay-Secret'
  });
  res.end(JSON.stringify(payload));
};

const parseBody = (req) => new Promise((resolve, reject) => {
  let data = '';
  req.on('data', (chunk) => {
    data += chunk;
    if (data.length > MAX_BODY_BYTES) {
      reject(new Error('Payload too large'));
      req.destroy();
    }
  });
  req.on('end', () => {
    if (!data) {
      resolve({});
      return;
    }
    try {
      resolve(JSON.parse(data));
    } catch {
      reject(new Error('Invalid JSON'));
    }
  });
  req.on('error', reject);
});

const getContentTypeFromExt = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
};

const isImageFile = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  return ext === '.jpg' || ext === '.jpeg' || ext === '.png' || ext === '.webp';
};

const cleanupImageStorage = () => {
  const retentionMs = Math.max(imageRetentionHours, 0) * 60 * 60 * 1000;
  const now = Date.now();

  let files = [];
  try {
    files = fs.readdirSync(imageStorageDir)
      .filter(isImageFile)
      .map((name) => {
        const absolutePath = path.join(imageStorageDir, name);
        const stat = fs.statSync(absolutePath);
        return {
          name,
          absolutePath,
          mtimeMs: stat.mtimeMs
        };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
  } catch (error) {
    console.error(`Cleanup scan failed: ${error.message || 'unknown error'}`);
    return;
  }

  for (const file of files) {
    const isExpired = retentionMs > 0 && (now - file.mtimeMs) > retentionMs;
    if (isExpired) {
      try {
        fs.unlinkSync(file.absolutePath);
      } catch (error) {
        console.error(`Failed to delete old image ${file.name}: ${error.message || 'unknown error'}`);
      }
    }
  }

  if (imageMaxFiles > 0) {
    try {
      files = fs.readdirSync(imageStorageDir)
        .filter(isImageFile)
        .map((name) => {
          const absolutePath = path.join(imageStorageDir, name);
          const stat = fs.statSync(absolutePath);
          return {
            name,
            absolutePath,
            mtimeMs: stat.mtimeMs
          };
        })
        .sort((a, b) => b.mtimeMs - a.mtimeMs);
    } catch (error) {
      console.error(`Cleanup overflow scan failed: ${error.message || 'unknown error'}`);
      return;
    }

    const overflow = files.slice(imageMaxFiles);
    for (const file of overflow) {
      try {
        fs.unlinkSync(file.absolutePath);
      } catch (error) {
        console.error(`Failed to delete overflow image ${file.name}: ${error.message || 'unknown error'}`);
      }
    }
  }
};

const parseImageDataUrl = (dataUrl) => {
  const match = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl);
  if (!match) {
    throw new Error('Unsupported image format. Use jpeg/png/webp base64 data URL.');
  }

  const mime = match[1].toLowerCase();
  const base64Data = match[2];
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
  return { mime, base64Data, ext };
};

const saveDataUrlImage = (dataUrl) => {
  const { base64Data, ext } = parseImageDataUrl(dataUrl);
  const filename = `${Date.now()}-${randomUUID()}.${ext}`;
  const absolutePath = path.join(imageStorageDir, filename);

  fs.writeFileSync(absolutePath, Buffer.from(base64Data, 'base64'));
  return filename;
};

const buildLineMessages = (message, imageDataUrl) => {
  let textMessage = message;
  const messages = [];

  if (imageDataUrl) {
    if (!publicBaseUrl) {
      textMessage += '\n\n(มีภาพเหตุการณ์ แต่ยังไม่ตั้ง LINE_PUBLIC_BASE_URL สำหรับส่งภาพ)';
    } else if (!isPublicBaseUrlHttps) {
      textMessage += '\n\n(มีภาพเหตุการณ์ แต่ LINE ต้องใช้ URL แบบ HTTPS)';
    } else {
      const filename = saveDataUrlImage(imageDataUrl);
      const imageUrl = `${publicBaseUrl}${IMAGE_ROUTE_PREFIX}${filename}`;
      messages.push({
        type: 'image',
        originalContentUrl: imageUrl,
        previewImageUrl: imageUrl
      });
    }
  }

  messages.unshift({
    type: 'text',
    text: textMessage.slice(0, 5000)
  });

  return messages;
};

const toMlflowString = (value) => {
  if (value === undefined || value === null) return '';
  return String(value).slice(0, 500);
};

const parseConfidencePct = (message) => {
  const match = message.match(/ความมั่นใจ:\s*([0-9]+(?:\.[0-9]+)?)%/);
  if (!match) return null;
  const value = Number.parseFloat(match[1]);
  return Number.isFinite(value) ? value : null;
};

const getMlflowAuthHeaders = () => {
  const headers = {};
  if (mlflowTrackingToken) {
    headers.Authorization = `Bearer ${mlflowTrackingToken}`;
    return headers;
  }

  if (mlflowTrackingUsername && mlflowTrackingPassword) {
    const basicToken = Buffer
      .from(`${mlflowTrackingUsername}:${mlflowTrackingPassword}`, 'utf8')
      .toString('base64');
    headers.Authorization = `Basic ${basicToken}`;
  }

  return headers;
};

const getMlflowJsonHeaders = () => ({
  'Content-Type': 'application/json',
  ...getMlflowAuthHeaders()
});

const mlflowRequest = async (method, endpoint, payload) => {
  const response = await fetch(`${mlflowTrackingUri}${endpoint}`, {
    method,
    headers: getMlflowJsonHeaders(),
    body: payload ? JSON.stringify(payload) : undefined
  });

  const raw = await response.text();
  let data = {};
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = { raw };
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    data
  };
};

const encodeArtifactPath = (artifactPath) => artifactPath
  .split('/')
  .map((segment) => encodeURIComponent(segment))
  .join('/');

const uploadMlflowArtifactBinary = async (runId, artifactPath, contentType, dataBuffer, runIdKey = 'run_id') => {
  const endpoint = `/api/2.0/mlflow-artifacts/artifacts/${encodeArtifactPath(artifactPath)}?${runIdKey}=${encodeURIComponent(runId)}`;
  const response = await fetch(`${mlflowTrackingUri}${endpoint}`, {
    method: 'PUT',
    headers: {
      ...getMlflowAuthHeaders(),
      'Content-Type': contentType
    },
    body: dataBuffer
  });

  const raw = await response.text();
  let data = {};
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = { raw };
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    data
  };
};

const uploadImageArtifactToMlflow = async (runId, imageDataUrl) => {
  const result = {
    uploaded: false,
    artifactPath: '',
    bytes: 0,
    skippedReason: '',
    error: ''
  };

  if (!mlflowLogImageArtifact) {
    result.skippedReason = 'disabled';
    return result;
  }
  if (!imageDataUrl) {
    result.skippedReason = 'no_image_payload';
    return result;
  }

  let parsed;
  try {
    parsed = parseImageDataUrl(imageDataUrl);
  } catch {
    result.skippedReason = 'invalid_image_data_url';
    return result;
  }

  const imageBuffer = Buffer.from(parsed.base64Data, 'base64');
  result.bytes = imageBuffer.byteLength;

  if (mlflowImageArtifactMaxBytes > 0 && result.bytes > mlflowImageArtifactMaxBytes) {
    result.skippedReason = `size_exceeded_${mlflowImageArtifactMaxBytes}`;
    return result;
  }

  const filename = `${Date.now()}-${randomUUID()}.${parsed.ext}`;
  const artifactPath = mlflowImageArtifactPath ? `${mlflowImageArtifactPath}/${filename}` : filename;
  result.artifactPath = artifactPath;

  const primary = await uploadMlflowArtifactBinary(runId, artifactPath, parsed.mime, imageBuffer, 'run_id');
  if (primary.ok) {
    result.uploaded = true;
    return result;
  }

  const fallback = await uploadMlflowArtifactBinary(runId, artifactPath, parsed.mime, imageBuffer, 'run_uuid');
  if (fallback.ok) {
    result.uploaded = true;
    return result;
  }

  result.error = `artifact upload failed (${primary.status}/${fallback.status})`;
  return result;
};

const getOrCreateMlflowExperimentId = async () => {
  if (!mlflowEnabled) return '';
  if (mlflowExperimentIdCache) return mlflowExperimentIdCache;

  const getByName = await mlflowRequest(
    'GET',
    `/api/2.0/mlflow/experiments/get-by-name?experiment_name=${encodeURIComponent(mlflowExperimentName)}`
  );

  if (getByName.ok && getByName.data?.experiment?.experiment_id) {
    mlflowExperimentIdCache = getByName.data.experiment.experiment_id;
    return mlflowExperimentIdCache;
  }

  if (!getByName.ok && getByName.status !== 404) {
    throw new Error(`MLflow get experiment failed: ${JSON.stringify(getByName.data)}`);
  }

  const createExp = await mlflowRequest('POST', '/api/2.0/mlflow/experiments/create', {
    name: mlflowExperimentName
  });

  if (createExp.ok && createExp.data?.experiment_id) {
    mlflowExperimentIdCache = createExp.data.experiment_id;
    return mlflowExperimentIdCache;
  }

  // If race condition happens and experiment already exists, read it again.
  const retryGetByName = await mlflowRequest(
    'GET',
    `/api/2.0/mlflow/experiments/get-by-name?experiment_name=${encodeURIComponent(mlflowExperimentName)}`
  );
  if (retryGetByName.ok && retryGetByName.data?.experiment?.experiment_id) {
    mlflowExperimentIdCache = retryGetByName.data.experiment.experiment_id;
    return mlflowExperimentIdCache;
  }

  throw new Error(`MLflow create experiment failed: ${JSON.stringify(createExp.data)}`);
};

const logWebhookEventToMlflow = async ({
  message,
  imageDataUrl,
  imageMessageIncluded,
  metadata,
  lineSuccess,
  lineStatusCode,
  lineErrorMessage
}) => {
  if (!mlflowEnabled) return;

  try {
    const experimentId = await getOrCreateMlflowExperimentId();
    if (!experimentId) return;

    const now = Date.now();
    const eventType = toMlflowString(metadata?.eventType || (message.includes('FALL DETECTED') ? 'fall_alert' : 'webhook'));
    const runTags = [
      { key: 'source', value: 'fallguard-relay' },
      { key: 'target_user', value: toMlflowString(targetUserId) },
      { key: 'event_type', value: eventType },
      { key: 'app_version', value: toMlflowString(relayAppVersion) },
      { key: 'image_artifact_enabled', value: mlflowLogImageArtifact ? 'true' : 'false' }
    ];
    if (relayGitSha) {
      runTags.push({ key: 'git_sha', value: toMlflowString(relayGitSha) });
    }
    const filteredRunTags = runTags.filter((item) => item.value !== '');

    const createRun = await mlflowRequest('POST', '/api/2.0/mlflow/runs/create', {
      experiment_id: experimentId,
      start_time: now,
      tags: filteredRunTags
    });

    const runId = createRun.data?.run?.info?.run_id;
    if (!createRun.ok || !runId) {
      throw new Error(`MLflow create run failed: ${JSON.stringify(createRun.data)}`);
    }

    const confidenceFromMetadata = Number.parseFloat(metadata?.confidence ?? '');
    const confidencePct = Number.isFinite(confidenceFromMetadata)
      ? confidenceFromMetadata
      : parseConfidencePct(message);
    const artifactResult = await uploadImageArtifactToMlflow(runId, imageDataUrl);

    const params = [
      { key: 'event_type', value: eventType },
      { key: 'metadata_timestamp', value: toMlflowString(metadata?.timestamp) },
      { key: 'location', value: toMlflowString(metadata?.location) },
      { key: 'person_id', value: toMlflowString(metadata?.personId) },
      { key: 'person_label', value: toMlflowString(metadata?.personLabel) },
      { key: 'line_status_code', value: toMlflowString(lineStatusCode) },
      { key: 'line_error', value: toMlflowString(lineErrorMessage) },
      { key: 'public_base_host', value: toMlflowString(publicBaseHost) },
      { key: 'public_base_https', value: isPublicBaseUrlHttps ? 'true' : 'false' },
      { key: 'image_artifact_path', value: toMlflowString(artifactResult.artifactPath) },
      { key: 'image_artifact_uploaded', value: artifactResult.uploaded ? 'true' : 'false' },
      { key: 'image_artifact_skip_reason', value: toMlflowString(artifactResult.skippedReason) },
      { key: 'image_artifact_error', value: toMlflowString(artifactResult.error) },
      { key: 'message_excerpt', value: toMlflowString(message.replace(/\s+/g, ' ').trim()) }
    ].filter((item) => item.value !== '');

    const metrics = [
      { key: 'line_push_success', value: lineSuccess ? 1 : 0, timestamp: now, step: 0 },
      { key: 'has_image', value: imageDataUrl ? 1 : 0, timestamp: now, step: 0 },
      { key: 'line_image_message', value: imageMessageIncluded ? 1 : 0, timestamp: now, step: 0 },
      { key: 'mlflow_image_artifact', value: artifactResult.uploaded ? 1 : 0, timestamp: now, step: 0 }
    ];
    if (artifactResult.bytes > 0) {
      metrics.push({
        key: 'image_payload_kb',
        value: Number((artifactResult.bytes / 1024).toFixed(2)),
        timestamp: now,
        step: 0
      });
    }
    if (confidencePct !== null && Number.isFinite(confidencePct)) {
      metrics.push({
        key: 'confidence_pct',
        value: confidencePct,
        timestamp: now,
        step: 0
      });
    }

    await mlflowRequest('POST', '/api/2.0/mlflow/runs/log-batch', {
      run_id: runId,
      metrics,
      params,
      tags: []
    });

    await mlflowRequest('POST', '/api/2.0/mlflow/runs/update', {
      run_id: runId,
      status: lineSuccess ? 'FINISHED' : 'FAILED',
      end_time: Date.now()
    });
  } catch (error) {
    console.error(`MLflow logging failed: ${error.message || 'unknown error'}`);
  }
};

const handleLineWebhook = async (req, res) => {
  if (!channelAccessToken || !targetUserId) {
    sendJson(res, 500, {
      success: false,
      message: 'Missing LINE_CHANNEL_ACCESS_TOKEN or LINE_TARGET_USER_ID'
    });
    return;
  }

  if (relaySecret) {
    const incomingSecret = req.headers['x-relay-secret'];
    if (incomingSecret !== relaySecret) {
      sendJson(res, 401, { success: false, message: 'Invalid relay secret' });
      return;
    }
  }

  let body;
  try {
    body = await parseBody(req);
  } catch (error) {
    sendJson(res, 400, { success: false, message: error.message || 'Bad request' });
    return;
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const imageDataUrl = typeof body.image === 'string' && body.image.startsWith('data:image/')
    ? body.image
    : '';
  const metadata = body && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
    ? body.metadata
    : {};

  if (!message) {
    sendJson(res, 400, { success: false, message: 'Missing "message"' });
    return;
  }

  let messages;
  try {
    messages = buildLineMessages(message, imageDataUrl);
  } catch (error) {
    sendJson(res, 400, { success: false, message: error.message || 'Invalid image payload' });
    return;
  }
  const hasImagePayload = Boolean(imageDataUrl);
  const hasImageMessage = messages.some((item) => item && item.type === 'image');

  try {
    const lineRes = await fetch(LINE_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${channelAccessToken}`
      },
      body: JSON.stringify({
        to: targetUserId,
        messages
      })
    });

    if (!lineRes.ok) {
      const errorText = await lineRes.text();
      await logWebhookEventToMlflow({
        message,
        imageDataUrl,
        imageMessageIncluded: hasImageMessage,
        metadata,
        lineSuccess: false,
        lineStatusCode: lineRes.status,
        lineErrorMessage: errorText
      });
      sendJson(res, lineRes.status, {
        success: false,
        message: `LINE API error: ${errorText}`,
        receivedImage: hasImagePayload,
        imageMessageIncluded: hasImageMessage
      });
      return;
    }

    await logWebhookEventToMlflow({
      message,
      imageDataUrl,
      imageMessageIncluded: hasImageMessage,
      metadata,
      lineSuccess: true,
      lineStatusCode: lineRes.status,
      lineErrorMessage: ''
    });

    sendJson(res, 200, {
      success: true,
      message: 'Message sent to LINE successfully',
      receivedImage: hasImagePayload,
      imageMessageIncluded: hasImageMessage
    });
  } catch (error) {
    await logWebhookEventToMlflow({
      message,
      imageDataUrl,
      imageMessageIncluded: hasImageMessage,
      metadata,
      lineSuccess: false,
      lineStatusCode: 500,
      lineErrorMessage: error.message || 'Relay error'
    });
    sendJson(res, 500, {
      success: false,
      message: `Relay error: ${error.message || 'Unknown error'}`,
      receivedImage: hasImagePayload,
      imageMessageIncluded: hasImageMessage
    });
  }
};

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    sendJson(res, 404, { success: false, message: 'Not found' });
    return;
  }

  if (req.method === 'OPTIONS') {
    sendJson(res, 200, { success: true });
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, {
      success: true,
      message: 'ok',
      imageDelivery: isPublicBaseUrlHttps,
      imageRetentionHours,
      imageMaxFiles,
      mlflowEnabled,
      mlflowExperimentName: mlflowEnabled ? mlflowExperimentName : '',
      mlflowImageArtifactEnabled: mlflowEnabled ? mlflowLogImageArtifact : false,
      mlflowImageArtifactPath: mlflowEnabled ? mlflowImageArtifactPath : '',
      relayVersion: relayAppVersion
    });
    return;
  }

  if (req.method === 'GET' && req.url.startsWith(IMAGE_ROUTE_PREFIX)) {
    const requestedName = decodeURIComponent(req.url.slice(IMAGE_ROUTE_PREFIX.length));
    if (!/^[A-Za-z0-9._-]+$/.test(requestedName)) {
      sendJson(res, 400, { success: false, message: 'Invalid filename' });
      return;
    }

    const imagePath = path.join(imageStorageDir, requestedName);
    if (!fs.existsSync(imagePath)) {
      sendJson(res, 404, { success: false, message: 'Image not found' });
      return;
    }

    res.writeHead(200, { 'Content-Type': getContentTypeFromExt(requestedName) });
    fs.createReadStream(imagePath).pipe(res);
    return;
  }

  if (req.method === 'POST' && (req.url === '/line-webhook' || req.url === '/api/line-webhook')) {
    await handleLineWebhook(req, res);
    return;
  }

  sendJson(res, 404, { success: false, message: 'Not found' });
});

cleanupImageStorage();
if (imageCleanupIntervalSeconds > 0) {
  const timer = setInterval(cleanupImageStorage, imageCleanupIntervalSeconds * 1000);
  timer.unref();
}

server.listen(PORT, () => {
  console.log(`LINE relay listening on http://localhost:${PORT}`);
});
