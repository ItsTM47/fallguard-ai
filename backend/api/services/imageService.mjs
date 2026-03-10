import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { relayConfig } from '../config/env.mjs';

const { imageStorageDir, imageRoutePrefix, publicBaseUrl, isPublicBaseUrlHttps, imageRetentionHours, imageMaxFiles } = relayConfig;

fs.mkdirSync(imageStorageDir, { recursive: true });

export const getContentTypeFromExt = (filename) => {
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

export const parseImageDataUrl = (dataUrl) => {
  const match = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl);
  if (!match) {
    throw new Error('Unsupported image format. Use jpeg/png/webp base64 data URL.');
  }

  const mime = match[1].toLowerCase();
  const base64Data = match[2];
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
  return { mime, base64Data, ext };
};

export const saveDataUrlImage = (dataUrl) => {
  const { base64Data, ext } = parseImageDataUrl(dataUrl);
  const filename = `${Date.now()}-${randomUUID()}.${ext}`;
  const absolutePath = path.join(imageStorageDir, filename);

  fs.writeFileSync(absolutePath, Buffer.from(base64Data, 'base64'));
  return filename;
};

export const buildLineMessages = (message, imageDataUrl) => {
  let textMessage = message;
  const messages = [];
  let savedImageFilename = '';
  let savedImageUrl = '';

  if (imageDataUrl) {
    savedImageFilename = saveDataUrlImage(imageDataUrl);

    if (!publicBaseUrl) {
      textMessage += '\n\n(มีภาพเหตุการณ์ แต่ยังไม่ตั้ง LINE_PUBLIC_BASE_URL สำหรับส่งภาพ)';
    } else if (!isPublicBaseUrlHttps) {
      textMessage += '\n\n(มีภาพเหตุการณ์ แต่ LINE ต้องใช้ URL แบบ HTTPS)';
    } else {
      savedImageUrl = `${publicBaseUrl}${imageRoutePrefix}${savedImageFilename}`;
      messages.push({
        type: 'image',
        originalContentUrl: savedImageUrl,
        previewImageUrl: savedImageUrl
      });
    }
  }

  messages.unshift({
    type: 'text',
    text: textMessage.slice(0, 5000)
  });

  return {
    messages,
    savedImageFilename,
    savedImageUrl
  };
};

export const cleanupImageStorage = () => {
  const retentionMs = Math.max(imageRetentionHours, 0) * 60 * 60 * 1000;
  const now = Date.now();

  let files = [];
  try {
    files = fs.readdirSync(imageStorageDir)
      .filter(isImageFile)
      .map((name) => {
        const absolutePath = path.join(imageStorageDir, name);
        const stat = fs.statSync(absolutePath);
        return { name, absolutePath, mtimeMs: stat.mtimeMs };
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
          return { name, absolutePath, mtimeMs: stat.mtimeMs };
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

export const resolveImageFile = (requestPath) => {
  if (!requestPath.startsWith(imageRoutePrefix)) {
    return { ok: false, reason: 'not_image_route' };
  }

  const requestedName = decodeURIComponent(requestPath.slice(imageRoutePrefix.length));
  if (!/^[A-Za-z0-9._-]+$/.test(requestedName)) {
    return { ok: false, reason: 'invalid_filename', requestedName };
  }

  const imagePath = path.join(imageStorageDir, requestedName);
  if (!fs.existsSync(imagePath)) {
    return { ok: false, reason: 'not_found', requestedName };
  }

  return { ok: true, imagePath, requestedName };
};
