import { relayConfig } from '../config/env.mjs';

export const sendJson = (res, statusCode, payload) => {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Relay-Secret'
  });
  res.end(JSON.stringify(payload));
};

export const parseBody = (req) => new Promise((resolve, reject) => {
  let data = '';
  req.on('data', (chunk) => {
    data += chunk;
    if (data.length > relayConfig.maxBodyBytes) {
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
