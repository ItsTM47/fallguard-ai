import React, { useEffect, useRef } from 'react';
import { AlertTriangle, X, Send, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { FallDetectionResult } from '@/hooks/usePoseDetection';

interface FallAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  fallResult: FallDetectionResult | null;
  onSendAlert?: () => void;
  isSending?: boolean;
  autoCloseDelay?: number;
}

const FallAlertModal: React.FC<FallAlertModalProps> = ({
  isOpen,
  onClose,
  fallResult,
  onSendAlert,
  isSending = false,
  autoCloseDelay = 8000
}) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Simple beep sound - not too annoying
  useEffect(() => {
    if (isOpen) {
      // Play single short beep
      try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContext) {
          const audioContext = new AudioContext();
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();
          
          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);
          
          oscillator.frequency.value = 600;
          oscillator.type = 'sine';
          
          gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
          
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.3);
        }
      } catch (error) {
        console.error('Failed to play alert sound:', error);
      }
      
      // Auto close timer
      timerRef.current = setTimeout(() => {
        onClose();
      }, autoCloseDelay);
    }
    
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [isOpen, autoCloseDelay, onClose]);
  
  const handleClose = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    onClose();
  };
  
  const handleSendAlert = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    onSendAlert?.();
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm border-red-500/50 bg-slate-900">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-red-500">
            <AlertTriangle className="w-6 h-6" />
            <span className="text-xl">ตรวจพบการล้ม</span>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Simple Status */}
          <div className="bg-gradient-to-br from-red-500/15 via-rose-500/10 to-slate-900 border border-red-500/30 rounded-xl p-4 text-center">
            <p className="text-red-400 font-medium">
              สถานะ: ล้ม
            </p>
            <div className="mt-2">
              <span className="inline-flex items-center rounded-full border border-amber-300/40 bg-amber-400/15 px-3 py-1 text-sm font-medium text-amber-200">
                {fallResult?.personLabel || fallResult?.personId || '-'}
              </span>
            </div>
            <p className="text-slate-400 text-sm mt-1">
              ความมั่นใจ: {((fallResult?.confidence || 0) * 100).toFixed(1)}%
            </p>
          </div>
          
          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={handleClose}
              className="flex-1"
            >
              <X className="w-4 h-4 mr-2" />
              ปิด
            </Button>
            
            {onSendAlert && (
              <Button
                onClick={handleSendAlert}
                disabled={isSending}
                className="flex-1 bg-red-500 hover:bg-red-600"
              >
                {isSending ? (
                  <>
                    <Clock className="w-4 h-4 mr-2 animate-spin" />
                    กำลังส่ง...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    ส่ง LINE
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FallAlertModal;
