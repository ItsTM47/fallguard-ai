import { getRelayWebhookUrl, resolveClientReachableUrl } from '@/services/relayUrls';

export interface FallGuardSettings {
  // LINE Messaging API Settings
  channelAccessToken: string;
  userId: string;
  
  // Alternative: Webhook URL (for IFTTT, Zapier, etc.)
  webhookUrl: string;
  useWebhook: boolean;
  
  // Detection Settings
  sensitivity: number;
  cooldownSeconds: number;
  maxPoses: number;
  enableSound: boolean;
  locationName: string;
}

const SETTINGS_KEY = 'fallguard_settings';
const defaultWebhookUrl = getRelayWebhookUrl();

export const defaultSettings: FallGuardSettings = {
  channelAccessToken: '',
  userId: '',
  webhookUrl: defaultWebhookUrl,
  useWebhook: !!defaultWebhookUrl,
  sensitivity: 7,
  cooldownSeconds: 10,
  maxPoses: 3,
  enableSound: true,
  locationName: 'บ้าน'
};

export class SettingsService {
  // Save settings to localStorage
  static saveSettings(settings: FallGuardSettings): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }
  
  // Load settings from localStorage
  static loadSettings(): FallGuardSettings {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const merged = { ...defaultSettings, ...parsed } as FallGuardSettings;
        merged.webhookUrl = resolveClientReachableUrl(merged.webhookUrl || '', '/line-webhook');
        if (merged.useWebhook && !merged.webhookUrl) {
          merged.webhookUrl = defaultWebhookUrl;
        }
        return merged;
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
    return defaultSettings;
  }
  
  // Clear all settings
  static clearSettings(): void {
    try {
      localStorage.removeItem(SETTINGS_KEY);
    } catch (error) {
      console.error('Failed to clear settings:', error);
    }
  }
  
  // Update partial settings
  static updateSettings(partial: Partial<FallGuardSettings>): FallGuardSettings {
    const current = this.loadSettings();
    const updated = { ...current, ...partial };
    this.saveSettings(updated);
    return updated;
  }
  
  // Check if LINE Messaging is configured
  static isLineMessagingConfigured(): boolean {
    const settings = this.loadSettings();
    return !!settings.channelAccessToken && !!settings.userId;
  }
  
  // Check if Webhook is configured
  static isWebhookConfigured(): boolean {
    const settings = this.loadSettings();
    return settings.useWebhook && !!settings.webhookUrl;
  }
  
  // Check if any notification method is configured
  static isNotificationConfigured(): boolean {
    return this.isLineMessagingConfigured() || this.isWebhookConfigured();
  }
}

export default SettingsService;
