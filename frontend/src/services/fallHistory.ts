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
