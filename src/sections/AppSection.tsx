import React, { useState, useCallback } from 'react';
import { Activity, Settings, Info } from 'lucide-react';
import { toast } from 'sonner';
import { usePoseDetection } from '@/hooks/usePoseDetection';
import type { FallDetectionResult } from '@/hooks/usePoseDetection';
import { LineMessagingService, LineWebhookService } from '@/services/lineMessaging';
import { SettingsService } from '@/services/settings';
import type { FallGuardSettings } from '@/services/settings';
import { FallHistoryService } from '@/services/fallHistory';
import CameraFeed from '@/components/CameraFeed';
import StatusIndicator from '@/components/StatusIndicator';
import SettingsPanel from '@/components/SettingsPanel';
import FallHistory from '@/components/FallHistory';
import FallAlertModal from '@/components/FallAlertModal';
import { Alert, AlertDescription } from '@/components/ui/alert';

const AppSection: React.FC = () => {
  const [settings, setSettings] = useState<FallGuardSettings>(SettingsService.loadSettings());
  const [showAlert, setShowAlert] = useState(false);
  const [lastFallResult, setLastFallResult] = useState<FallDetectionResult | null>(null);
  const [isSendingAlert, setIsSendingAlert] = useState(false);
  const [autoNotify, setAutoNotify] = useState(true);
  const screenshotRef = React.useRef<string>('');
  
  // Handle fall detection
  const handleFallDetected = useCallback((result: FallDetectionResult, screenshot: string) => {
    setLastFallResult(result);
    screenshotRef.current = screenshot;
    setShowAlert(true);
    
    // Save to history
    FallHistoryService.addFallEvent(
      result.confidence,
      result.reason,
      settings.locationName,
      result.personLabel,
      screenshot
    );
    
    // Auto-send if enabled
    if (autoNotify) {
      sendFallAlert(result);
    }
    
    toast.error('ตรวจพบการล้ม!', {
      description: `${result.personLabel ? `ผู้ล้ม: ${result.personLabel} | ` : ''}ความมั่นใจ: ${(result.confidence * 100).toFixed(1)}%`
    });
  }, [autoNotify, settings.locationName]);
  
  // Send fall alert
  const sendFallAlert = async (result?: FallDetectionResult) => {
    const fallResult = result || lastFallResult;
    
    if (!SettingsService.isNotificationConfigured()) {
      toast.error('กรุณาตั้งค่าการแจ้งเตือนก่อน (LINE API หรือ Webhook)');
      return;
    }
    
    setIsSendingAlert(true);
    
    try {
      let response;
      
      if (settings.useWebhook && settings.webhookUrl) {
        // Send via webhook
        const service = new LineWebhookService(settings.webhookUrl);
        const message = `🚨 FALL DETECTED!\n\nตรวจพบการล้ม!\n\n👤 ผู้ล้ม: ${fallResult?.personLabel || fallResult?.personId || '-'}\n📅 เวลา: ${new Date().toLocaleString('th-TH')}\n🎯 ความมั่นใจ: ${((fallResult?.confidence || 0) * 100).toFixed(1)}%\n📍 ตำแหน่ง: ${settings.locationName}\n\nกรุณาตรวจสอบผู้สูงอายุทันที!`;
        response = await service.sendViaWebhook(message, screenshotRef.current || undefined, {
          eventType: 'fall_alert',
          confidence: (fallResult?.confidence || 0) * 100,
          location: settings.locationName,
          personId: fallResult?.personId || '',
          personLabel: fallResult?.personLabel || '',
          timestamp: new Date().toISOString()
        });
      } else if (settings.channelAccessToken && settings.userId) {
        // Send via LINE Messaging API
        const service = new LineMessagingService({
          channelAccessToken: settings.channelAccessToken,
          userId: settings.userId
        });
        // Note: Image sending requires backend for URL generation
        response = await service.sendFallAlert(
          fallResult?.confidence || 0,
          settings.locationName
        );
      } else {
        toast.error('กรุณาตั้งค่าการแจ้งเตือนก่อน');
        setIsSendingAlert(false);
        return;
      }
      
      if (response.success) {
        toast.success('ส่งการแจ้งเตือนสำเร็จ');
        setShowAlert(false);
      } else {
        toast.error(`ส่งไม่สำเร็จ: ${response.message}`);
      }
    } catch (error) {
      toast.error('เกิดข้อผิดพลาดในการส่งการแจ้งเตือน');
      console.error('Send alert error:', error);
    } finally {
      setIsSendingAlert(false);
    }
  };
  
  // Initialize pose detection
  const {
    videoRef,
    canvasRef,
    status,
    isModelLoading,
    error,
    startCamera,
    stopCamera,
    lastFallTime,
    fallCount,
    detectedPeople,
    effectiveMaxPoses,
    isPerformanceGuardActive,
    performanceHint
  } = usePoseDetection(handleFallDetected, settings.cooldownSeconds * 1000, settings.maxPoses);
  
  const [isCameraActive, setIsCameraActive] = useState(false);
  
  const handleStartCamera = async () => {
    await startCamera();
    setIsCameraActive(true);
    toast.success('กล้องทำงานแล้ว');
  };
  
  const handleStopCamera = () => {
    stopCamera();
    setIsCameraActive(false);
    toast.info('ปิดกล้องแล้ว');
  };
  
  const handleSettingsChange = (newSettings: FallGuardSettings) => {
    setSettings(newSettings);
    toast.success('อัปเดตการตั้งค่าแล้ว');
  };
  
  return (
    <section id="app-section" className="py-20 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            เริ่มตรวจจับ
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            เปิดกล้องเพื่อเริ่มการตรวจจับท่าทางด้วย AI
          </p>
        </div>
        
        {/* Setup Warning */}
        {!SettingsService.isNotificationConfigured() && (
          <Alert className="mb-6 bg-amber-500/10 border-amber-500/30">
            <Info className="w-4 h-4 text-amber-400" />
            <AlertDescription className="text-amber-400">
              กรุณาตั้งค่าการแจ้งเตือน (LINE API หรือ Webhook) เพื่อรับการแจ้งเตือน
            </AlertDescription>
          </Alert>
        )}
        
        {/* Main App Grid */}
        <div className="grid lg:grid-cols-5 gap-8">
          {/* Camera Feed - Takes 3 columns */}
          <div className="lg:col-span-3">
            <CameraFeed
              videoRef={videoRef}
              canvasRef={canvasRef}
              status={status}
              isModelLoading={isModelLoading}
              error={error}
              isActive={isCameraActive}
              onStart={handleStartCamera}
              onStop={handleStopCamera}
            />
          </div>
          
          {/* Status Panel - Takes 2 columns */}
          <div className="lg:col-span-2 space-y-6">
            {/* Status Indicator */}
            <StatusIndicator
              status={status}
              fallCount={fallCount}
              lastFallTime={lastFallTime}
              detectedPeople={detectedPeople}
              maxPoses={settings.maxPoses}
              effectiveMaxPoses={effectiveMaxPoses}
              isPerformanceGuardActive={isPerformanceGuardActive}
              performanceHint={performanceHint}
            />
            
            {/* Controls */}
            <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
              <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                <Settings className="w-5 h-5" />
                การควบคุม
              </h3>
              
              <div className="space-y-4">
                <div className="flex gap-2">
                  <SettingsPanel onSettingsChange={handleSettingsChange} />
                  <FallHistory />
                </div>
                
                {/* Auto Notify Toggle */}
                <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                  <span className="text-slate-300 text-sm">แจ้งเตือนอัตโนมัติ</span>
                  <button
                    onClick={() => setAutoNotify(!autoNotify)}
                    className={`
                      w-12 h-6 rounded-full transition-colors relative
                      ${autoNotify ? 'bg-blue-500' : 'bg-slate-600'}
                    `}
                  >
                    <span className={`
                      absolute top-1 w-4 h-4 rounded-full bg-white transition-all
                      ${autoNotify ? 'left-7' : 'left-1'}
                    `} />
                  </button>
                </div>
              </div>
            </div>
            
            {/* Instructions */}
            <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
              <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                <Activity className="w-5 h-5" />
                คำแนะนำ
              </h3>
              <ul className="space-y-2 text-sm text-slate-400">
                <li className="flex items-start gap-2">
                  <span className="text-blue-400">•</span>
                  ตั้งกล้องให้เห็นตัวผู้สูงอายุชัดเจน
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400">•</span>
                  แสงสว่างเพียงพอช่วยให้ตรวจจับแม่นยำขึ้น
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400">•</span>
                  ระบบจะส่งแจ้งเตือนซ้ำหลังจาก {settings.cooldownSeconds} วินาที
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400">•</span>
                  ตรวจจับคนพร้อมกันสูงสุด {settings.maxPoses} คน
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400">•</span>
                  ประมวลผลทั้งหมดบนเบราว์เซอร์ ไม่มีข้อมูลส่งออก
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
      
      {/* Fall Alert Modal */}
      <FallAlertModal
        isOpen={showAlert}
        onClose={() => setShowAlert(false)}
        fallResult={lastFallResult}
        onSendAlert={() => sendFallAlert()}
        isSending={isSendingAlert}
      />
    </section>
  );
};

export default AppSection;
