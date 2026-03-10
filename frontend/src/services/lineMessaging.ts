import { getRelayWebhookUrl, resolveClientReachableUrl } from '@/services/relayUrls';

export interface LineMessagingResponse {
  success: boolean;
  message: string;
}

// LINE Messaging API Service
// Note: This requires a backend server or can use the LINE Messaging API SDK directly
// For client-side only, we need to use the Messaging API through a proxy or serverless function
// 
// For this demo, we'll provide the structure and a mock implementation
// In production, you should use a backend server to handle the API calls

export interface LineMessagingConfig {
  channelAccessToken: string;
  userId: string; // The LINE user ID to send messages to
}

export class LineMessagingService {
  private config: LineMessagingConfig;
  private apiUrl: string = 'https://api.line.me/v2/bot/message/push';
  
  constructor(config: LineMessagingConfig) {
    this.config = config;
  }
  
  // Send text message
  async sendTextMessage(text: string): Promise<LineMessagingResponse> {
    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.channelAccessToken}`
        },
        body: JSON.stringify({
          to: this.config.userId,
          messages: [
            {
              type: 'text',
              text: text
            }
          ]
        })
      });
      
      if (response.ok) {
        return { success: true, message: 'Message sent successfully' };
      } else {
        const error = await response.json();
        return { success: false, message: error.message || 'Failed to send message' };
      }
    } catch (error) {
      console.error('LINE Messaging API error:', error);
      return { success: false, message: 'Network error. Please check your connection.' };
    }
  }
  
  // Send image message (requires image URL)
  async sendImageMessage(imageUrl: string, previewUrl?: string): Promise<LineMessagingResponse> {
    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.channelAccessToken}`
        },
        body: JSON.stringify({
          to: this.config.userId,
          messages: [
            {
              type: 'image',
              originalContentUrl: imageUrl,
              previewImageUrl: previewUrl || imageUrl
            }
          ]
        })
      });
      
      if (response.ok) {
        return { success: true, message: 'Image sent successfully' };
      } else {
        const error = await response.json();
        return { success: false, message: error.message || 'Failed to send image' };
      }
    } catch (error) {
      console.error('LINE Messaging API error:', error);
      return { success: false, message: 'Network error. Please check your connection.' };
    }
  }
  
  // Send flex message (rich message format)
  async sendFlexMessage(altText: string, contents: object): Promise<LineMessagingResponse> {
    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.channelAccessToken}`
        },
        body: JSON.stringify({
          to: this.config.userId,
          messages: [
            {
              type: 'flex',
              altText: altText,
              contents: contents
            }
          ]
        })
      });
      
      if (response.ok) {
        return { success: true, message: 'Flex message sent successfully' };
      } else {
        const error = await response.json();
        return { success: false, message: error.message || 'Failed to send flex message' };
      }
    } catch (error) {
      console.error('LINE Messaging API error:', error);
      return { success: false, message: 'Network error. Please check your connection.' };
    }
  }
  
  // Send fall alert notification
  async sendFallAlert(
    confidence: number, 
    location?: string,
    imageUrl?: string
  ): Promise<LineMessagingResponse> {
    const timestamp = new Date().toLocaleString('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    const flexMessage = {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '🚨 FALL DETECTED!',
            weight: 'bold',
            size: 'xl',
            color: '#FF0000',
            align: 'center'
          }
        ],
        backgroundColor: '#FFE4E4'
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: 'ตรวจพบการล้ม!',
            weight: 'bold',
            size: 'lg',
            margin: 'md'
          },
          {
            type: 'separator',
            margin: 'md'
          },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'md',
            contents: [
              {
                type: 'text',
                text: `📅 เวลา: ${timestamp}`,
                size: 'sm'
              },
              {
                type: 'text',
                text: `🎯 ความมั่นใจ: ${(confidence * 100).toFixed(1)}%`,
                size: 'sm',
                margin: 'sm'
              }
            ]
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: 'กรุณาตรวจสอบผู้สูงอายุทันที!',
            weight: 'bold',
            color: '#FF0000',
            align: 'center',
            size: 'md'
          }
        ]
      }
    };
    
    // Add location if provided
    if (location) {
      (flexMessage.body as any).contents.push({
        type: 'text',
        text: `📍 ตำแหน่ง: ${location}`,
        size: 'sm',
        margin: 'sm'
      });
    }
    
    // Add image if provided
    if (imageUrl) {
      (flexMessage.body as any).contents.push({
        type: 'image',
        url: imageUrl,
        size: 'full',
        aspectRatio: '4:3',
        margin: 'md'
      });
    }
    
    return this.sendFlexMessage('Fall detected!', flexMessage);
  }
  
  // Send test notification
  async sendTestNotification(): Promise<LineMessagingResponse> {
    const message = `✅ FallGuard Test\n\nระบบแจ้งเตือนทำงานปกติ\nเวลา: ${new Date().toLocaleString('th-TH')}\n\nหากคุณได้รับข้อความนี้ แสดงว่าการตั้งค่า LINE Messaging API ถูกต้อง`;
    
    return this.sendTextMessage(message);
  }
  
  // Validate token format (rough check)
  static isValidTokenFormat(token: string): boolean {
    // Channel access tokens are typically longer
    return token.length >= 100 && token.startsWith('Bearer ') === false;
  }
  
  // Validate user ID format
  static isValidUserId(userId: string): boolean {
    // LINE user IDs typically start with 'U' and are alphanumeric
    return userId.startsWith('U') && userId.length >= 20;
  }
}

// Alternative: Using a simple webhook/proxy approach
// If you don't have a backend, you can use services like:
// - IFTTT
// - Zapier
// - Make (Integromat)
// - n8n
// - Or create a simple serverless function

export class LineWebhookService {
  private webhookUrl: string;
  private relaySecret: string;
  
  constructor(webhookUrl: string) {
    const candidate = (webhookUrl || '').trim() || getRelayWebhookUrl();
    this.webhookUrl = resolveClientReachableUrl(candidate, '/line-webhook');
    this.relaySecret = import.meta.env.VITE_LINE_RELAY_SECRET || '';
  }
  
  // Send message via webhook (IFTTT, Zapier, etc.)
  async sendViaWebhook(
    message: string,
    imageBase64?: string,
    metadata?: Record<string, string | number | boolean>
  ): Promise<LineMessagingResponse> {
    try {
      const payload: any = { message };
      if (imageBase64) {
        payload.image = imageBase64;
      }
      if (metadata) {
        payload.metadata = metadata;
      }
      
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.relaySecret ? { 'X-Relay-Secret': this.relaySecret } : {})
        },
        body: JSON.stringify(payload)
      });
      
      if (response.ok) {
        return { success: true, message: 'Message sent via webhook' };
      } else {
        let errorMessage = 'Webhook failed';
        try {
          const data = await response.json();
          errorMessage = data?.message || errorMessage;
        } catch {
          const text = await response.text();
          if (text) errorMessage = text;
        }
        return { success: false, message: errorMessage };
      }
    } catch (error) {
      console.error('Webhook error:', error);
      return { success: false, message: 'Network error' };
    }
  }
}

export default LineMessagingService;
