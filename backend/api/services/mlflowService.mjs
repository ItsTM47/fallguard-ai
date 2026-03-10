import { randomUUID } from 'node:crypto';
import { relayConfig, publicBaseHost } from '../config/env.mjs';
import { parseImageDataUrl } from './imageService.mjs';

const { mlflow, isPublicBaseUrlHttps, targetUserId, relayAppVersion, relayGitSha } = relayConfig;
let mlflowExperimentIdCache = '';

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
  if (mlflow.trackingToken) {
    headers.Authorization = `Bearer ${mlflow.trackingToken}`;
    return headers;
  }

  if (mlflow.trackingUsername && mlflow.trackingPassword) {
    const basicToken = Buffer
      .from(`${mlflow.trackingUsername}:${mlflow.trackingPassword}`, 'utf8')
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
  const response = await fetch(`${mlflow.trackingUri}${endpoint}`, {
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
  const response = await fetch(`${mlflow.trackingUri}${endpoint}`, {
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

  if (!mlflow.logImageArtifact) {
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

  if (mlflow.imageArtifactMaxBytes > 0 && result.bytes > mlflow.imageArtifactMaxBytes) {
    result.skippedReason = `size_exceeded_${mlflow.imageArtifactMaxBytes}`;
    return result;
  }

  const filename = `${Date.now()}-${randomUUID()}.${parsed.ext}`;
  const artifactPath = mlflow.imageArtifactPath ? `${mlflow.imageArtifactPath}/${filename}` : filename;
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
  if (!mlflow.enabled) return '';
  if (mlflowExperimentIdCache) return mlflowExperimentIdCache;

  const getByName = await mlflowRequest(
    'GET',
    `/api/2.0/mlflow/experiments/get-by-name?experiment_name=${encodeURIComponent(mlflow.experimentName)}`
  );

  if (getByName.ok && getByName.data?.experiment?.experiment_id) {
    mlflowExperimentIdCache = getByName.data.experiment.experiment_id;
    return mlflowExperimentIdCache;
  }

  if (!getByName.ok && getByName.status !== 404) {
    throw new Error(`MLflow get experiment failed: ${JSON.stringify(getByName.data)}`);
  }

  const createExp = await mlflowRequest('POST', '/api/2.0/mlflow/experiments/create', {
    name: mlflow.experimentName
  });

  if (createExp.ok && createExp.data?.experiment_id) {
    mlflowExperimentIdCache = createExp.data.experiment_id;
    return mlflowExperimentIdCache;
  }

  const retryGetByName = await mlflowRequest(
    'GET',
    `/api/2.0/mlflow/experiments/get-by-name?experiment_name=${encodeURIComponent(mlflow.experimentName)}`
  );
  if (retryGetByName.ok && retryGetByName.data?.experiment?.experiment_id) {
    mlflowExperimentIdCache = retryGetByName.data.experiment.experiment_id;
    return mlflowExperimentIdCache;
  }

  throw new Error(`MLflow create experiment failed: ${JSON.stringify(createExp.data)}`);
};

export const logWebhookEventToMlflow = async ({
  message,
  imageDataUrl,
  imageMessageIncluded,
  metadata,
  lineSuccess,
  lineStatusCode,
  lineErrorMessage
}) => {
  if (!mlflow.enabled) {
    return {
      enabled: false,
      logged: false
    };
  }

  try {
    const experimentId = await getOrCreateMlflowExperimentId();
    if (!experimentId) {
      return {
        enabled: true,
        logged: false
      };
    }

    const now = Date.now();
    const eventType = toMlflowString(metadata?.eventType || (message.includes('FALL DETECTED') ? 'fall_alert' : 'webhook'));
    const runTags = [
      { key: 'source', value: 'fallguard-relay' },
      { key: 'target_user', value: toMlflowString(targetUserId) },
      { key: 'event_type', value: eventType },
      { key: 'app_version', value: toMlflowString(relayAppVersion) },
      { key: 'image_artifact_enabled', value: mlflow.logImageArtifact ? 'true' : 'false' }
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
      { key: 'public_base_https', value: relayConfig.isPublicBaseUrlHttps ? 'true' : 'false' },
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

    return {
      enabled: true,
      logged: true,
      runId,
      experimentName: mlflow.experimentName,
      trackingUri: mlflow.trackingUri,
      runStatus: lineSuccess ? 'FINISHED' : 'FAILED',
      linePushSuccess: lineSuccess,
      hasImage: Boolean(imageDataUrl),
      lineImageMessage: Boolean(imageMessageIncluded),
      imageArtifactUploaded: artifactResult.uploaded,
      confidencePct: confidencePct !== null && Number.isFinite(confidencePct) ? confidencePct : null,
      imagePayloadKb: artifactResult.bytes > 0 ? Number((artifactResult.bytes / 1024).toFixed(2)) : null,
      params: Object.fromEntries(params.map((item) => [item.key, item.value])),
      metrics: Object.fromEntries(metrics.map((item) => [item.key, item.value])),
      tags: Object.fromEntries(filteredRunTags.map((item) => [item.key, item.value]))
    };
  } catch (error) {
    console.error(`MLflow logging failed: ${error.message || 'unknown error'}`);
    return {
      enabled: true,
      logged: false,
      error: error.message || 'unknown error'
    };
  }
};

export const getMlflowHealthMeta = () => ({
  mlflowEnabled: mlflow.enabled,
  mlflowExperimentName: mlflow.enabled ? mlflow.experimentName : '',
  mlflowImageArtifactEnabled: mlflow.enabled ? mlflow.logImageArtifact : false,
  mlflowImageArtifactPath: mlflow.enabled ? mlflow.imageArtifactPath : ''
});
