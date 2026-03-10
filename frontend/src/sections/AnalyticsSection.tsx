import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { DayButtonProps } from 'react-day-picker';
import { AlertTriangle, BarChart3, BrainCircuit, CalendarDays, Clock3, MapPin, RefreshCcw, Sparkles } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FallHistoryService } from '@/services/fallHistory';
import type { FallEvent } from '@/services/fallHistory';
import { generateLlmInsight } from '@/services/llmAnalytics';
import type { LlmInsightResult } from '@/services/llmAnalytics';
import { cn } from '@/lib/utils';

const startOfDayMs = (date: Date): number => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const DAY_MS = 24 * 60 * 60 * 1000;

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

type RiskLevel = 'none' | 'low' | 'medium' | 'high';
type EventSeverity = 'low' | 'medium' | 'high';

const getRiskLevelByDayCount = (count: number): RiskLevel => {
  if (count >= 4) return 'high';
  if (count >= 2) return 'medium';
  if (count >= 1) return 'low';
  return 'none';
};

const getEventSeverity = (event: FallEvent): EventSeverity => {
  const confidencePct = event.confidence * 100;
  if (confidencePct >= 85) return 'high';
  if (confidencePct >= 70) return 'medium';
  return 'low';
};

const riskLegend = [
  { label: '1 ครั้ง', swatch: 'bg-yellow-400/80 border-yellow-300/70' },
  { label: '2-3 ครั้ง', swatch: 'bg-amber-400/80 border-amber-300/70' },
  { label: '4+ ครั้ง', swatch: 'bg-rose-400/80 border-rose-300/70' }
] as const;

const AnalyticsSection: React.FC = () => {
  const [history, setHistory] = useState<FallEvent[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
  const [insight, setInsight] = useState<LlmInsightResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const reloadHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const data = await FallHistoryService.getHistoryPreferRelay();
      setHistory(data.sort((a, b) => b.timestamp - a.timestamp));
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    void reloadHistory();
  }, [reloadHistory]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void reloadHistory();
    }, 30000);
    return () => window.clearInterval(timer);
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

  useEffect(() => {
    if (!selectedDate) return;
    setCalendarMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  }, [selectedDate]);

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

  const dayCountMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const [dayTs, events] of fallsByDay.entries()) {
      map.set(dayTs, events.length);
    }
    return map;
  }, [fallsByDay]);

  const selectedDayKey = selectedDate ? startOfDayMs(selectedDate) : null;
  const selectedDayEvents = useMemo(() => {
    if (selectedDayKey === null) return [];
    const events = fallsByDay.get(selectedDayKey) ?? [];
    return [...events].sort((a, b) => a.timestamp - b.timestamp);
  }, [fallsByDay, selectedDayKey]);

  const selectedDayByHour = useMemo(() => {
    const grouped = new Map<number, FallEvent[]>();
    selectedDayEvents.forEach((event) => {
      const hour = new Date(event.timestamp).getHours();
      const list = grouped.get(hour) ?? [];
      list.push(event);
      grouped.set(hour, list);
    });
    return grouped;
  }, [selectedDayEvents]);

  const selectedDaySeverity = useMemo(() => {
    const summary = { low: 0, medium: 0, high: 0 };
    selectedDayEvents.forEach((event) => {
      const severity = getEventSeverity(event);
      summary[severity] += 1;
    });
    return summary;
  }, [selectedDayEvents]);

  useEffect(() => {
    if (selectedDayEvents.length === 0) {
      setSelectedEventId(null);
      return;
    }

    const hasSelected = selectedEventId
      ? selectedDayEvents.some((event) => event.id === selectedEventId)
      : false;

    if (!hasSelected) {
      setSelectedEventId(selectedDayEvents[0].id);
    }
  }, [selectedDayEvents, selectedEventId]);

  const selectedEvent = useMemo(() => {
    if (!selectedEventId) return null;
    return selectedDayEvents.find((event) => event.id === selectedEventId) ?? null;
  }, [selectedDayEvents, selectedEventId]);

  const monthRiskSummary = useMemo(() => {
    const summary = { low: 0, medium: 0, high: 0, total: 0, maxDaily: 0 };
    const targetYear = calendarMonth.getFullYear();
    const targetMonth = calendarMonth.getMonth();

    for (const [dayTs, count] of dayCountMap.entries()) {
      const date = new Date(dayTs);
      if (date.getFullYear() !== targetYear || date.getMonth() !== targetMonth) continue;

      const level = getRiskLevelByDayCount(count);
      if (level !== 'none') summary[level] += 1;
      summary.total += count;
      if (count > summary.maxDaily) summary.maxDaily = count;
    }

    return summary;
  }, [calendarMonth, dayCountMap]);

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

  const peakHours = useMemo<{ hours: number[]; count: number } | null>(() => {
    const maxCount = hourlyData.reduce((max, item) => Math.max(max, item.count), 0);
    if (maxCount === 0) return null;

    const hours = hourlyData
      .filter((item) => item.count === maxCount)
      .map((item) => item.hour);

    if (hours.length === 0) return null;
    return { hours, count: maxCount };
  }, [hourlyData]);

  const peakHourLabel = useMemo(() => {
    if (!peakHours) return 'ยังไม่มีข้อมูล';

    const ranges = peakHours.hours.map((hour) => formatHourRange(hour));
    if (ranges.length === 1) {
      return `${ranges[0]} (${peakHours.count} ครั้ง)`;
    }

    const maxVisibleRanges = 4;
    const visible = ranges.slice(0, maxVisibleRanges).join(', ');
    const remaining = ranges.length - maxVisibleRanges;
    const more = remaining > 0 ? ` +${remaining} ช่วง` : '';
    return `${visible}${more} (${peakHours.count} ครั้ง/ช่วง)`;
  }, [peakHours]);

  const maxHourlyCount = useMemo(() => {
    return hourlyData.reduce((max, item) => Math.max(max, item.count), 0);
  }, [hourlyData]);

  const activeDays = dayCountMap.size;

  const topLocation = useMemo(() => {
    if (history.length === 0) return '-';
    const counts = new Map<string, number>();
    history.forEach((event) => {
      const location = event.location || 'ไม่ระบุ';
      counts.set(location, (counts.get(location) ?? 0) + 1);
    });

    let top = '-';
    let max = 0;
    for (const [location, count] of counts.entries()) {
      if (count > max) {
        max = count;
        top = location;
      }
    }
    return top;
  }, [history]);

  const weeklyData = useMemo(() => {
    const endDay = startOfDayMs(selectedDate ?? new Date());
    const startDay = endDay - (27 * DAY_MS);
    const buckets = [0, 0, 0, 0];

    history.forEach((event) => {
      const dayTs = startOfDayMs(new Date(event.timestamp));
      if (dayTs < startDay || dayTs > endDay) return;
      const weekIndex = Math.min(3, Math.floor((dayTs - startDay) / (7 * DAY_MS)));
      buckets[weekIndex] += 1;
    });

    return buckets.map((count, index) => ({
      label: `W${index + 1}`,
      count
    }));
  }, [history, selectedDate]);

  const maxWeeklyCount = useMemo(() => {
    return weeklyData.reduce((max, item) => Math.max(max, item.count), 0);
  }, [weeklyData]);

  const runAnalysis = useCallback(async () => {
    setIsAnalyzing(true);
    try {
      const result = await generateLlmInsight(history, selectedDate);
      setInsight(result);
    } finally {
      setIsAnalyzing(false);
    }
  }, [history, selectedDate]);

  useEffect(() => {
    void runAnalysis();
  }, [runAnalysis]);

  const handleRefresh = () => {
    void reloadHistory();
  };

  const CalendarDayCell = useMemo(() => {
    const Component = ({ day, modifiers, className, ...props }: DayButtonProps) => {
      const dayCount = dayCountMap.get(startOfDayMs(day.date)) ?? 0;
      const riskLevel = getRiskLevelByDayCount(dayCount);
      const dotCount = Math.min(dayCount, 3);

      const defaultTone = riskLevel === 'high'
        ? 'bg-rose-500/18 border-rose-400/45 text-rose-100 hover:bg-rose-500/30'
        : riskLevel === 'medium'
          ? 'bg-amber-500/18 border-amber-400/45 text-amber-100 hover:bg-amber-500/30'
          : riskLevel === 'low'
            ? 'bg-yellow-500/18 border-yellow-400/45 text-yellow-100 hover:bg-yellow-500/30'
            : 'border-slate-800/70 bg-slate-900/50 text-slate-200 hover:bg-slate-800/80';

      const dotTone = modifiers.selected
        ? 'bg-slate-700'
        : riskLevel === 'high'
          ? 'bg-rose-200'
          : riskLevel === 'medium'
            ? 'bg-amber-200'
            : 'bg-yellow-200';

      return (
        <button
          {...props}
          className={cn(
            'relative h-10 w-full rounded-lg border text-[13px] leading-none transition-all duration-200',
            'flex flex-col items-center justify-center gap-0.5 select-none shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70',
            !modifiers.selected && !modifiers.outside && defaultTone,
            modifiers.outside && !modifiers.selected && 'text-slate-500/70 border-slate-800/40 bg-slate-900/25 hover:bg-slate-800/40',
            modifiers.today && !modifiers.selected && 'ring-1 ring-cyan-400/80 bg-cyan-500/10 border-cyan-400/35 text-cyan-100',
            modifiers.selected && 'bg-gradient-to-b from-slate-100 to-slate-200 border-slate-200 text-slate-900 shadow-[0_6px_18px_rgba(226,232,240,0.18)]',
            modifiers.disabled && 'opacity-40 pointer-events-none',
            className
          )}
        >
          <span>{day.date.getDate()}</span>
          {dotCount > 0 && (
            <span className="flex items-center gap-0.5">
              {Array.from({ length: dotCount }).map((_, index) => (
                <span key={`${day.date.toISOString()}-${index}`} className={cn('h-1 w-1 rounded-full', dotTone)} />
              ))}
            </span>
          )}
        </button>
      );
    };

    Component.displayName = 'AnalyticsCalendarDayCell';
    return Component;
  }, [dayCountMap]);

  const selectedDateLabel = selectedDate
    ? selectedDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
    : '-';
  const selectedDayOfWeek = selectedDate
    ? selectedDate.toLocaleDateString('th-TH', { weekday: 'long' })
    : '';

  return (
    <section id="analytics-section" className="relative py-20 px-4 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900" />
      <div className="absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-emerald-400/10 blur-3xl" />

      <div className="relative z-10 max-w-screen-2xl mx-auto space-y-5">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/35 bg-cyan-400/12 px-4 py-1.5 text-cyan-300">
            <CalendarDays className="w-4 h-4" />
            <span className="text-sm font-medium">แดชบอร์ดวิเคราะห์เหตุการณ์</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-white">
            ปฏิทินเหตุการณ์ล้มและวิเคราะห์สถิติ
          </h2>
          <p className="text-slate-400 max-w-3xl mx-auto">
            ติดตามเหตุการณ์รายวันผ่านปฏิทินและไทม์ไลน์รายชั่วโมง พร้อมสรุปสถิติและข้อเสนอแนะเชิงวิเคราะห์จาก AI
          </p>
        </div>

        <div className="rounded-3xl border border-slate-700/70 bg-slate-900/55 backdrop-blur-xl overflow-hidden">
          <div className="grid xl:grid-cols-[380px,1fr] min-h-[840px]">
            <aside className="bg-slate-900/65 border-b xl:border-b-0 xl:border-r border-slate-700/70 flex flex-col">
              <div className="px-5 py-4 border-b border-slate-700/70">
                <div className="flex items-center gap-2 text-cyan-300">
                  <CalendarDays className="w-4 h-4" />
                  <h3 className="text-base font-semibold text-white">ปฏิทินเหตุการณ์</h3>
                </div>
                <p className="text-xs text-slate-400 mt-1">ดูความหนาแน่นของการล้มในแต่ละวัน</p>
              </div>

              <div className="p-5 space-y-4">
                <div className="rounded-2xl border border-slate-700/80 bg-gradient-to-b from-slate-900/85 to-slate-950/80 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                  <Calendar
                    mode="single"
                    month={calendarMonth}
                    onMonthChange={setCalendarMonth}
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    showOutsideDays
                    components={{ DayButton: CalendarDayCell }}
                    className="w-full"
                    classNames={{
                      root: 'w-full',
                      months: 'w-full',
                      month: 'w-full gap-3.5',
                      month_grid: 'w-full',
                      weeks: 'w-full',
                      nav: 'flex items-center justify-between px-1 py-0.5',
                      button_previous: 'h-9 w-9 rounded-full border border-slate-600/80 bg-slate-900/75 text-slate-200 hover:bg-slate-800 shadow-sm',
                      button_next: 'h-9 w-9 rounded-full border border-slate-600/80 bg-slate-900/75 text-slate-200 hover:bg-slate-800 shadow-sm',
                      month_caption: 'flex h-9 items-center justify-center',
                      caption_label: 'text-[1.12rem] font-semibold text-slate-100 tracking-[0.02em]',
                      weekdays: 'grid grid-cols-7 gap-2 w-full',
                      weekday: 'text-center text-[11px] font-medium text-slate-400',
                      week: 'grid grid-cols-7 gap-2 mt-2 w-full',
                      day: 'w-full p-0',
                      outside: '',
                      today: ''
                    }}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-400">
                  {riskLegend.map((item) => (
                    <div key={item.label} className="inline-flex items-center gap-2">
                      <span className={cn('h-2.5 w-2.5 rounded-full border', item.swatch)} />
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-slate-700 bg-slate-900/80 px-2 py-2 text-center">
                    <p className="text-[10px] text-slate-500">1 ครั้ง</p>
                    <p className="text-lg font-semibold text-yellow-200">{monthRiskSummary.low}</p>
                  </div>
                  <div className="rounded-lg border border-slate-700 bg-slate-900/80 px-2 py-2 text-center">
                    <p className="text-[10px] text-slate-500">2-3 ครั้ง</p>
                    <p className="text-lg font-semibold text-amber-200">{monthRiskSummary.medium}</p>
                  </div>
                  <div className="rounded-lg border border-slate-700 bg-slate-900/80 px-2 py-2 text-center">
                    <p className="text-[10px] text-slate-500">4+ ครั้ง</p>
                    <p className="text-lg font-semibold text-rose-200">{monthRiskSummary.high}</p>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-700 bg-slate-900/75 px-3 py-3 space-y-1">
                  <p className="text-xs text-slate-400">
                    วันที่เลือก: <span className="text-slate-100 font-medium">{selectedDate?.toLocaleDateString('th-TH') || '-'}</span>
                  </p>
                  <p className="text-xs text-slate-400">
                    เหตุการณ์วันนี้: <span className="text-rose-200 font-semibold">{selectedDayEvents.length} ครั้ง</span>
                  </p>
                  <p className="text-xs text-slate-400">
                    รวมทั้งเดือน: <span className="text-cyan-200 font-semibold">{monthRiskSummary.total} ครั้ง</span>
                  </p>
                </div>

                <Button
                  variant="outline"
                  className="w-full border-slate-600 text-slate-200 bg-slate-900 hover:bg-slate-800"
                  onClick={handleRefresh}
                  disabled={isLoadingHistory}
                >
                  <RefreshCcw className={cn('w-4 h-4 mr-2', isLoadingHistory && 'animate-spin')} />
                  {isLoadingHistory ? 'กำลังโหลดข้อมูล...' : 'รีเฟรชข้อมูล'}
                </Button>
              </div>
            </aside>

            <div className="flex flex-col min-h-0">
              <div className="px-5 py-4 border-b border-slate-700/70 bg-slate-900/40 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-2xl font-semibold text-white">{selectedDateLabel}</div>
                  <div className="text-xs text-slate-400">{selectedDayOfWeek}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge className="border-slate-600 bg-slate-800/90 text-slate-200">
                    <Clock3 className="w-3.5 h-3.5 mr-1" />
                    รวม {selectedDayEvents.length} เหตุการณ์
                  </Badge>
                  {selectedDaySeverity.low > 0 && (
                    <Badge className="bg-yellow-500/15 text-yellow-100 border-yellow-400/35">
                      ต่ำ {selectedDaySeverity.low}
                    </Badge>
                  )}
                  {selectedDaySeverity.medium > 0 && (
                    <Badge className="bg-amber-500/15 text-amber-100 border-amber-400/35">
                      กลาง {selectedDaySeverity.medium}
                    </Badge>
                  )}
                  {selectedDaySeverity.high > 0 && (
                    <Badge className="bg-rose-500/15 text-rose-100 border-rose-400/35">
                      สูง {selectedDaySeverity.high}
                    </Badge>
                  )}
                </div>
              </div>

              <ScrollArea className="h-[350px] px-5 py-3 bg-slate-950/30">
                {selectedDayEvents.length === 0 ? (
                  <div className="h-[300px] rounded-xl border border-dashed border-slate-700 flex items-center justify-center text-slate-500">
                    ยังไม่มีเหตุการณ์ในวันที่เลือก
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800/70">
                    {Array.from({ length: 24 }, (_, hour) => {
                      const events = selectedDayByHour.get(hour) ?? [];
                      return (
                        <div key={hour} className="grid grid-cols-[54px,1fr] min-h-10">
                          <div className="border-r border-slate-800/70 pr-3 pt-2 text-right text-[11px] text-slate-500 font-mono">
                            {hour.toString().padStart(2, '0')}:00
                          </div>
                          <div className="pl-3 py-2 space-y-1.5">
                            {events.length === 0 ? (
                              <div className="h-2 w-2 rounded-full bg-slate-700/80 mt-1" />
                            ) : (
                              events.map((event) => {
                                const severity = getEventSeverity(event);
                                const isSelected = selectedEvent?.id === event.id;
                                return (
                                  <button
                                    key={event.id}
                                    type="button"
                                    onClick={() => setSelectedEventId(event.id)}
                                    className={cn(
                                      'inline-flex max-w-full items-center gap-2 rounded-md border px-2.5 py-1 text-xs transition-all duration-200 cursor-pointer',
                                      severity === 'high' && 'bg-rose-500/12 border-rose-400/35 text-rose-100',
                                      severity === 'medium' && 'bg-amber-500/12 border-amber-400/35 text-amber-100',
                                      severity === 'low' && 'bg-yellow-500/12 border-yellow-400/35 text-yellow-100',
                                      !isSelected && 'hover:bg-slate-700/40',
                                      isSelected && 'ring-2 ring-cyan-300/80 shadow-[0_0_0_1px_rgba(34,211,238,0.35)]'
                                    )}
                                  >
                                    <span className="font-mono text-[11px] opacity-90">{formatTime(event.timestamp)}</span>
                                    <span className="font-semibold">ล้ม</span>
                                    {event.personLabel && <span>{event.personLabel}</span>}
                                    <span className="inline-flex items-center gap-1 opacity-80">
                                      <MapPin className="w-3 h-3" />
                                      {event.location || 'ไม่ระบุ'}
                                    </span>
                                    <span className="ml-auto font-mono text-[10px] opacity-75">
                                      {(event.confidence * 100).toFixed(1)}%
                                    </span>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>

              <div className="border-t border-slate-700/70 bg-slate-950/45 p-4">
                <div className="rounded-xl border border-slate-700/70 bg-slate-900/70 p-4">
                  {selectedEvent ? (
                    <div className="grid gap-4 lg:grid-cols-[1fr,220px]">
                      <div className="space-y-3">
                        <div className="text-xs text-cyan-300">รายละเอียดเหตุการณ์ที่เลือก</div>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <Badge className="bg-slate-800 text-slate-200 border-slate-600 font-mono">
                            {formatTime(selectedEvent.timestamp)}
                          </Badge>
                          <Badge className="bg-rose-500/15 text-rose-100 border-rose-400/35">
                            ล้ม
                          </Badge>
                          <Badge className="bg-amber-500/15 text-amber-100 border-amber-400/35">
                            {selectedEvent.personLabel || 'ไม่ระบุบุคคล'}
                          </Badge>
                          <Badge className="bg-cyan-500/15 text-cyan-100 border-cyan-400/35">
                            <MapPin className="w-3 h-3 mr-1" />
                            {selectedEvent.location || 'ไม่ระบุตำแหน่ง'}
                          </Badge>
                          <Badge className="bg-violet-500/15 text-violet-100 border-violet-400/35 font-mono">
                            {(selectedEvent.confidence * 100).toFixed(1)}%
                          </Badge>
                        </div>
                        {selectedEvent.reason && (
                          <p className="text-sm text-slate-300">
                            <span className="text-slate-500 mr-1">สาเหตุ:</span>
                            {selectedEvent.reason}
                          </p>
                        )}
                      </div>

                      <div className="rounded-lg border border-slate-700/70 bg-slate-950/70 overflow-hidden min-h-36">
                        {selectedEvent.screenshot ? (
                          <img
                            src={selectedEvent.screenshot}
                            alt={`เหตุการณ์ล้ม ${formatTime(selectedEvent.timestamp)}`}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-xs text-slate-500 px-3 text-center">
                            ยังไม่มีรูปเหตุการณ์นี้
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-slate-500">เลือกเหตุการณ์จากไทม์ไลน์เพื่อดูรายละเอียด</div>
                  )}
                </div>
              </div>

              <div className="grid lg:grid-cols-2 min-h-[360px] border-t border-slate-700/70">
                <div className="border-b lg:border-b-0 lg:border-r border-slate-700/70 bg-slate-900/40">
                  <div className="px-5 py-3 border-b border-slate-700/70 flex items-center gap-2 text-white">
                    <BarChart3 className="w-4 h-4 text-emerald-300" />
                    <h4 className="text-sm font-semibold tracking-wide">สถิติ 30 วัน</h4>
                  </div>
                  <ScrollArea className="h-[320px] px-5 py-4">
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="rounded-lg border border-slate-700 bg-slate-900/80 p-3">
                        <p className="text-[11px] text-slate-500">รวมการล้ม</p>
                        <p className="text-2xl font-bold text-rose-200">{totalFalls}</p>
                      </div>
                      <div className="rounded-lg border border-slate-700 bg-slate-900/80 p-3">
                        <p className="text-[11px] text-slate-500">ความมั่นใจเฉลี่ย</p>
                        <p className="text-2xl font-bold text-cyan-200">{(averageConfidence * 100).toFixed(1)}%</p>
                      </div>
                      <div className="rounded-lg border border-slate-700 bg-slate-900/80 p-3">
                        <p className="text-[11px] text-slate-500">วันมีเหตุการณ์</p>
                        <p className="text-2xl font-bold text-amber-200">{activeDays}</p>
                      </div>
                      <div className="rounded-lg border border-slate-700 bg-slate-900/80 p-3">
                        <p className="text-[11px] text-slate-500">ตำแหน่งหลัก</p>
                        <p className="text-sm font-semibold text-slate-200 mt-1 truncate">{topLocation}</p>
                      </div>
                    </div>

                    <div className="rounded-lg border border-slate-700 bg-slate-950/70 p-3 mb-4">
                      <p className="text-[11px] text-slate-400 mb-2">ช่วงเวลาเสี่ยงสูงสุด</p>
                      <p className="text-sm text-rose-200 font-medium">{peakHourLabel}</p>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[11px] text-slate-400">Heatmap รายชั่วโมง</p>
                      <div
                        className="grid gap-1 rounded-lg border border-slate-700 bg-slate-950/70 p-2"
                        style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}
                      >
                        {hourlyData.map((item) => {
                          const ratio = maxHourlyCount > 0 ? item.count / maxHourlyCount : 0;
                          return (
                            <div
                              key={item.hour}
                              className={cn(
                                'h-8 rounded-sm transition-transform hover:scale-y-110 origin-bottom',
                                ratio === 0 && 'bg-slate-800/80',
                                ratio > 0 && ratio <= 0.35 && 'bg-cyan-500/45',
                                ratio > 0.35 && ratio <= 0.7 && 'bg-amber-500/65',
                                ratio > 0.7 && 'bg-rose-500/80'
                              )}
                              title={`${item.hour.toString().padStart(2, '0')}:00 - ${item.count} ครั้ง`}
                            />
                          );
                        })}
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-500 font-mono px-1">
                        <span>00</span>
                        <span>06</span>
                        <span>12</span>
                        <span>18</span>
                        <span>23</span>
                      </div>
                    </div>

                    <div className="mt-4">
                      <p className="text-[11px] text-slate-400 mb-2">แนวโน้ม 4 สัปดาห์ล่าสุด</p>
                      <div className="flex items-end gap-2 h-16">
                        {weeklyData.map((item) => {
                          const ratio = maxWeeklyCount > 0 ? item.count / maxWeeklyCount : 0;
                          return (
                            <div key={item.label} className="flex-1 flex flex-col items-center gap-1">
                              <div className="w-full h-12 rounded-t-sm bg-slate-800/80 flex items-end">
                                <div
                                  className="w-full rounded-t-sm bg-gradient-to-t from-cyan-400 to-emerald-300"
                                  style={{ height: `${Math.max(6, ratio * 100)}%` }}
                                />
                              </div>
                              <span className="text-[10px] text-slate-500 font-mono">{item.label}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </ScrollArea>
                </div>

                <div className="bg-gradient-to-br from-slate-900/80 to-violet-950/25">
                  <div className="px-5 py-3 border-b border-slate-700/70 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-white">
                      <BrainCircuit className="w-4 h-4 text-violet-300" />
                      <h4 className="text-sm font-semibold tracking-wide">LLM วิเคราะห์สถิติ</h4>
                    </div>
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

                  <ScrollArea className="h-[320px] px-5 py-4">
                    {isAnalyzing && (
                      <div className="rounded-xl border border-violet-400/30 bg-violet-500/8 px-4 py-6 text-center text-violet-200">
                        <RefreshCcw className="w-5 h-5 animate-spin mx-auto mb-2" />
                        กำลังประมวลผลสรุปเชิงวิเคราะห์...
                      </div>
                    )}

                    {!isAnalyzing && insight && (
                      <div className="space-y-4">
                        <div className="flex justify-end">
                          <Badge className="bg-violet-500/20 text-violet-100 border-violet-300/30">
                            <Sparkles className="w-3.5 h-3.5 mr-1" />
                            ระบบวิเคราะห์ AI
                          </Badge>
                        </div>

                        <div className="rounded-xl border border-violet-400/25 bg-violet-500/10 p-4">
                          <p className="text-violet-100 leading-relaxed">{insight.summary}</p>
                        </div>

                        <div>
                          <h5 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-300" />
                            ประเด็นสำคัญ
                          </h5>
                          <ul className="space-y-2 text-sm text-slate-300">
                            {insight.highlights.map((item) => (
                              <li key={item} className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div>
                          <h5 className="text-sm font-semibold text-white mb-2">ข้อเสนอแนะ</h5>
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
                    )}

                    {!isAnalyzing && !insight && (
                      <div className="h-[240px] rounded-xl border border-dashed border-slate-700 flex flex-col items-center justify-center gap-3 text-slate-500 text-center">
                        <BrainCircuit className="w-8 h-8 text-violet-300/70" />
                        <p>กด “วิเคราะห์ใหม่” เพื่อให้ระบบสรุปเชิงสถิติ</p>
                      </div>
                    )}
                  </ScrollArea>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AnalyticsSection;
