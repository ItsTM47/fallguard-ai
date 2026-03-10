import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const projectRoot = path.resolve(__dirname, '../../..');

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

export const parseBooleanEnv = (value, defaultValue = false) => {
  if (value === undefined || value === null || value === '') return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
};

const parseIntegerEnv = (value, fallback, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
};

const publicBaseUrl = (process.env.LINE_PUBLIC_BASE_URL || '').replace(/\/$/, '');
const mlflowTrackingUri = (process.env.MLFLOW_TRACKING_URI || '').replace(/\/$/, '');
const llmBaseUrl = (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const llmModel = (process.env.LLM_MODEL || 'gpt-4o-mini').trim();
const llmAnalyticsEnabled = parseBooleanEnv(process.env.LLM_ANALYTICS_ENABLED, false);
const llmApiKey = (process.env.LLM_API_KEY || '').trim();

export const relayConfig = {
  port: Number.parseInt(process.env.LINE_RELAY_PORT || '8787', 10),
  maxBodyBytes: Number.parseInt(process.env.LINE_MAX_BODY_BYTES || '8000000', 10),
  linePushUrl: 'https://api.line.me/v2/bot/message/push',
  imageRoutePrefix: '/images/',
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  targetUserId: process.env.LINE_TARGET_USER_ID || '',
  relaySecret: process.env.LINE_RELAY_SECRET || '',
  imageStorageDir: path.resolve(projectRoot, process.env.LINE_IMAGE_STORAGE_DIR || 'backend/uploads'),
  publicBaseUrl,
  isPublicBaseUrlHttps: publicBaseUrl.startsWith('https://'),
  imageRetentionHours: Number.parseFloat(process.env.LINE_IMAGE_RETENTION_HOURS || '24'),
  imageCleanupIntervalSeconds: Number.parseInt(process.env.LINE_IMAGE_CLEANUP_INTERVAL_SECONDS || '300', 10),
  imageMaxFiles: Number.parseInt(process.env.LINE_IMAGE_MAX_FILES || '500', 10),
  mlflow: {
    enabled: !!mlflowTrackingUri,
    trackingUri: mlflowTrackingUri,
    experimentName: process.env.MLFLOW_EXPERIMENT_NAME || 'fallguard-alerts',
    trackingToken: process.env.MLFLOW_TRACKING_TOKEN || '',
    trackingUsername: process.env.MLFLOW_TRACKING_USERNAME || '',
    trackingPassword: process.env.MLFLOW_TRACKING_PASSWORD || '',
    logImageArtifact: parseBooleanEnv(process.env.MLFLOW_LOG_IMAGE_ARTIFACT, false),
    imageArtifactPath: (process.env.MLFLOW_IMAGE_ARTIFACT_PATH || 'event-images').replace(/^\/+|\/+$/g, ''),
    imageArtifactMaxBytes: Number.parseInt(process.env.MLFLOW_IMAGE_ARTIFACT_MAX_BYTES || '2000000', 10)
  },
  database: {
    enabled: parseBooleanEnv(process.env.DATABASE_ENABLED, true),
    url: process.env.DATABASE_URL || '',
    ssl: parseBooleanEnv(process.env.DATABASE_SSL, false),
    poolMax: Number.parseInt(process.env.DATABASE_POOL_MAX || '10', 10)
  },
  llm: {
    analyticsEnabled: llmAnalyticsEnabled,
    configured: llmAnalyticsEnabled && !!llmApiKey,
    apiKey: llmApiKey,
    baseUrl: llmBaseUrl,
    model: llmModel || 'gpt-4o-mini',
    timeoutMs: parseIntegerEnv(process.env.LLM_TIMEOUT_MS, 20000, 1000, 120000),
    maxInputEvents: parseIntegerEnv(process.env.LLM_MAX_INPUT_EVENTS, 240, 20, 1000)
  },
  relayAppVersion: process.env.RELAY_APP_VERSION || process.env.npm_package_version || 'dev',
  relayGitSha: process.env.RELAY_GIT_SHA || process.env.GIT_SHA || ''
};

export const publicBaseHost = (() => {
  if (!relayConfig.publicBaseUrl) return '';
  try {
    return new URL(relayConfig.publicBaseUrl).host;
  } catch {
    return '';
  }
})();
