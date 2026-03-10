export interface FallEvent {
  id: string;
  timestamp: number;
  date: string;
  time: string;
  confidence: number;
  reason: string;
  location: string;
  personLabel?: string;
  screenshot?: string;
}

export interface FallStats {
  totalFalls: number;
  fallsByDate: Record<string, number>;
  fallsByHour: Record<number, number>;
  recentFalls: FallEvent[];
}

interface RelayEventItem {
  id: string;
  timestamp: number;
  eventType?: string;
  location?: string;
  personId?: string;
  personLabel?: string;
  confidencePct?: number | null;
  reason?: string;
  screenshotUrl?: string;
}

const resolveRelayBaseUrl = (): string => {
  const configuredWebhook = (import.meta.env.VITE_LINE_WEBHOOK_URL || '').trim();
  if (!configuredWebhook) return window.location.origin;

  try {
    const url = new URL(configuredWebhook, window.location.origin);
    return `${url.protocol}//${url.host}`;
  } catch {
    return window.location.origin;
  }
};

const toSafeTimestamp = (value: unknown): number => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return Date.now();
};

const normalizeScreenshotUrl = (value: unknown, relayBaseUrl: string): string => {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:image/')) {
    return raw;
  }
  if (raw.startsWith('/') && relayBaseUrl) {
    return `${relayBaseUrl}${raw}`;
  }
  return raw;
};

const mapRelayEventToFallEvent = (item: RelayEventItem, relayBaseUrl: string): FallEvent => {
  const timestamp = toSafeTimestamp(item.timestamp);
  const confidencePct = typeof item.confidencePct === 'number' && Number.isFinite(item.confidencePct)
    ? item.confidencePct
    : 0;
  const confidence = Math.max(0, Math.min(confidencePct / 100, 1));
  const dateObj = new Date(timestamp);
  const location = typeof item.location === 'string' ? item.location : '';
  const personLabel = typeof item.personLabel === 'string' && item.personLabel.trim()
    ? item.personLabel.trim()
    : (typeof item.personId === 'string' ? item.personId.trim() : '');
  const reason = typeof item.reason === 'string' && item.reason.trim()
    ? item.reason.trim()
    : (item.eventType || 'fall_alert');

  return {
    id: item.id || `db_${timestamp}`,
    timestamp,
    date: dateObj.toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }),
    time: dateObj.toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }),
    confidence,
    reason,
    location,
    personLabel: personLabel || undefined,
    screenshot: normalizeScreenshotUrl(item.screenshotUrl, relayBaseUrl) || undefined
  };
};

const FALL_HISTORY_KEY = 'fallguard_history';
const MAX_HISTORY_ITEMS = 100; // Keep last 100 falls

export class FallHistoryService {
  // Get all fall events
  static getHistory(): FallEvent[] {
    try {
      const saved = localStorage.getItem(FALL_HISTORY_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (error) {
      console.error('Failed to load fall history:', error);
    }
    return [];
  }

  static async getHistoryFromRelay(limit = 1500): Promise<FallEvent[]> {
    const relayBaseUrl = resolveRelayBaseUrl();
    if (!relayBaseUrl) {
      throw new Error('Relay base URL is not configured');
    }

    const endpoint = `${relayBaseUrl}/api/events?days=120&limit=${Math.max(1, Math.min(limit, 5000))}`;
    const response = await fetch(endpoint, { method: 'GET' });
    if (!response.ok) {
      throw new Error(`Relay events request failed (${response.status})`);
    }

    const payload = await response.json();
    if (!payload?.success || !Array.isArray(payload?.events)) {
      throw new Error('Invalid relay events response');
    }

    const mapped = payload.events.map((item: RelayEventItem) => mapRelayEventToFallEvent(item, relayBaseUrl));
    return mapped.sort((a: FallEvent, b: FallEvent) => b.timestamp - a.timestamp);
  }

  static async getHistoryPreferRelay(): Promise<FallEvent[]> {
    try {
      return await this.getHistoryFromRelay();
    } catch (error) {
      console.warn('Fallback to local history:', error);
      return this.getHistory();
    }
  }
  
  // Add new fall event
  static addFallEvent(
    confidence: number,
    reason: string,
    location: string,
    personLabel?: string,
    screenshot?: string
  ): FallEvent {
    const now = new Date();
    const event: FallEvent = {
      id: `fall_${now.getTime()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: now.getTime(),
      date: now.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }),
      time: now.toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }),
      confidence,
      reason,
      location,
      personLabel,
      screenshot
    };
    
    const history = this.getHistory();
    history.unshift(event); // Add to beginning
    
    // Keep only last MAX_HISTORY_ITEMS
    if (history.length > MAX_HISTORY_ITEMS) {
      history.splice(MAX_HISTORY_ITEMS);
    }
    
    try {
      localStorage.setItem(FALL_HISTORY_KEY, JSON.stringify(history));
    } catch (error) {
      console.error('Failed to save fall history:', error);
    }
    
    return event;
  }
  
  // Get fall statistics
  static getStats(): FallStats {
    const history = this.getHistory();
    
    const fallsByDate: Record<string, number> = {};
    const fallsByHour: Record<number, number> = {};
    
    history.forEach(event => {
      // Count by date
      const dateKey = new Date(event.timestamp).toLocaleDateString('th-TH');
      fallsByDate[dateKey] = (fallsByDate[dateKey] || 0) + 1;
      
      // Count by hour
      const hour = new Date(event.timestamp).getHours();
      fallsByHour[hour] = (fallsByHour[hour] || 0) + 1;
    });
    
    return {
      totalFalls: history.length,
      fallsByDate,
      fallsByHour,
      recentFalls: history.slice(0, 10)
    };
  }
  
  // Get falls for a specific date
  static getFallsByDate(date: string): FallEvent[] {
    const history = this.getHistory();
    return history.filter(event => {
      const eventDate = new Date(event.timestamp).toLocaleDateString('th-TH');
      return eventDate === date;
    });
  }
  
  // Get falls for a date range
  static getFallsByDateRange(startDate: Date, endDate: Date): FallEvent[] {
    const history = this.getHistory();
    return history.filter(event => {
      const eventDate = new Date(event.timestamp);
      return eventDate >= startDate && eventDate <= endDate;
    });
  }
  
  // Get falls for current month
  static getCurrentMonthFalls(): FallEvent[] {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    return this.getFallsByDateRange(startOfMonth, endOfMonth);
  }
  
  // Get falls for current week
  static getCurrentWeekFalls(): FallEvent[] {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);
    return this.getFallsByDateRange(startOfWeek, endOfWeek);
  }
  
  // Get most risky time (hour with most falls)
  static getMostRiskyTime(): { hour: number; count: number } | null {
    const stats = this.getStats();
    let maxHour = -1;
    let maxCount = 0;
    
    Object.entries(stats.fallsByHour).forEach(([hour, count]) => {
      if (count > maxCount) {
        maxCount = count;
        maxHour = parseInt(hour);
      }
    });
    
    if (maxHour === -1) return null;
    return { hour: maxHour, count: maxCount };
  }
  
  // Clear all history
  static clearHistory(): void {
    try {
      localStorage.removeItem(FALL_HISTORY_KEY);
    } catch (error) {
      console.error('Failed to clear fall history:', error);
    }
  }
  
  // Delete specific fall event
  static deleteFallEvent(id: string): void {
    const history = this.getHistory();
    const filtered = history.filter(event => event.id !== id);
    try {
      localStorage.setItem(FALL_HISTORY_KEY, JSON.stringify(filtered));
    } catch (error) {
      console.error('Failed to delete fall event:', error);
    }
  }
  
  // Export history as CSV
  static exportAsCSV(): string {
    const history = this.getHistory();
    const headers = ['Date', 'Time', 'Confidence', 'Reason', 'Location', 'PersonLabel'];
    const rows = history.map(event => [
      event.date,
      event.time,
      `${(event.confidence * 100).toFixed(1)}%`,
      event.reason,
      event.location,
      event.personLabel || ''
    ]);
    
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }
  
  // Download CSV file
  static downloadCSV(): void {
    const csv = this.exportAsCSV();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `fall_history_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  }
}

export default FallHistoryService;
