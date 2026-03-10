import { relayConfig } from '../config/env.mjs';
import { getDatabaseHealthMeta } from '../../database/connection.mjs';
import { getDatabaseInitMeta } from '../../database/init.mjs';
import { getMlflowHealthMeta } from '../services/mlflowService.mjs';
import { sendJson } from '../utils/http.mjs';

export const handleHealthRoute = (_req, res, method, requestPath) => {
  if (method !== 'GET' || requestPath !== '/health') return false;

  const mlflowMeta = getMlflowHealthMeta();
  const databaseMeta = getDatabaseHealthMeta();
  const databaseInitMeta = getDatabaseInitMeta();
  sendJson(res, 200, {
    success: true,
    message: 'ok',
    imageDelivery: relayConfig.isPublicBaseUrlHttps,
    imageRetentionHours: relayConfig.imageRetentionHours,
    imageMaxFiles: relayConfig.imageMaxFiles,
    ...databaseMeta,
    ...databaseInitMeta,
    ...mlflowMeta,
    relayVersion: relayConfig.relayAppVersion
  });
  return true;
};
