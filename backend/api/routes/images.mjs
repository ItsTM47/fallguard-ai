import fs from 'node:fs';
import { relayConfig } from '../config/env.mjs';
import { getContentTypeFromExt, resolveImageFile } from '../services/imageService.mjs';
import { sendJson } from '../utils/http.mjs';

export const handleImageRoute = (_req, res, method, requestPath) => {
  if (method !== 'GET' || !requestPath.startsWith(relayConfig.imageRoutePrefix)) return false;

  const resolved = resolveImageFile(requestPath);
  if (!resolved.ok) {
    if (resolved.reason === 'invalid_filename') {
      sendJson(res, 400, { success: false, message: 'Invalid filename' });
      return true;
    }
    if (resolved.reason === 'not_found') {
      sendJson(res, 404, { success: false, message: 'Image not found' });
      return true;
    }
    return false;
  }

  res.writeHead(200, { 'Content-Type': getContentTypeFromExt(resolved.requestedName) });
  fs.createReadStream(resolved.imagePath).pipe(res);
  return true;
};
