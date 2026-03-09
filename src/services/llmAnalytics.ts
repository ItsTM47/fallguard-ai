import type { FallEvent } from '@/services/fallHistory';

export interface LlmInsightResult {
  summary: string;
  highlights: string[];
  recommendations: string[];
  generatedAt: string;
  modelLabel: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

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

export const generateMockLlmInsight = async (
  history: FallEvent[],
  selectedDate?: Date
): Promise<LlmInsightResult> => {
  await new Promise((resolve) => setTimeout(resolve, 700));

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
        'เปิดใช้งานบันทึก MLflow เพื่อทำรายงานในวิชา MLOps'
      ],
      generatedAt: new Date().toLocaleString('th-TH'),
      modelLabel: 'Mock LLM v0.1'
    };
  }

  const totalFalls = history.length;
  const avgConfidence = history.reduce((sum, event) => sum + event.confidence, 0) / totalFalls;
  const riskyHour = getMostRiskyHour(history);
  const topLocation = getMostFrequent(history.map((event) => event.location || 'ไม่ระบุสถานที่'));

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
      ? `ช่วงเวลาเสี่ยงหลัก ${riskyHour.hour.toString().padStart(2, '0')}:00-${(riskyHour.hour + 1).toString().padStart(2, '0')}:00 (${riskyHour.count} ครั้ง)`
      : 'ยังไม่พบช่วงเวลาเสี่ยงชัดเจน',
    busiestDayTs > 0
      ? `วันที่มีเหตุการณ์สูงสุด: ${formatDate(busiestDayTs)} (${busiestDayCount} ครั้ง)`
      : 'ยังไม่สามารถจัดอันดับวันที่เสี่ยงได้',
    topLocation
      ? `ตำแหน่งที่พบเหตุการณ์บ่อยสุด: ${topLocation.label} (${topLocation.count} ครั้ง)`
      : 'ยังไม่มีข้อมูลตำแหน่งที่ชัดเจน'
  ];

  if (selectedDate) {
    highlights.push(`วันที่เลือก (${selectedDate.toLocaleDateString('th-TH')}) มีเหตุการณ์ ${selectedDayCount} ครั้ง`);
  }

  const recommendations = [
    'ตั้ง threshold ความมั่นใจให้เหมาะกับฉากจริง เพื่อลด false positive',
    'เพิ่มการซ้อมแผนแจ้งเตือนในช่วงเวลาที่เสี่ยงสูงที่สุด',
    'ใช้ข้อมูลรายวันร่วมกับ MLflow เพื่อติดตามคุณภาพโมเดลเป็นรอบสัปดาห์'
  ];

  return {
    summary,
    highlights,
    recommendations,
    generatedAt: new Date().toLocaleString('th-TH'),
    modelLabel: 'Mock LLM v0.1'
  };
};
