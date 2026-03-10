import { sendJson } from '../utils/http.mjs';

export const withErrorHandler = (handler) => async (req, res, ...args) => {
  try {
    return await handler(req, res, ...args);
  } catch (error) {
    sendJson(res, 500, {
      success: false,
      message: `Relay error: ${error.message || 'Unknown error'}`
    });
    return true;
  }
};
