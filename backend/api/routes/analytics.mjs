import { generateLlmInsight } from '../services/llmInsightService.mjs';
import { parseBody, sendJson } from '../utils/http.mjs';

const ANALYTICS_PATHS = new Set(['/analytics/insight', '/api/analytics/insight']);

export const handleAnalyticsRoute = async (req, res, method, requestPath) => {
  if (method !== 'POST' || !ANALYTICS_PATHS.has(requestPath)) return false;

  let body;
  try {
    body = await parseBody(req);
  } catch (error) {
    sendJson(res, 400, { success: false, message: error.message || 'Invalid request body' });
    return true;
  }

  const history = Array.isArray(body?.history) ? body.history : [];
  const selectedDate = body?.selectedDate;

  const result = await generateLlmInsight({
    history,
    selectedDate
  });

  sendJson(res, 200, {
    success: true,
    ...result
  });
  return true;
};

