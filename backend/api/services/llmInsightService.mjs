import { relayConfig } from '../config/env.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;

const normalizeConfidence = (value) => {
  const num = Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(num)) return 0;
  if (num > 1 && num <= 100) return Math.max(0, Math.min(num / 100, 1));
  return Math.max(0, Math.min(num, 1));
};

const normalizeString = (value, fallback = '', maxLen = 120) => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, maxLen);
};

const normalizeTimestamp = (value) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return Date.now();
};

const normalizeDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const startOfDayMs = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const getMostFrequent = (items) => {
  if (!Array.isArray(items) || items.length === 0) return null;
  const counts = new Map();
  items.forEach((item) => {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  });

  let topLabel = '';
  let topCount = 0;
  for (const [label, count] of counts.entries()) {
    if (count > topCount) {
      topLabel = label;
      topCount = count;
    }
  }

  if (!topLabel) return null;
  return { label: topLabel, count: topCount };
};

const getMostRiskyHour = (events) => {
  if (!Array.isArray(events) || events.length === 0) return null;
  const hourCounts = new Map();
  events.forEach((event) => {
    const hour = new Date(event.timestamp).getHours();
    hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
  });

  let riskyHour = -1;
  let riskyCount = 0;
  for (const [hour, count] of hourCounts.entries()) {
    if (count > riskyCount) {
      riskyHour = hour;
      riskyCount = count;
    }
  }

  if (riskyHour < 0) return null;
  return { hour: riskyHour, count: riskyCount };
};

const sanitizeEvents = (history) => {
  if (!Array.isArray(history)) return [];
  const maxInputEvents = relayConfig.llm.maxInputEvents;

  const cleaned = history
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const timestamp = normalizeTimestamp(item.timestamp);
      const location = normalizeString(item.location, 'ไม่ระบุสถานที่', 80);
      const personLabel = normalizeString(item.personLabel, '', 60);
      const reason = normalizeString(item.reason, 'fall_alert', 80);
      const confidence = normalizeConfidence(item.confidence);

      return {
        timestamp,
        confidence,
        reason,
        location,
        personLabel
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.timestamp - a.timestamp);

  return cleaned.slice(0, maxInputEvents);
};

const buildStats = (events, selectedDate) => {
  const totalFalls = events.length;
  const avgConfidence = totalFalls > 0
    ? events.reduce((sum, event) => sum + event.confidence, 0) / totalFalls
    : 0;
  const riskyHour = getMostRiskyHour(events);
  const topLocation = getMostFrequent(events.map((event) => event.location || 'ไม่ระบุสถานที่'));
  const topPerson = getMostFrequent(
    events.map((event) => (event.personLabel && event.personLabel.trim()) ? event.personLabel : 'ไม่ระบุบุคคล')
  );

  const now = Date.now();
  const last7dCount = events.filter((event) => now - event.timestamp <= (7 * DAY_MS)).length;
  const prev7dCount = events.filter((event) => {
    const age = now - event.timestamp;
    return age > (7 * DAY_MS) && age <= (14 * DAY_MS);
  }).length;

  const trendDiff = last7dCount - prev7dCount;
  const trend = trendDiff > 0
    ? `เพิ่มขึ้น ${trendDiff} เหตุการณ์ใน 7 วันล่าสุด`
    : trendDiff < 0
      ? `ลดลง ${Math.abs(trendDiff)} เหตุการณ์ใน 7 วันล่าสุด`
      : 'แนวโน้มคงที่เมื่อเทียบกับช่วง 7 วันก่อนหน้า';

  let selectedDayCount = 0;
  if (selectedDate) {
    const selectedDay = startOfDayMs(selectedDate);
    selectedDayCount = events.filter((event) => startOfDayMs(new Date(event.timestamp)) === selectedDay).length;
  }

  return {
    totalFalls,
    avgConfidencePct: Number((avgConfidence * 100).toFixed(1)),
    last7dCount,
    prev7dCount,
    trend,
    riskyHour,
    topLocation,
    topPerson,
    selectedDate: selectedDate ? selectedDate.toISOString() : '',
    selectedDayCount
  };
};

const buildFallbackInsight = (events, selectedDate) => {
  if (events.length === 0) {
    return {
      summary: 'ยังไม่มีข้อมูลการล้มเพียงพอสำหรับวิเคราะห์เชิงลึก',
      highlights: [
        'ยังไม่พบเหตุการณ์ที่บันทึกไว้ในช่วงเวลาที่เลือก',
        'ระบบพร้อมวิเคราะห์ทันทีเมื่อเริ่มมีข้อมูลเหตุการณ์จริง',
        'สามารถเริ่มจากการทดสอบ 3-5 เหตุการณ์ในช่วงเวลาต่างกัน'
      ],
      recommendations: [
        'เก็บข้อมูลการล้มตัวอย่างให้ครบหลายช่วงเวลาในวันเดียวกัน',
        'ระบุ location และ personLabel ให้สม่ำเสมอเพื่อวิเคราะห์ root cause',
        'ตรวจสอบค่า confidence ที่สูงผิดปกติเพื่อปรับ threshold ลด false alarm'
      ],
      generatedAt: new Date().toLocaleString('th-TH'),
      modelLabel: 'Heuristic Analytics v1'
    };
  }

  const stats = buildStats(events, selectedDate);
  const riskyHourText = stats.riskyHour
    ? `${stats.riskyHour.hour.toString().padStart(2, '0')}:00-${((stats.riskyHour.hour + 1) % 24).toString().padStart(2, '0')}:00 (${stats.riskyHour.count} ครั้ง)`
    : 'ยังไม่ชัดเจน';

  const highlights = [
    `ช่วงเวลาเสี่ยงหลัก: ${riskyHourText}`,
    stats.topLocation
      ? `ตำแหน่งเสี่ยงสูงสุด: ${stats.topLocation.label} (${stats.topLocation.count} ครั้ง)`
      : 'ยังไม่พบตำแหน่งเสี่ยงเด่น',
    stats.topPerson
      ? `บุคคลที่พบเหตุการณ์บ่อย: ${stats.topPerson.label} (${stats.topPerson.count} ครั้ง)`
      : 'ยังไม่พบข้อมูลบุคคลเด่น'
  ];

  if (selectedDate) {
    highlights.push(`วันที่เลือก (${selectedDate.toLocaleDateString('th-TH')}) มีเหตุการณ์ ${stats.selectedDayCount} ครั้ง`);
  }

  return {
    summary: `พบเหตุการณ์ ${stats.totalFalls} ครั้ง | ความมั่นใจเฉลี่ย ${stats.avgConfidencePct}% | ${stats.trend}`,
    highlights,
    recommendations: [
      'เพิ่มการเฝ้าระวังเชิงรุกในช่วงเวลาที่เกิดเหตุซ้ำบ่อยที่สุด',
      'ทบทวนตำแหน่งกล้องและมุมมองในพื้นที่ที่เกิดเหตุซ้ำ เพื่อเพิ่มความแม่นยำ',
      'ตั้งเกณฑ์แจ้งเตือนแบบสองชั้น (confidence + persistence) เพื่อลด false positive'
    ],
    generatedAt: new Date().toLocaleString('th-TH'),
    modelLabel: 'Heuristic Analytics v1'
  };
};

const extractFirstJsonObject = (text) => {
  if (!text) return null;
  const raw = String(text).trim();
  if (!raw) return null;

  const start = raw.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < raw.length; i += 1) {
    const ch = raw[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      depth += 1;
      continue;
    }
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return raw.slice(start, i + 1);
      }
    }
  }

  return null;
};

const toStringList = (value, fallback, maxItems = 5) => {
  if (!Array.isArray(value)) return fallback;
  const list = value
    .map((item) => normalizeString(item, '', 200))
    .filter(Boolean);
  if (list.length === 0) return fallback;
  return list.slice(0, maxItems);
};

const parseLlmResponse = (content, fallback) => {
  const jsonText = extractFirstJsonObject(content);
  if (!jsonText) return fallback;

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return fallback;
  }

  return {
    summary: normalizeString(parsed.summary, fallback.summary, 400),
    highlights: toStringList(parsed.highlights, fallback.highlights, 6),
    recommendations: toStringList(parsed.recommendations, fallback.recommendations, 6),
    generatedAt: new Date().toLocaleString('th-TH'),
    modelLabel: normalizeString(parsed.modelLabel, relayConfig.llm.model, 80)
  };
};

const callOpenAiCompatible = async (events, selectedDate, fallback) => {
  const stats = buildStats(events, selectedDate);
  const recentEvents = events.slice(0, 40).map((event) => ({
    timestamp: new Date(event.timestamp).toISOString(),
    confidencePct: Number((event.confidence * 100).toFixed(1)),
    location: event.location,
    personLabel: event.personLabel || '',
    reason: event.reason
  }));

  const systemPrompt = [
    'You are a safety analytics assistant for fall-detection events.',
    'Write concise Thai output for caregivers and operators.',
    'Return ONLY valid JSON with keys: summary, highlights, recommendations, modelLabel.',
    'Constraints:',
    '- summary: one short paragraph, max 220 chars',
    '- highlights: array of 3-5 specific findings with numbers',
    '- recommendations: array of 3-5 actionable items',
    '- modelLabel: short model name'
  ].join('\n');

  const userPayload = {
    selectedDate: selectedDate ? selectedDate.toISOString() : '',
    stats,
    recentEvents
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), relayConfig.llm.timeoutMs);

  let response;
  let rawResponse = '';
  try {
    response = await fetch(`${relayConfig.llm.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${relayConfig.llm.apiKey}`
      },
      body: JSON.stringify({
        model: relayConfig.llm.model,
        temperature: 0.2,
        max_tokens: 700,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(userPayload) }
        ]
      }),
      signal: controller.signal
    });

    rawResponse = await response.text();
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`LLM API error ${response.status}: ${rawResponse.slice(0, 200)}`);
  }

  let payload;
  try {
    payload = JSON.parse(rawResponse);
  } catch {
    throw new Error('LLM API returned non-JSON response');
  }

  const messageContent = payload?.choices?.[0]?.message?.content;
  const content = typeof messageContent === 'string'
    ? messageContent
    : Array.isArray(messageContent)
      ? messageContent.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('\n')
      : '';

  if (!content) {
    throw new Error('LLM API returned empty content');
  }

  return parseLlmResponse(content, fallback);
};

export const generateLlmInsight = async ({ history, selectedDate }) => {
  const normalizedDate = normalizeDate(selectedDate);
  const events = sanitizeEvents(history);
  const fallback = buildFallbackInsight(events, normalizedDate);

  if (!relayConfig.llm.analyticsEnabled) {
    return fallback;
  }

  if (!relayConfig.llm.configured) {
    return {
      ...fallback,
      modelLabel: 'Heuristic Analytics v1 (LLM not configured)'
    };
  }

  try {
    return await callOpenAiCompatible(events, normalizedDate, fallback);
  } catch (error) {
    console.error(`LLM insight generation failed: ${error.message || 'unknown error'}`);
    return {
      ...fallback,
      modelLabel: `${relayConfig.llm.model} (fallback)`
    };
  }
};

export const getLlmHealthMeta = () => {
  return {
    llmAnalyticsEnabled: relayConfig.llm.analyticsEnabled,
    llmConfigured: relayConfig.llm.configured,
    llmModel: relayConfig.llm.model,
    llmBaseUrl: relayConfig.llm.baseUrl,
    llmTimeoutMs: relayConfig.llm.timeoutMs
  };
};
