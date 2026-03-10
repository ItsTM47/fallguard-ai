import { relayConfig } from '../config/env.mjs';
import { sendJson } from '../utils/http.mjs';

export const validateLineConfig = (res) => {
  if (relayConfig.channelAccessToken && relayConfig.targetUserId) return true;

  sendJson(res, 500, {
    success: false,
    message: 'Missing LINE_CHANNEL_ACCESS_TOKEN or LINE_TARGET_USER_ID'
  });
  return false;
};

export const validateRelaySecret = (req, res) => {
  if (!relayConfig.relaySecret) return true;

  const incomingSecret = req.headers['x-relay-secret'];
  if (incomingSecret === relayConfig.relaySecret) return true;

  sendJson(res, 401, { success: false, message: 'Invalid relay secret' });
  return false;
};
