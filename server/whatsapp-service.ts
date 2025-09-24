import { getStorage } from './storage';
import type { InsertWhatsAppMessage } from '@shared/schema';

// WhatsApp message types for different business scenarios
export type WhatsAppMessageType = 
  | 'appointment_confirmation' 
  | 'booking_request'
  | 'status_update'
  | 'bid_notification'
  | 'welcome_message';

export interface WhatsAppSendResult {
  success: boolean;
  message: string;
  messageSid?: string;
  error?: string;
}

export interface AppointmentConfirmationData {
  customerName: string;
  serviceName: string;
  dateTime: string;
  location: string;
  carDetails: string;
  bookingId: string;
  mechanicName?: string;
  price?: number;
}

export interface StatusUpdateData {
  customerName: string;
  bookingId: string;
  status: string;
  serviceName: string;
  additionalInfo?: string;
}

export interface BidNotificationData {
  customerName: string;
  carDetails: string;
  bidAmount: number;
  bidId: string;
}

export interface ServiceProviderBookingData {
  providerName: string;
  customerName: string;
  serviceName: string;
  dateTime: string;
  location: string;
  carDetails: string;
  bookingId: string;
  customerPhone?: string;
  price?: number;
}

export class WhatsAppService {
  private static readonly TWILIO_PHONE = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';
  
  /**
   * Production safety checks for required environment variables
   */
  private static checkProductionRequirements(): void {
    const isProduction = process.env.NODE_ENV === 'production';
    
    if (isProduction) {
      if (!process.env.TWILIO_ACCOUNT_SID) {
        throw new Error('TWILIO_ACCOUNT_SID must be set in production');
      }
      
      if (!process.env.TWILIO_AUTH_TOKEN) {
        throw new Error('TWILIO_AUTH_TOKEN must be set in production');
      }
    }
  }

  /**
   * Initialize Twilio client
   */
  private static getTwilioClient() {
    this.checkProductionRequirements();
    
    // In development, return a mock client for testing
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      console.log('[WhatsApp] Development mode - returning mock client');
      return {
        messages: {
          create: async (options: any) => {
            console.log(`[WhatsApp] Mock message sent to ${options.to}: ${options.body}`);
            return { sid: 'mock_' + Date.now() };
          }
        }
      };
    }

    // Use dynamic import to avoid issues if twilio package isn't installed
    try {
      const twilio = require('twilio');
      return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    } catch (error: any) {
      console.error('[WhatsApp] Twilio package not found. Install with: npm install twilio');
      throw new Error('Twilio package not installed');
    }
  }

  /**
   * Format phone number to E.164 format for WhatsApp (international standard)
   */
  private static formatWhatsAppNumber(phone: string, countryCode: string): string {
    // Remove any non-digit characters from phone
    const cleanPhone = phone.replace(/\D/g, '');
    const cleanCountryCode = countryCode.replace(/\D/g, '');
    
    // Check if phone already includes country code
    let fullNumber = cleanPhone;
    if (!cleanPhone.startsWith(cleanCountryCode)) {
      fullNumber = cleanCountryCode + cleanPhone;
    }
    
    // Ensure E.164 format: + followed by country code and national number
    return `whatsapp:+${fullNumber}`;
  }

  /**
   * Generate appointment confirmation message
   */
  private static generateAppointmentConfirmationMessage(data: AppointmentConfirmationData): string {
    const priceText = data.price ? `\n💰 *Total Cost:* ₹${data.price.toLocaleString()}` : '';
    const mechanicText = data.mechanicName ? `\n👨‍🔧 *Mechanic:* ${data.mechanicName}` : '';
    
    return `🎉 *Appointment Confirmed!*

Hi ${data.customerName}! Your service appointment has been confirmed.

📋 *Booking Details:*
🆔 Booking ID: ${data.bookingId}
🔧 Service: ${data.serviceName}
📅 Date & Time: ${data.dateTime}
📍 Location: ${data.location}
🚗 Vehicle: ${data.carDetails}${mechanicText}${priceText}

We'll be ready to serve you! If you need to reschedule or have questions, please contact us.

*Ronak Motor Garage* - Your trusted automotive service center`;
  }

  /**
   * Generate status update message
   */
  private static generateStatusUpdateMessage(data: StatusUpdateData): string {
    const statusEmojis: { [key: string]: string } = {
      'confirmed': '✅',
      'in-progress': '🔄',
      'completed': '✅',
      'cancelled': '❌'
    };

    const emoji = statusEmojis[data.status] || '📋';
    const additionalText = data.additionalInfo ? `\n\n${data.additionalInfo}` : '';
    
    return `${emoji} *Service Update*

Hi ${data.customerName}!

Your service appointment status has been updated:

🆔 *Booking ID:* ${data.bookingId}
🔧 *Service:* ${data.serviceName}
📊 *Status:* ${data.status.toUpperCase()}${additionalText}

Thank you for choosing *Ronak Motor Garage*!`;
  }

  /**
   * Generate bid notification message
   */
  private static generateBidNotificationMessage(data: BidNotificationData): string {
    return `🚗 *New Bid Placed!*

Hi ${data.customerName}!

Great news! You've successfully placed a bid:

🆔 *Bid ID:* ${data.bidId}
🚗 *Vehicle:* ${data.carDetails}
💰 *Bid Amount:* ₹${data.bidAmount.toLocaleString()}

We'll notify you about the auction status. Good luck!

*Ronak Motor Garage* - Quality cars, competitive prices`;
  }

  /**
   * Generate welcome message for new users
   */
  private static generateWelcomeMessage(customerName: string): string {
    return `🎉 *Welcome to Ronak Motor Garage!*

Hi ${customerName}!

Thank you for joining us! We're excited to serve your automotive needs.

🔧 *Our Services:*
• Professional car maintenance
• Quality spare parts
• Expert repairs
• Car sales & auctions

📱 You can now book services, place bids, and track your appointments easily.

Need help? Just reply to this message!

*Ronak Motor Garage* - Your automotive partner`;
  }

  /**
   * Generate service provider booking notification message
   */
  private static generateServiceProviderBookingMessage(data: ServiceProviderBookingData): string {
    const priceText = data.price ? `\n💰 *Service Cost:* ₹${data.price.toLocaleString()}` : '';
    const customerPhoneText = data.customerPhone ? `\n📱 *Customer Phone:* ${data.customerPhone}` : '';
    
    return `🔔 *New Service Booking Request!*

Hi ${data.providerName}!

You have a new service booking request:

📋 *Booking Details:*
🆔 Booking ID: ${data.bookingId}
👤 Customer: ${data.customerName}
🔧 Service: ${data.serviceName}
📅 Date & Time: ${data.dateTime}
📍 Location: ${data.location}
🚗 Vehicle: ${data.carDetails}${customerPhoneText}${priceText}

Please prepare for this service appointment. Contact the customer if you need any additional information.

*Ronak Motor Garage* - Service Excellence Team`;
  }

  /**
   * Send WhatsApp message
   */
  private static async sendMessage(
    to: string, 
    message: string, 
    messageType: WhatsAppMessageType,
    appointmentId?: string
  ): Promise<WhatsAppSendResult> {
    try {
      const client = this.getTwilioClient();
      
      const result = await client.messages.create({
        body: message,
        from: this.TWILIO_PHONE,
        to: to
      });

      // Log message to database with E.164 phone number
      try {
        const storage = await getStorage();
        // Extract E.164 number from WhatsApp format: whatsapp:+[1-9]\d{6,14}
        const phoneMatch = to.match(/whatsapp:\+([1-9]\d{6,14})$/);
        const fullNumber = phoneMatch ? phoneMatch[1] : to.replace(/[^\d]/g, '');
        
        // For logging, we store the full E.164 number as phone and extract country code
        // This is more robust than assuming 10-digit format
        const countryCode = this.extractCountryCode(fullNumber);
        const nationalNumber = fullNumber.substring(countryCode.length); // Remove country code prefix
        
        await storage.logWhatsAppMessage({
          phone: nationalNumber,
          countryCode: `+${countryCode}`,
          messageType,
          content: message,
          status: 'sent',
          appointmentId: appointmentId || null,
          providerResponse: JSON.stringify({ sid: result.sid })
        });
      } catch (dbError: any) {
        console.error('[WhatsApp] Failed to log message to database:', dbError.message);
      }

      console.log(`[WhatsApp] Message sent successfully to ${to}. SID: ${result.sid}`);
      return {
        success: true,
        message: 'WhatsApp message sent successfully',
        messageSid: result.sid
      };
    } catch (error: any) {
      console.error(`[WhatsApp] Failed to send message to ${to}:`, error.message);
      
      // Log failed message attempt
      try {
        const storage = await getStorage();
        // Extract E.164 number from WhatsApp format consistently with success path
        const phoneMatch = to.match(/whatsapp:\+([1-9]\d{6,14})$/);
        const fullNumber = phoneMatch ? phoneMatch[1] : to.replace(/[^\d]/g, '');
        
        // Use same logic as success path for consistency
        const countryCode = this.extractCountryCode(fullNumber);
        const nationalNumber = fullNumber.substring(countryCode.length);
        
        await storage.logWhatsAppMessage({
          phone: nationalNumber,
          countryCode: `+${countryCode}`,
          messageType,
          content: message,
          status: 'failed',
          appointmentId: appointmentId || null,
          providerResponse: JSON.stringify({ error: error.message })
        });
      } catch (dbError: any) {
        console.error('[WhatsApp] Failed to log error to database:', dbError.message);
      }

      return {
        success: false,
        message: 'Failed to send WhatsApp message',
        error: error.message
      };
    }
  }

  /**
   * Send appointment confirmation WhatsApp message
   */
  static async sendAppointmentConfirmation(
    phone: string,
    countryCode: string,
    data: AppointmentConfirmationData,
    appointmentId?: string
  ): Promise<WhatsAppSendResult> {
    const whatsappNumber = this.formatWhatsAppNumber(phone, countryCode);
    const message = this.generateAppointmentConfirmationMessage(data);
    
    return this.sendMessage(whatsappNumber, message, 'appointment_confirmation', appointmentId);
  }

  /**
   * Send status update WhatsApp message
   */
  static async sendStatusUpdate(
    phone: string,
    countryCode: string,
    data: StatusUpdateData,
    appointmentId?: string
  ): Promise<WhatsAppSendResult> {
    const whatsappNumber = this.formatWhatsAppNumber(phone, countryCode);
    const message = this.generateStatusUpdateMessage(data);
    
    return this.sendMessage(whatsappNumber, message, 'status_update', appointmentId);
  }

  /**
   * Send bid notification WhatsApp message
   */
  static async sendBidNotification(
    phone: string,
    countryCode: string,
    data: BidNotificationData
  ): Promise<WhatsAppSendResult> {
    const whatsappNumber = this.formatWhatsAppNumber(phone, countryCode);
    const message = this.generateBidNotificationMessage(data);
    
    return this.sendMessage(whatsappNumber, message, 'bid_notification');
  }

  /**
   * Send welcome message to new users
   */
  static async sendWelcomeMessage(
    phone: string,
    countryCode: string,
    customerName: string
  ): Promise<WhatsAppSendResult> {
    const whatsappNumber = this.formatWhatsAppNumber(phone, countryCode);
    const message = this.generateWelcomeMessage(customerName);
    
    return this.sendMessage(whatsappNumber, message, 'welcome_message');
  }

  /**
   * Send booking notification to service provider
   */
  static async sendServiceProviderBookingNotification(
    phone: string,
    countryCode: string,
    data: ServiceProviderBookingData,
    appointmentId?: string
  ): Promise<WhatsAppSendResult> {
    const whatsappNumber = this.formatWhatsAppNumber(phone, countryCode);
    const message = this.generateServiceProviderBookingMessage(data);
    
    return this.sendMessage(whatsappNumber, message, 'booking_request', appointmentId);
  }

  /**
   * Get WhatsApp message history for a phone number
   */
  static async getMessageHistory(phone: string, limit: number = 20) {
    try {
      const storage = await getStorage();
      return await storage.getWhatsAppMessageHistory(phone, limit);
    } catch (error: any) {
      console.error('[WhatsApp] Failed to get message history:', error.message);
      return [];
    }
  }

  /**
   * Extract country code from a full E.164 formatted number
   */
  private static extractCountryCode(fullNumber: string): string {
    // Common country codes with their lengths for extraction
    const countryCodes = [
      { code: '91', length: 2 },   // India
      { code: '1', length: 1 },    // USA/Canada
      { code: '44', length: 2 },   // UK
      { code: '61', length: 2 },   // Australia
      { code: '65', length: 2 },   // Singapore
      { code: '971', length: 3 },  // UAE
      { code: '966', length: 3 },  // Saudi Arabia
      { code: '60', length: 2 },   // Malaysia
      { code: '86', length: 2 },   // China
      { code: '33', length: 2 },   // France
      { code: '49', length: 2 },   // Germany
      { code: '81', length: 2 },   // Japan
      { code: '82', length: 2 },   // South Korea
      { code: '55', length: 2 },   // Brazil
      { code: '7', length: 1 },    // Russia/Kazakhstan
    ];

    // Try to match country codes starting from longest to shortest
    for (const { code, length } of countryCodes.sort((a, b) => b.length - a.length)) {
      if (fullNumber.startsWith(code)) {
        return code;
      }
    }

    // Default fallback - assume 2-digit country code for most cases
    return fullNumber.substring(0, 2);
  }

  /**
   * Validate phone number format for WhatsApp
   */
  static validateWhatsAppNumber(phone: string, countryCode: string): { valid: boolean; message?: string } {
    // Basic phone number validation
    if (!/^\d{7,15}$/.test(phone)) {
      return { valid: false, message: 'Phone number must be 7-15 digits' };
    }

    // India-specific validation (main market)
    if (countryCode === '+91' && !/^[6-9]\d{9}$/.test(phone)) {
      return { valid: false, message: 'Invalid Indian mobile number format' };
    }

    return { valid: true };
  }
}