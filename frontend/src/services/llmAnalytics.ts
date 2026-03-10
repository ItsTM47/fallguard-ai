import type { FallEvent } from '@/services/fallHistory';
import { getRelayAnalyticsUrl } from '@/services/relayUrls';

export interface LlmInsightResult {
  summary: string;
  highlights: string[];
  recommendations: string[];
  generatedAt: string;
  modelLabel: string;
}

interface AnalyticsRequestEvent {
  timestamp: number;
  confidence: number;
  reason: string;
  location: string;
  personLabel: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ANALYTICS_EVENTS = 240;
const LLM_REQUEST_TIMEOUT_MS = 15000;

const parseBoolean = (value: unknown, fallback = false): boolean => {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
};

const llmAnalyticsEnabled = parseBoolean(import.meta.env.VITE_LLM_ANALYTICS_ENABLED, false);
const llmAnalyticsUrl = getRelayAnalyticsUrl();

const startOfDayMs = (date: Date): number => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
};

const getMostFrequent = (items: string[]): { label: string; count: number } | null => {
  if (items.length === 0) return null;
  const counts = new Map<string, number>();
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

const getMostRiskyHour = (history: FallEvent[]): { hour: number; count: number } | null => {
  if (history.length === 0) return null;
  const hourCounts = new Map<number, number>();
  history.forEach((event) => {
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

const toSafeTimestamp = (value: unknown): number => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return Date.now();
};

const toSafeConfidence = (value: unknown): number => {
  const parsed = Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed)) return 0;
  if (parsed > 1 && parsed <= 100) return Math.max(0, Math.min(parsed / 100, 1));
  return Math.max(0, Math.min(parsed, 1));
};

const toRequestEvents = (history: FallEvent[]): AnalyticsRequestEvent[] => {
  return [...history]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_ANALYTICS_EVENTS)
    .map((event) => ({
      timestamp: toSafeTimestamp(event.timestamp),
      confidence: toSafeConfidence(event.confidence),
      reason: typeof event.reason === 'string' ? event.reason.slice(0, 80) : '',
      location: typeof event.location === 'string' ? event.location.slice(0, 80) : '',
      personLabel: typeof event.personLabel === 'string' ? event.personLabel.slice(0, 60) : ''
    }));
};

const sanitizeInsightValue = (value: unknown, fallback: string, maxLen = 260): string => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, maxLen);
};

const sanitizeInsightList = (value: unknown, fallback: string[]): string[] => {
  if (!Array.isArray(value)) return fallback;
  const cleaned = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .map((item) => item.slice(0, 220));
  if (cleaned.length === 0) return fallback;
  return cleaned.slice(0, 6);
};

const normalizeInsightPayload = (payload: unknown, fallback: LlmInsightResult): LlmInsightResult => {
  if (!payload || typeof payload !== 'object') return fallback;
  const item = payload as Record<string, unknown>;

  return {
    summary: sanitizeInsightValue(item.summary, fallback.summary, 420),
    highlights: sanitizeInsightList(item.highlights, fallback.highlights),
    recommendations: sanitizeInsightList(item.recommendations, fallback.recommendations),
    generatedAt: sanitizeInsightValue(item.generatedAt, new Date().toLocaleString('th-TH'), 100),
    modelLabel: sanitizeInsightValue(item.modelLabel, fallback.modelLabel, 100)
  };
};

const requestLlmInsight = async (
  history: FallEvent[],
  selectedDate: Date | undefined,
  fallback: LlmInsightResult
): Promise<LlmInsightResult> => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), LLM_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(llmAnalyticsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        history: toRequestEvents(history),
        selectedDate: selectedDate ? selectedDate.toISOString() : ''
      }),
      signal: controller.signal
    });

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const message = (payload as Record<string, unknown> | null)?.message;
      throw new Error(typeof message === 'string' ? message : `LLM analytics failed (${response.status})`);
    }

    const result = normalizeInsightPayload(payload, fallback);
    return result;
  } finally {
    window.clearTimeout(timeout);
  }
};

const buildHeuristicInsight = (
  history: FallEvent[],
  selectedDate?: Date
): LlmInsightResult => {
  if (history.length === 0) {
    return {
      summary: 'ยังไม่มีข้อมูลการล้มสำหรับวิเคราะห์',
      highlights: [
        'ระบบยังไม่พบเหตุการณ์ล้มที่บันทึกไว้',
        'สามารถเริ่มเก็บข้อมูลจากการทดสอบกล้องและการแจ้งเตือน',
        'เมื่อมีข้อมูลมากขึ้น ระบบจะสรุปแนวโน้มช่วงเวลาเสี่ยงได้ละเอียดขึ้น'
      ],
      recommendations: [
        'ทดสอบการล้มตัวอย่าง 3-5 ครั้งในเวลาต่างกัน',
        'ระบุชื่อสถานที่/กล้องให้ชัดเพื่อแยกบริบทได้ง่าย',
        'เปิดใช้งานบันทึก MLflow เพื่อทำรายงานวัดคุณภาพโมเดล'
      ],
      generatedAt: new Date().toLocaleString('th-TH'),
      modelLabel: 'Heuristic Analytics v1'
    };
  }

  const totalFalls = history.length;
  const avgConfidence = history.reduce((sum, event) => sum + event.confidence, 0) / totalFalls;
  const riskyHour = getMostRiskyHour(history);
  const topLocation = getMostFrequent(history.map((event) => event.location || 'ไม่ระบุสถานที่'));
  const topPerson = getMostFrequent(history.map((event) => event.personLabel || 'ไม่ระบุบุคคล'));

  const now = Date.now();
  const last7dCount = history.filter((event) => now - event.timestamp <= (7 * DAY_MS)).length;
  const prev7dCount = history.filter((event) => {
    const age = now - event.timestamp;
    return age > (7 * DAY_MS) && age <= (14 * DAY_MS);
  }).length;
  const trendDiff = last7dCount - prev7dCount;

  const fallsByDay = new Map<number, number>();
  history.forEach((event) => {
    const day = startOfDayMs(new Date(event.timestamp));
    fallsByDay.set(day, (fallsByDay.get(day) ?? 0) + 1);
  });

  let busiestDayTs = 0;
  let busiestDayCount = 0;
  for (const [day, count] of fallsByDay.entries()) {
    if (count > busiestDayCount) {
      busiestDayTs = day;
      busiestDayCount = count;
    }
  }

  const selectedDayCount = selectedDate
    ? history.filter((event) => startOfDayMs(new Date(event.timestamp)) === startOfDayMs(selectedDate)).length
    : 0;

  const trendText = trendDiff > 0
    ? `แนวโน้มเพิ่มขึ้น ${trendDiff} เหตุการณ์ใน 7 วันล่าสุด`
    : trendDiff < 0
      ? `แนวโน้มลดลง ${Math.abs(trendDiff)} เหตุการณ์ใน 7 วันล่าสุด`
      : 'แนวโน้มคงที่เมื่อเทียบ 7 วันล่าสุดกับช่วงก่อนหน้า';

  const summary = [
    `พบเหตุการณ์รวม ${totalFalls} ครั้ง`,
    `ความมั่นใจเฉลี่ย ${(avgConfidence * 100).toFixed(1)}%`,
    trendText
  ].join(' | ');

  const highlights = [
    riskyHour
      ? `ช่วงเวลาเสี่ยงหลัก ${riskyHour.hour.toString().padStart(2, '0')}:00-${((riskyHour.hour + 1) % 24).toString().padStart(2, '0')}:00 (${riskyHour.count} ครั้ง)`
      : 'ยังไม่พบช่วงเวลาเสี่ยงชัดเจน',
    busiestDayTs > 0
      ? `วันที่มีเหตุการณ์สูงสุด: ${formatDate(busiestDayTs)} (${busiestDayCount} ครั้ง)`
      : 'ยังไม่สามารถจัดอันดับวันที่เสี่ยงได้',
    topLocation
      ? `ตำแหน่งที่พบเหตุการณ์บ่อยสุด: ${topLocation.label} (${topLocation.count} ครั้ง)`
      : 'ยังไม่มีข้อมูลตำแหน่งที่ชัดเจน'
  ];

  if (topPerson && topPerson.label !== 'ไม่ระบุบุคคล') {
    highlights.push(`บุคคลที่พบเหตุการณ์บ่อย: ${topPerson.label} (${topPerson.count} ครั้ง)`);
  }

  if (selectedDate) {
    highlights.push(`วันที่เลือก (${selectedDate.toLocaleDateString('th-TH')}) มีเหตุการณ์ ${selectedDayCount} ครั้ง`);
  }

  const recommendations = [
    'เพิ่มการเฝ้าระวังในช่วงเวลาที่เสี่ยงสูงสุดตามสถิติ',
    'ปรับ threshold ความมั่นใจให้เหมาะกับบริบทกล้องของแต่ละตำแหน่ง',
    'เก็บตัวอย่างเหตุการณ์ที่ false alarm เพื่อปรับปรุงโมเดลรอบถัดไป'
  ];

  return {
    summary,
    highlights: highlights.slice(0, 6),
    recommendations,
    generatedAt: new Date().toLocaleString('th-TH'),
    modelLabel: 'Heuristic Analytics v1'
  };
};

export const generateMockLlmInsight = async (
  history: FallEvent[],
  selectedDate?: Date
): Promise<LlmInsightResult> => {
  return buildHeuristicInsight(history, selectedDate);
};

export const generateLlmInsight = async (
  history: FallEvent[],
  selectedDate?: Date
): Promise<LlmInsightResult> => {
  const fallback = buildHeuristicInsight(history, selectedDate);

  if (!llmAnalyticsEnabled || !llmAnalyticsUrl) {
    return fallback;
  }

  try {
    return await requestLlmInsight(history, selectedDate, fallback);
  } catch (error) {
    console.warn('LLM analytics fallback to heuristic:', error);
    return {
      ...fallback,
      modelLabel: `${fallback.modelLabel} (fallback)`
    };
  }
};
