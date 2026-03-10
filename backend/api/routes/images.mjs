import fs from 'node:fs';
import { relayConfig } from '../config/env.mjs';
import { getContentTypeFromExt, resolveImageFile } from '../services/imageService.mjs';
import { sendJson } from '../utils/http.mjs';

export const handleImageRoute = (_req, res, method, requestPath) => {
  const isReadMethod = method === 'GET' || method === 'HEAD';
  if (!isReadMethod || !requestPath.startsWith(relayConfig.imageRoutePrefix)) return false;

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

  const contentType = getContentTypeFromExt(resolved.requestedName);
  if (method === 'HEAD') {
    const stat = fs.statSync(resolved.imagePath);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stat.size
    });
    res.end();
    return true;
  }

  res.writeHead(200, { 'Content-Type': contentType });
  fs.createReadStream(resolved.imagePath).pipe(res);
  return true;
};
