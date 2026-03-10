import { validateLineConfig, validateRelaySecret } from '../middleware/auth.mjs';
import { extractWebhookPayload } from '../middleware/upload.mjs';
import { buildLineMessages } from '../services/imageService.mjs';
import { sendLinePush } from '../services/lineService.mjs';
import { logWebhookEventToMlflow } from '../services/mlflowService.mjs';
import { persistWebhookEvent } from '../../database/eventStore.mjs';
import { parseBody, sendJson } from '../utils/http.mjs';

const WEBHOOK_PATHS = new Set(['/line-webhook', '/api/line-webhook']);

const getRemoteIp = (req) => {
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (typeof xForwardedFor === 'string' && xForwardedFor.trim()) {
    return xForwardedFor.split(',')[0].trim();
  }

  if (Array.isArray(xForwardedFor) && xForwardedFor.length > 0) {
    return xForwardedFor[0].trim();
  }

  if (typeof req.socket?.remoteAddress === 'string') {
    return req.socket.remoteAddress;
  }

  return '';
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

export const handleWebhookRoute = async (req, res, method, requestPath) => {
  if (method !== 'POST' || !WEBHOOK_PATHS.has(requestPath)) return false;

  if (!validateLineConfig(res)) return true;
  if (!validateRelaySecret(req, res)) return true;

  let body;
  try {
    body = await parseBody(req);
  } catch (error) {
    sendJson(res, 400, { success: false, message: error.message || 'Bad request' });
    return true;
  }

  const { message, imageDataUrl, metadata } = extractWebhookPayload(body);
  if (!message) {
    sendJson(res, 400, { success: false, message: 'Missing "message"' });
    return true;
  }

  let linePayload;
  try {
    linePayload = buildLineMessages(message, imageDataUrl, getRequestOrigin(req));
  } catch (error) {
    sendJson(res, 400, { success: false, message: error.message || 'Invalid image payload' });
    return true;
  }

  const { messages, savedImageFilename, savedImageUrl } = linePayload;
  const hasImagePayload = Boolean(imageDataUrl);
  const hasImageMessage = messages.some((item) => item && item.type === 'image');
  const remoteIp = getRemoteIp(req);
  const startedAt = Date.now();

  try {
    const lineRes = await sendLinePush(messages);
    const lineResponseBody = await lineRes.text();

    if (!lineRes.ok) {
      const mlflowResult = await logWebhookEventToMlflow({
        message,
        imageDataUrl,
        imageMessageIncluded: hasImageMessage,
        metadata,
        lineSuccess: false,
        lineStatusCode: lineRes.status,
        lineErrorMessage: lineResponseBody
      });

      await persistWebhookEvent({
        message,
        metadata,
        imageDataUrl,
        imageMessageIncluded: hasImageMessage,
        savedImageFilename,
        savedImageUrl,
        lineSuccess: false,
        lineStatusCode: lineRes.status,
        lineErrorMessage: lineResponseBody,
        lineResponseBody,
        requestPayload: body,
        elapsedMs: Date.now() - startedAt,
        mlflowResult,
        requestPath,
        method,
        remoteIp
      });

      sendJson(res, lineRes.status, {
        success: false,
        message: `LINE API error: ${lineResponseBody}`,
        receivedImage: hasImagePayload,
        imageMessageIncluded: hasImageMessage
      });
      return true;
    }

    const mlflowResult = await logWebhookEventToMlflow({
      message,
      imageDataUrl,
      imageMessageIncluded: hasImageMessage,
      metadata,
      lineSuccess: true,
      lineStatusCode: lineRes.status,
      lineErrorMessage: ''
    });

    await persistWebhookEvent({
      message,
      metadata,
      imageDataUrl,
      imageMessageIncluded: hasImageMessage,
      savedImageFilename,
      savedImageUrl,
      lineSuccess: true,
      lineStatusCode: lineRes.status,
      lineErrorMessage: '',
      lineResponseBody,
      requestPayload: body,
      elapsedMs: Date.now() - startedAt,
      mlflowResult,
      requestPath,
      method,
      remoteIp
    });

    sendJson(res, 200, {
      success: true,
      message: 'Message sent to LINE successfully',
      receivedImage: hasImagePayload,
      imageMessageIncluded: hasImageMessage
    });
    return true;
  } catch (error) {
    const mlflowResult = await logWebhookEventToMlflow({
      message,
      imageDataUrl,
      imageMessageIncluded: hasImageMessage,
      metadata,
      lineSuccess: false,
      lineStatusCode: 500,
      lineErrorMessage: error.message || 'Relay error'
    });

    await persistWebhookEvent({
      message,
      metadata,
      imageDataUrl,
      imageMessageIncluded: hasImageMessage,
      savedImageFilename,
      savedImageUrl,
      lineSuccess: false,
      lineStatusCode: 500,
      lineErrorMessage: error.message || 'Relay error',
      lineResponseBody: '',
      requestPayload: body,
      elapsedMs: Date.now() - startedAt,
      mlflowResult,
      requestPath,
      method,
      remoteIp
    });

    sendJson(res, 500, {
      success: false,
      message: `Relay error: ${error.message || 'Unknown error'}`,
      receivedImage: hasImagePayload,
      imageMessageIncluded: hasImageMessage
    });
    return true;
  }
};
