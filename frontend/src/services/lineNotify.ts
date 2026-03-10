export interface LineNotifyResponse {
  success: boolean;
  message: string;
}

export class LineNotifyService {
  private token: string;
  private apiUrl: string = 'https://notify-api.line.me/api/notify';
  
  constructor(token: string) {
    this.token = token;
  }
  
  // Convert base64 image to Blob
  private base64ToBlob(base64: string): Blob {
    const byteString = atob(base64.split(',')[1]);
    const mimeString = base64.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    
    return new Blob([ab], { type: mimeString });
  }
  
  // Send text notification
  async sendMessage(message: string): Promise<LineNotifyResponse> {
    try {
      const formData = new FormData();
      formData.append('message', message);
      
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`
        },
        body: formData
      });
      
      const data = await response.json();
      
      if (response.ok) {
        return { success: true, message: 'Notification sent successfully' };
      } else {
        return { success: false, message: data.message || 'Failed to send notification' };
      }
    } catch (error) {
      console.error('LINE Notify error:', error);
      return { success: false, message: 'Network error. Please check your connection.' };
    }
  }
  
  // Send notification with image
  async sendMessageWithImage(message: string, imageBase64: string): Promise<LineNotifyResponse> {
    try {
      const formData = new FormData();
      formData.append('message', message);
      
      // Convert base64 to blob and append as image file
      const imageBlob = this.base64ToBlob(imageBase64);
      formData.append('imageFile', imageBlob, 'fall-detection.jpg');
      
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`
        },
        body: formData
      });
      
      const data = await response.json();
      
      if (response.ok) {
        return { success: true, message: 'Notification with image sent successfully' };
      } else {
        return { success: false, message: data.message || 'Failed to send notification' };
      }
    } catch (error) {
      console.error('LINE Notify error:', error);
      return { success: false, message: 'Network error. Please check your connection.' };
    }
  }
  
  // Send fall alert notification
  async sendFallAlert(screenshot: string, confidence: number, location?: string): Promise<LineNotifyResponse> {
    const timestamp = new Date().toLocaleString('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    const message = `
🚨 FALL DETECTED! 🚨

ตรวจพบการล้ม!

📅 เวลา: ${timestamp}
🎯 ความมั่นใจ: ${(confidence * 100).toFixed(1)}%
${location ? `📍 ตำแหน่ง: ${location}` : ''}

กรุณาตรวจสอบผู้สูงอายุทันที!

---
ส่งจาก FallGuard AI
    `.trim();
    
    return this.sendMessageWithImage(message, screenshot);
  }
  
  // Test notification
  async sendTestNotification(): Promise<LineNotifyResponse> {
    const message = `
✅ FallGuard Test

ระบบแจ้งเตือนทำงานปกติ
เวลา: ${new Date().toLocaleString('th-TH')}

หากคุณได้รับข้อความนี้ แสดงว่าการตั้งค่า LINE Notify ถูกต้อง
    `.trim();
    
    return this.sendMessage(message);
  }
  
  // Validate token format
  static isValidTokenFormat(token: string): boolean {
    // LINE Notify tokens are typically 40+ characters
    return token.length >= 30 && /^[A-Za-z0-9+/=]+$/.test(token);
  }
}

export default LineNotifyService;
