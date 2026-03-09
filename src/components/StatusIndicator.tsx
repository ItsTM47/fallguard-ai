import React from 'react';
import type { PoseStatus } from '@/hooks/usePoseDetection';
import { Activity, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';

interface StatusIndicatorProps {
  status: PoseStatus;
  fallCount: number;
  lastFallTime: number | null;
  detectedPeople: number;
  maxPoses: number;
  effectiveMaxPoses: number;
  isPerformanceGuardActive: boolean;
  performanceHint: string | null;
}

const statusConfig = {
  safe: {
    label: 'ปลอดภัย',
    sublabel: 'Safe',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/20',
    borderColor: 'border-emerald-500/50',
    icon: CheckCircle,
    pulse: false
  },
  warning: {
    label: 'ตรวจพบความผิดปกติ',
    sublabel: 'Warning',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/20',
    borderColor: 'border-amber-500/50',
    icon: AlertTriangle,
    pulse: true
  },
  fall: {
    label: 'ตรวจพบการล้ม!',
    sublabel: 'FALL DETECTED!',
    color: 'text-red-400',
    bgColor: 'bg-red-500/20',
    borderColor: 'border-red-500/50',
    icon: Activity,
    pulse: true
  },
  detecting: {
    label: 'กำลังตรวจจับ...',
    sublabel: 'Detecting...',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
    borderColor: 'border-blue-500/50',
    icon: Loader2,
    pulse: false
  }
};

const StatusIndicator: React.FC<StatusIndicatorProps> = ({ 
  status, 
  fallCount, 
  lastFallTime,
  detectedPeople,
  maxPoses,
  effectiveMaxPoses,
  isPerformanceGuardActive,
  performanceHint
}) => {
  const config = statusConfig[status];
  const Icon = config.icon;
  
  const formatLastFall = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleString('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };
  
  return (
    <div className={`rounded-2xl border ${config.borderColor} ${config.bgColor} p-6 backdrop-blur-sm`}>
      <div className="flex items-center gap-4">
        {/* Status Icon */}
        <div className={`relative flex items-center justify-center w-16 h-16 rounded-full ${config.bgColor}`}>
          <Icon className={`w-8 h-8 ${config.color} ${status === 'detecting' ? 'animate-spin' : ''}`} />
          
          {/* Pulse Ring */}
          {config.pulse && (
            <>
              <span className={`absolute inset-0 rounded-full ${config.bgColor} animate-ping opacity-75`} />
              <span className={`absolute -inset-2 rounded-full ${config.bgColor} animate-pulse opacity-50`} />
            </>
          )}
        </div>
        
        {/* Status Text */}
        <div className="flex-1">
          <h3 className={`text-2xl font-bold ${config.color}`}>
            {config.label}
          </h3>
          <p className="text-slate-400 text-sm">
            {config.sublabel}
          </p>
        </div>
      </div>
      
      {/* Stats */}
      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="bg-slate-800/50 rounded-xl p-4">
          <p className="text-slate-400 text-sm">คนที่กำลังตรวจจับ</p>
          <p className="text-3xl font-bold text-white">{detectedPeople}/{effectiveMaxPoses}</p>
          <p className="text-xs text-slate-400 mt-1">ตั้งไว้สูงสุด {maxPoses} คน</p>
        </div>

        <div className="bg-slate-800/50 rounded-xl p-4">
          <p className="text-slate-400 text-sm">จำนวนการล้มที่ตรวจพบ</p>
          <p className="text-3xl font-bold text-white">{fallCount}</p>
        </div>
        
        <div className="bg-slate-800/50 rounded-xl p-4">
          <p className="text-slate-400 text-sm">การล้มล่าสุด</p>
          <p className="text-xl font-semibold text-white">
            {lastFallTime ? formatLastFall(lastFallTime) : '-'}
          </p>
        </div>
      </div>

      {isPerformanceGuardActive && (
        <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          {performanceHint || 'ระบบลดจำนวนคนที่ตรวจจับชั่วคราวเพื่อความเสถียร'}
        </div>
      )}
    </div>
  );
};

export default StatusIndicator;
