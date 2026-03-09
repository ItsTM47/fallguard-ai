import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, BrainCircuit, CalendarDays, Clock3, MapPin, RefreshCcw, Sparkles } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FallHistoryService } from '@/services/fallHistory';
import type { FallEvent } from '@/services/fallHistory';
import { generateMockLlmInsight } from '@/services/llmAnalytics';
import type { LlmInsightResult } from '@/services/llmAnalytics';

const startOfDayMs = (date: Date): number => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const formatTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

const formatHourRange = (hour: number): string => {
  const next = (hour + 1) % 24;
  return `${hour.toString().padStart(2, '0')}:00-${next.toString().padStart(2, '0')}:00`;
};

const AnalyticsSection: React.FC = () => {
  const [history, setHistory] = useState<FallEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [insight, setInsight] = useState<LlmInsightResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const reloadHistory = useCallback(() => {
    const data = FallHistoryService.getHistory().sort((a, b) => b.timestamp - a.timestamp);
    setHistory(data);
  }, []);

  useEffect(() => {
    reloadHistory();
  }, [reloadHistory]);

  useEffect(() => {
    if (!selectedDate && history.length > 0) {
      setSelectedDate(new Date(history[0].timestamp));
      return;
    }
    if (!selectedDate && history.length === 0) {
      setSelectedDate(new Date());
    }
  }, [history, selectedDate]);

  const fallsByDay = useMemo(() => {
    const grouped = new Map<number, FallEvent[]>();
    history.forEach((event) => {
      const day = startOfDayMs(new Date(event.timestamp));
      const list = grouped.get(day) ?? [];
      list.push(event);
      grouped.set(day, list);
    });
    for (const list of grouped.values()) {
      list.sort((a, b) => b.timestamp - a.timestamp);
    }
    return grouped;
  }, [history]);

  const daysWithFalls = useMemo(() => {
    return Array.from(fallsByDay.keys()).map((dayTs) => new Date(dayTs));
  }, [fallsByDay]);

  const selectedDayKey = selectedDate ? startOfDayMs(selectedDate) : null;
  const selectedDayEvents = selectedDayKey !== null ? (fallsByDay.get(selectedDayKey) ?? []) : [];

  const totalFalls = history.length;
  const averageConfidence = totalFalls > 0
    ? history.reduce((sum, event) => sum + event.confidence, 0) / totalFalls
    : 0;

  const hourlyData = useMemo(() => {
    const counts = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
    history.forEach((event) => {
      const hour = new Date(event.timestamp).getHours();
      counts[hour].count += 1;
    });
    return counts;
  }, [history]);

  const peakHour = useMemo<{ hour: number; count: number } | null>(() => {
    const candidate = hourlyData.reduce<{ hour: number; count: number } | null>((best, item) => {
      if (!best || item.count > best.count) {
        return { hour: item.hour, count: item.count };
      }
      return best;
    }, null);
    if (!candidate || candidate.count === 0) return null;
    return candidate;
  }, [hourlyData]);

  const maxHourlyCount = useMemo(() => {
    return hourlyData.reduce((max, item) => Math.max(max, item.count), 0);
  }, [hourlyData]);

  const runAnalysis = useCallback(async () => {
    setIsAnalyzing(true);
    try {
      const result = await generateMockLlmInsight(history, selectedDate);
      setInsight(result);
    } finally {
      setIsAnalyzing(false);
    }
  }, [history, selectedDate]);

  useEffect(() => {
    void runAnalysis();
  }, [runAnalysis]);

  const handleRefresh = () => {
    reloadHistory();
  };

  return (
    <section id="analytics-section" className="relative py-20 px-4 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900" />
      <div className="absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-emerald-400/10 blur-3xl" />

      <div className="relative z-10 max-w-screen-2xl mx-auto space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-1.5 text-cyan-300">
            <CalendarDays className="w-4 h-4" />
            <span className="text-sm font-medium">Analytics Mockup</span>
          </div>
          <h2 className="mt-4 text-3xl md:text-4xl font-bold text-white">
            ปฏิทินเหตุการณ์ล้ม + LLM วิเคราะห์สถิติ
          </h2>
          <p className="mt-3 text-slate-400 max-w-2xl mx-auto">
            ดูว่าล้มวันไหน เวลาไหน และอ่านสรุปเชิงวิเคราะห์แบบ LLM (Mock) สำหรับรายงาน MLOps
          </p>
        </div>

        <div className="grid xl:grid-cols-5 gap-6">
          <Card className="xl:col-span-2 border-cyan-500/25 bg-slate-900/60 backdrop-blur">
            <CardHeader className="pb-4">
              <CardTitle className="text-white flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-cyan-300" />
                ปฏิทินเหตุการณ์
              </CardTitle>
              <CardDescription>
                วันที่มีเหตุการณ์จะถูกไฮไลต์บนปฏิทิน
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-2 flex justify-center">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  modifiers={{ hasFall: daysWithFalls }}
                  modifiersStyles={{
                    hasFall: {
                      backgroundColor: 'rgba(244, 63, 94, 0.28)',
                      color: '#ffe4e6',
                      borderRadius: '10px',
                      fontWeight: 700
                    }
                  }}
                />
              </div>

              <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 p-4 space-y-2">
                <p className="text-slate-300 text-sm">
                  วันที่เลือก: <span className="font-medium text-white">{selectedDate?.toLocaleDateString('th-TH') || '-'}</span>
                </p>
                <p className="text-slate-300 text-sm">
                  จำนวนครั้งที่ล้ม: <span className="font-semibold text-rose-300">{selectedDayEvents.length}</span>
                </p>
              </div>

              <Button
                variant="outline"
                className="w-full border-slate-600 text-slate-200 bg-slate-900 hover:bg-slate-800"
                onClick={handleRefresh}
              >
                <RefreshCcw className="w-4 h-4 mr-2" />
                รีเฟรชข้อมูล
              </Button>
            </CardContent>
          </Card>

          <Card className="xl:col-span-3 border-slate-700/70 bg-slate-900/50 backdrop-blur">
            <CardHeader className="pb-4">
              <CardTitle className="text-white flex items-center gap-2">
                <Clock3 className="w-5 h-5 text-amber-300" />
                เหตุการณ์ตามวัน/เวลา
              </CardTitle>
              <CardDescription>
                Mockup Timeline สำหรับวันที่เลือก
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[320px] pr-3">
                {selectedDayEvents.length === 0 ? (
                  <div className="h-[280px] rounded-xl border border-dashed border-slate-700 flex items-center justify-center text-slate-500">
                    ยังไม่มีเหตุการณ์ในวันที่เลือก
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedDayEvents.map((event) => (
                      <div
                        key={event.id}
                        className="rounded-xl border border-slate-700 bg-gradient-to-r from-slate-900 to-slate-900/60 p-4"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className="bg-rose-500/20 text-rose-200 border-rose-400/40">ล้ม</Badge>
                          {event.personLabel && (
                            <Badge className="bg-amber-500/20 text-amber-100 border-amber-300/40">
                              {event.personLabel}
                            </Badge>
                          )}
                          <Badge className="bg-cyan-500/20 text-cyan-100 border-cyan-300/40">
                            {(event.confidence * 100).toFixed(1)}%
                          </Badge>
                        </div>
                        <div className="mt-3 grid sm:grid-cols-2 gap-2 text-sm text-slate-300">
                          <p className="flex items-center gap-2">
                            <Clock3 className="w-4 h-4 text-slate-400" />
                            {formatTime(event.timestamp)}
                          </p>
                          <p className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-slate-400" />
                            {event.location || 'ไม่ระบุสถานที่'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        <div className="grid xl:grid-cols-5 gap-6">
          <Card className="xl:col-span-2 border-slate-700/70 bg-slate-900/50">
            <CardHeader className="pb-4">
              <CardTitle className="text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-emerald-300" />
                สถิติย่อ
              </CardTitle>
              <CardDescription>
                ภาพรวมสำหรับรายงาน
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-slate-800/70 border border-slate-700 p-3">
                  <p className="text-xs text-slate-400">รวมทั้งหมด</p>
                  <p className="text-xl font-bold text-white">{totalFalls}</p>
                </div>
                <div className="rounded-lg bg-slate-800/70 border border-slate-700 p-3">
                  <p className="text-xs text-slate-400">ความมั่นใจเฉลี่ย</p>
                  <p className="text-xl font-bold text-white">{(averageConfidence * 100).toFixed(1)}%</p>
                </div>
              </div>

              <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-3">
                <p className="text-xs text-slate-400">ช่วงเวลาเสี่ยงสูงสุด</p>
                <p className="text-sm text-rose-300 font-medium mt-1">
                  {peakHour ? `${formatHourRange(peakHour.hour)} (${peakHour.count} ครั้ง)` : 'ยังไม่มีข้อมูล'}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-slate-400">การกระจายตามชั่วโมง (0-23)</p>
                <div className="grid grid-cols-12 gap-1.5 rounded-lg border border-slate-700 bg-slate-950/70 p-2">
                  {hourlyData.map((item) => {
                    const ratio = maxHourlyCount > 0 ? item.count / maxHourlyCount : 0;
                    return (
                      <div key={item.hour} className="flex flex-col items-center gap-1">
                        <div className="h-16 w-full rounded-sm bg-slate-800 relative overflow-hidden">
                          <div
                            className="absolute bottom-0 left-0 right-0 rounded-sm bg-gradient-to-t from-emerald-400 to-cyan-300"
                            style={{ height: `${Math.max(6, ratio * 100)}%`, opacity: item.count > 0 ? 0.9 : 0.25 }}
                          />
                        </div>
                        <span className="text-[10px] text-slate-500">{item.hour}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="xl:col-span-3 border-violet-500/20 bg-gradient-to-br from-slate-900/90 to-violet-950/30">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-white flex items-center gap-2">
                    <BrainCircuit className="w-5 h-5 text-violet-300" />
                    LLM วิเคราะห์สถิติ
                  </CardTitle>
                  <CardDescription>
                    สรุปเชิงวิเคราะห์สำหรับการพรีเซนต์ (Mock)
                  </CardDescription>
                </div>
                <Badge className="bg-violet-500/20 text-violet-100 border-violet-300/30">
                  <Sparkles className="w-3.5 h-3.5 mr-1" />
                  Mock LLM
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  onClick={() => void runAnalysis()}
                  disabled={isAnalyzing}
                  className="border-violet-400/40 bg-violet-500/10 text-violet-100 hover:bg-violet-500/20"
                >
                  {isAnalyzing ? (
                    <>
                      <RefreshCcw className="w-4 h-4 mr-2 animate-spin" />
                      กำลังวิเคราะห์...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      วิเคราะห์ใหม่
                    </>
                  )}
                </Button>
              </div>

              {insight ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-violet-400/25 bg-violet-500/10 p-4">
                    <p className="text-violet-100 leading-relaxed">{insight.summary}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-300" />
                      ประเด็นสำคัญ
                    </h4>
                    <ul className="space-y-2 text-sm text-slate-300">
                      {insight.highlights.map((item) => (
                        <li key={item} className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-white mb-2">ข้อเสนอแนะ</h4>
                    <ul className="space-y-2 text-sm text-slate-300">
                      {insight.recommendations.map((item) => (
                        <li key={item} className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <p className="text-xs text-slate-500">
                    สร้างเมื่อ {insight.generatedAt} | โมเดล: {insight.modelLabel}
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-700 p-10 text-center text-slate-500">
                  กำลังเตรียมผลวิเคราะห์...
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
};

export default AnalyticsSection;
