import React, { useState, useEffect } from 'react';
import { Settings, Send, Eye, EyeOff, Volume2, MapPin, Sliders, Webhook, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { defaultSettings, SettingsService } from '@/services/settings';
import type { FallGuardSettings } from '@/services/settings';
import { LineMessagingService, LineWebhookService } from '@/services/lineMessaging';

interface SettingsPanelProps {
  onSettingsChange?: (settings: FallGuardSettings) => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ onSettingsChange }) => {
  const [settings, setSettings] = useState<FallGuardSettings>(defaultSettings);
  const [showToken, setShowToken] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('line');
  
  // Load settings on mount
  useEffect(() => {
    const loaded = SettingsService.loadSettings();
    setSettings(loaded);
    // Set active tab based on configuration
    if (loaded.useWebhook && loaded.webhookUrl) {
      setActiveTab('webhook');
    }
  }, []);
  
  const handleSave = () => {
    SettingsService.saveSettings(settings);
    onSettingsChange?.(settings);
    toast.success('บันทึกการตั้งค่าสำเร็จ');
    setIsOpen(false);
  };
  
  const handleTestNotification = async () => {
    setIsTesting(true);
    
    try {
      if (settings.useWebhook && settings.webhookUrl) {
        // Test via webhook
        const service = new LineWebhookService(settings.webhookUrl);
        const result = await service.sendViaWebhook('🧪 ทดสอบการแจ้งเตือนจาก FallGuard', undefined, {
          eventType: 'test_notification',
          timestamp: new Date().toISOString()
        });
        
        if (result.success) {
          toast.success('ส่งการแจ้งเตือนทดสอบสำเร็จ (Webhook)');
        } else {
          toast.error(`ส่งไม่สำเร็จ: ${result.message}`);
        }
      } else if (settings.channelAccessToken && settings.userId) {
        // Test via LINE Messaging API
        const service = new LineMessagingService({
          channelAccessToken: settings.channelAccessToken,
          userId: settings.userId
        });
        const result = await service.sendTestNotification();
        
        if (result.success) {
          toast.success('ส่งการแจ้งเตือนทดสอบสำเร็จ (LINE Messaging API)');
        } else {
          toast.error(`ส่งไม่สำเร็จ: ${result.message}`);
        }
      } else {
        toast.error('กรุณาตั้งค่าการแจ้งเตือนก่อน');
      }
    } catch (error) {
      toast.error('เกิดข้อผิดพลาดในการทดสอบ');
    } finally {
      setIsTesting(false);
    }
  };
  
  const updateSetting = <K extends keyof FallGuardSettings>(
    key: K, 
    value: FallGuardSettings[K]
  ) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Settings className="w-4 h-4" />
          ตั้งค่า
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            ตั้งค่าระบบ
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* LINE / Webhook Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="line" onClick={() => updateSetting('useWebhook', false)}>
                <MessageSquare className="w-4 h-4 mr-2" />
                LINE API
              </TabsTrigger>
              <TabsTrigger value="webhook" onClick={() => updateSetting('useWebhook', true)}>
                <Webhook className="w-4 h-4 mr-2" />
                Webhook
              </TabsTrigger>
            </TabsList>
            
            {/* LINE Messaging API */}
            <TabsContent value="line">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Send className="w-4 h-4 text-green-500" />
                    LINE Messaging API
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                    <p className="text-amber-400 text-xs">
                      ⚠️ ต้องสร้าง LINE Bot และมี Backend Server สำหรับอัปโหลดรูปภาพ
                      <a 
                        href="https://developers.line.biz/en/docs/messaging-api/" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="underline ml-1"
                      >
                        ดูวิธีสร้าง
                      </a>
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="channel-token">Channel Access Token</Label>
                    <div className="relative">
                      <Input
                        id="channel-token"
                        type={showToken ? 'text' : 'password'}
                        value={settings.channelAccessToken}
                        onChange={(e) => updateSetting('channelAccessToken', e.target.value)}
                        placeholder="ใส่ Channel Access Token"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowToken(!showToken)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="user-id">User ID (หรือ Group ID)</Label>
                    <Input
                      id="user-id"
                      value={settings.userId}
                      onChange={(e) => updateSetting('userId', e.target.value)}
                      placeholder="Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    />
                    <p className="text-xs text-slate-500">
                      เริ่มต้นด้วย U สำหรับผู้ใช้ หรือ C สำหรับกลุ่ม
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            {/* Webhook */}
            <TabsContent value="webhook">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Webhook className="w-4 h-4 text-purple-500" />
                    Webhook (IFTTT/Zapier)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                    <p className="text-blue-400 text-xs">
                      💡 ใช้ IFTTT/Zapier หรือใช้ LINE Relay ในโปรเจกต์นี้ (ดูไฟล์ .env.relay.example)
                      <a 
                        href="https://ifttt.com/" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="underline ml-1"
                      >
                        ไปที่ IFTTT
                      </a>
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="webhook-url">Webhook URL</Label>
                    <Input
                      id="webhook-url"
                      value={settings.webhookUrl}
                      onChange={(e) => updateSetting('webhookUrl', e.target.value)}
                      placeholder="https://maker.ifttt.com/trigger/..."
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
          
          {/* Detection Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sliders className="w-4 h-4 text-blue-500" />
                การตรวจจับ
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Sensitivity */}
              <div className="space-y-3">
                <div className="flex justify-between">
                  <Label>ความไวในการตรวจจับ</Label>
                  <span className="text-sm font-medium">{settings.sensitivity}/10</span>
                </div>
                <Slider
                  value={[settings.sensitivity]}
                  onValueChange={([value]) => updateSetting('sensitivity', value)}
                  min={1}
                  max={10}
                  step={1}
                />
                <p className="text-xs text-slate-500">
                  ค่าสูง = ตรวจจับง่ายขึ้น (อาจมี false positive)
                </p>
              </div>
              
              {/* Cooldown */}
              <div className="space-y-3">
                <div className="flex justify-between">
                  <Label>ระยะเวลารอแจ้งเตือนซ้ำ (วินาที)</Label>
                  <span className="text-sm font-medium">{settings.cooldownSeconds}s</span>
                </div>
                <Slider
                  value={[settings.cooldownSeconds]}
                  onValueChange={([value]) => updateSetting('cooldownSeconds', value)}
                  min={5}
                  max={60}
                  step={5}
                />
              </div>

              {/* Max People */}
              <div className="space-y-3">
                <div className="flex justify-between">
                  <Label>จำนวนคนสูงสุดที่ตรวจจับพร้อมกัน</Label>
                  <span className="text-sm font-medium">{settings.maxPoses} คน</span>
                </div>
                <Slider
                  value={[settings.maxPoses]}
                  onValueChange={([value]) => updateSetting('maxPoses', value)}
                  min={1}
                  max={6}
                  step={1}
                />
                <p className="text-xs text-slate-500">
                  ค่าสูง = ตรวจจับหลายคนได้มากขึ้น แต่ใช้ทรัพยากรเครื่องมากขึ้น
                </p>
              </div>
            </CardContent>
          </Card>
          
          {/* Other Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="w-4 h-4 text-amber-500" />
                อื่นๆ
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="location">ชื่อสถานที่ / กล้อง</Label>
                <Input
                  id="location"
                  value={settings.locationName}
                  onChange={(e) => updateSetting('locationName', e.target.value)}
                  placeholder="เช่น บ้าน, ห้องนอน, กล้องหน้าบ้าน"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Volume2 className="w-4 h-4" />
                  <Label htmlFor="sound">เสียงแจ้งเตือน</Label>
                </div>
                <Switch
                  id="sound"
                  checked={settings.enableSound}
                  onCheckedChange={(checked) => updateSetting('enableSound', checked)}
                />
              </div>
            </CardContent>
          </Card>
          
          {/* Test Button */}
          <Button
            onClick={handleTestNotification}
            disabled={isTesting}
            variant="outline"
            className="w-full"
          >
            {isTesting ? 'กำลังส่ง...' : 'ทดสอบการแจ้งเตือน'}
          </Button>
        </div>
        
        {/* Save Button */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => setIsOpen(false)}
            className="flex-1"
          >
            ยกเลิก
          </Button>
          <Button
            onClick={handleSave}
            className="flex-1 bg-blue-500 hover:bg-blue-600"
          >
            บันทึกการตั้งค่า
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsPanel;
