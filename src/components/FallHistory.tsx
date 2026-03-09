import React, { useState, useEffect } from 'react';
import { History, Download, Trash2, Calendar, Clock, TrendingUp, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { FallHistoryService } from '@/services/fallHistory';
import type { FallEvent, FallStats } from '@/services/fallHistory';

const FallHistory: React.FC = () => {
  const [history, setHistory] = useState<FallEvent[]>([]);
  const [stats, setStats] = useState<FallStats | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  
  const loadHistory = () => {
    const data = FallHistoryService.getHistory();
    setHistory(data);
    setStats(FallHistoryService.getStats());
  };
  
  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen]);
  
  const handleClear = () => {
    if (confirm('ต้องการลบประวัติทั้งหมด?')) {
      FallHistoryService.clearHistory();
      loadHistory();
      toast.success('ลบประวัติเรียบร้อย');
    }
  };
  
  const handleDownload = () => {
    FallHistoryService.downloadCSV();
    toast.success('ดาวน์โหลดไฟล์ CSV สำเร็จ');
  };
  
  const handleDeleteOne = (id: string) => {
    FallHistoryService.deleteFallEvent(id);
    loadHistory();
  };
  
  const formatHour = (hour: number): string => {
    return `${hour.toString().padStart(2, '0')}:00 - ${(hour + 1).toString().padStart(2, '0')}:00`;
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <History className="w-4 h-4" />
          ประวัติการล้ม
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            ประวัติการล้ม
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Stats Cards */}
          {stats && (
            <div className="grid grid-cols-3 gap-3">
              <Card className="bg-slate-800/50">
                <CardContent className="p-4 text-center">
                  <AlertTriangle className="w-6 h-6 text-red-500 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-white">{stats.totalFalls}</p>
                  <p className="text-xs text-slate-400">ครั้งทั้งหมด</p>
                </CardContent>
              </Card>
              
              <Card className="bg-slate-800/50">
                <CardContent className="p-4 text-center">
                  <Calendar className="w-6 h-6 text-blue-500 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-white">
                    {Object.keys(stats.fallsByDate).length}
                  </p>
                  <p className="text-xs text-slate-400">วันที่มีเหตุการณ์</p>
                </CardContent>
              </Card>
              
              <Card className="bg-slate-800/50">
                <CardContent className="p-4 text-center">
                  <TrendingUp className="w-6 h-6 text-amber-500 mx-auto mb-2" />
                  <p className="text-lg font-bold text-white">
                    {(() => {
                      const risky = FallHistoryService.getMostRiskyTime();
                      return risky ? formatHour(risky.hour) : '-';
                    })()}
                  </p>
                  <p className="text-xs text-slate-400">ช่วงเวลาเสี่ยง</p>
                </CardContent>
              </Card>
            </div>
          )}
          
          {/* History List */}
          <Card className="bg-slate-800/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  รายการล่าสุด
                </CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDownload}
                    disabled={history.length === 0}
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClear}
                    disabled={history.length === 0}
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px]">
                {history.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <History className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>ยังไม่มีประวัติการล้ม</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {history.map((event) => (
                      <div
                        key={event.id}
                        className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg hover:bg-slate-700 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-red-400 font-medium">
                              ล้ม
                            </span>
                            {event.personLabel && (
                              <span className="inline-flex items-center rounded-full border border-amber-300/40 bg-amber-400/10 px-2 py-0.5 text-xs font-medium text-amber-200">
                                {event.personLabel}
                              </span>
                            )}
                            <span className="text-slate-400 text-sm">
                              {(event.confidence * 100).toFixed(0)}%
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                            <span>{event.date}</span>
                            <span>{event.time}</span>
                            {event.location && (
                              <span className="text-slate-600">@ {event.location}</span>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteOne(event.id)}
                        >
                          <Trash2 className="w-4 h-4 text-slate-500" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FallHistory;
