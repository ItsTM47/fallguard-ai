import http from 'node:http';
import { relayConfig } from './config/env.mjs';
import { withErrorHandler } from './middleware/errorHandler.mjs';
import { handleEventsRoute } from './routes/events.mjs';
import { handleHealthRoute } from './routes/health.mjs';
import { handleImageRoute } from './routes/images.mjs';
import { handleWebhookRoute } from './routes/webhook.mjs';
import { cleanupImageStorage } from './services/imageService.mjs';
import { sendJson } from './utils/http.mjs';
import { initializeDatabase } from '../database/init.mjs';

const safeWebhookRoute = withErrorHandler(handleWebhookRoute);

const getRequestPath = (urlValue) => {
  if (!urlValue) return '';
  try {
    return new URL(urlValue, 'http://localhost').pathname;
  } catch {
    return urlValue;
  }
};

export const createRelayServer = () => {
  return http.createServer(async (req, res) => {
    const requestPath = getRequestPath(req.url);

    if (!requestPath) {
      sendJson(res, 404, { success: false, message: 'Not found' });
      return;
    }

    if (req.method === 'OPTIONS') {
      sendJson(res, 200, { success: true });
      return;
    }

    if (handleHealthRoute(req, res, req.method, requestPath)) return;
    if (await handleEventsRoute(req, res, req.method, requestPath)) return;
    if (handleImageRoute(req, res, req.method, requestPath)) return;
    if (await safeWebhookRoute(req, res, req.method, requestPath)) return;

    sendJson(res, 404, { success: false, message: 'Not found' });
  });
};

export const startRelayServer = async () => {
  const databaseState = await initializeDatabase();
  if (databaseState.databaseConfigured && !databaseState.databaseInitialized && databaseState.databaseInitError) {
    console.error(`Database initialization failed: ${databaseState.databaseInitError}`);
  } else if (databaseState.databaseInitialized) {
    console.log('Database initialized');
  }

  cleanupImageStorage();

  if (relayConfig.imageCleanupIntervalSeconds > 0) {
    const timer = setInterval(cleanupImageStorage, relayConfig.imageCleanupIntervalSeconds * 1000);
    timer.unref();
  }

  const server = createRelayServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(relayConfig.port, () => {
      console.log(`LINE relay listening on http://localhost:${relayConfig.port}`);
      resolve();
    });
  });

  return server;
};
