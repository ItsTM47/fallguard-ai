import React from 'react';
import { Camera, CameraOff, Play, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PoseStatus } from '@/hooks/usePoseDetection';

interface CameraFeedProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  status: PoseStatus;
  isModelLoading: boolean;
  error: string | null;
  isActive: boolean;
  onStart: () => void;
  onStop: () => void;
}

const CameraFeed: React.FC<CameraFeedProps> = ({
  videoRef,
  canvasRef,
  status,
  isModelLoading,
  error,
  isActive,
  onStart,
  onStop
}) => {
  const getStatusBorderColor = () => {
    switch (status) {
      case 'safe': return 'border-emerald-500 shadow-emerald-500/30';
      case 'warning': return 'border-amber-500 shadow-amber-500/30';
      case 'fall': return 'border-red-500 shadow-red-500/50';
      default: return 'border-blue-500 shadow-blue-500/20';
    }
  };
  
  return (
    <div className="relative">
      {/* Main Camera Container */}
      <div 
        className={`
          relative overflow-hidden rounded-2xl border-4 transition-all duration-300
          ${getStatusBorderColor()}
          ${isActive ? 'shadow-lg' : ''}
        `}
        style={{ aspectRatio: '16/10' }}
      >
        {/* Video Element */}
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover bg-slate-900"
          playsInline
          muted
        />
        
        {/* Canvas Overlay for Pose Detection */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />
        
        {/* Loading State */}
        {isModelLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="mt-4 text-white font-medium">กำลังโหลด AI Model...</p>
          </div>
        )}
        
        {/* Error State */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/95 p-6">
            <CameraOff className="w-16 h-16 text-red-500 mb-4" />
            <p className="text-red-400 text-center font-medium">{error}</p>
            <Button 
              onClick={onStart} 
              variant="outline" 
              className="mt-4"
            >
              ลองใหม่
            </Button>
          </div>
        )}
        
        {/* Inactive State */}
        {!isActive && !isModelLoading && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/95">
            <Camera className="w-16 h-16 text-slate-500 mb-4" />
            <p className="text-slate-400 text-center">
              กด "เปิดกล้อง" เพื่อเริ่มตรวจจับ
            </p>
          </div>
        )}
        
        {/* Status Badge */}
        {isActive && (
          <div className="absolute top-4 left-4 flex items-center gap-2">
            <div className={`
              w-3 h-3 rounded-full animate-pulse
              ${status === 'safe' ? 'bg-emerald-500' : ''}
              ${status === 'warning' ? 'bg-amber-500' : ''}
              ${status === 'fall' ? 'bg-red-500' : ''}
              ${status === 'detecting' ? 'bg-blue-500' : ''}
            `} />
            <span className="text-white text-sm font-medium bg-black/50 px-2 py-1 rounded">
              {status === 'safe' && 'ปลอดภัย'}
              {status === 'warning' && 'ตรวจพบความผิดปกติ'}
              {status === 'fall' && 'ตรวจพบการล้ม!'}
              {status === 'detecting' && 'กำลังตรวจจับ...'}
            </span>
          </div>
        )}
        
        {/* FPS Indicator */}
        {isActive && (
          <div className="absolute top-4 right-4">
            <span className="text-white text-xs font-mono bg-black/50 px-2 py-1 rounded">
              AI Active
            </span>
          </div>
        )}
      </div>
      
      {/* Control Buttons */}
      <div className="mt-4 flex justify-center gap-4">
        {!isActive ? (
          <Button
            onClick={onStart}
            disabled={isModelLoading}
            className="bg-blue-500 hover:bg-blue-600 text-white px-8 py-6 text-lg"
          >
            <Play className="w-5 h-5 mr-2" />
            เปิดกล้อง
          </Button>
        ) : (
          <Button
            onClick={onStop}
            variant="destructive"
            className="px-8 py-6 text-lg"
          >
            <Square className="w-5 h-5 mr-2" />
            ปิดกล้อง
          </Button>
        )}
      </div>
    </div>
  );
};

export default CameraFeed;
