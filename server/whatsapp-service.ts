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
   * Normalize phone number by removing trunk prefix and non-digits
   */
  private static normalizePhone(phone: string, countryCode: string): string {
    let cleanPhone = phone.replace(/\D/g, '');
    const cleanCountryCode = countryCode.replace(/\D/g, '');
    
    // Remove leading trunk '0' for countries that use it
    const trunkPrefixCountries = ['44', '61', '65', '33', '49', '81', '82', '60', '971', '966'];
    if (trunkPrefixCountries.includes(cleanCountryCode) && cleanPhone.startsWith('0')) {
      cleanPhone = cleanPhone.substring(1);
    }
    
    return cleanPhone;
  }

  /**
   * Format phone number to E.164 format for WhatsApp (international standard)
   */
  private static formatWhatsAppNumber(phone: string, countryCode: string): string {
    // Validate inputs
    if (!phone || !countryCode) {
      throw new Error('Phone number and country code are required');
    }

    const cleanCountryCode = countryCode.replace(/\D/g, '');
    const normalizedPhone = this.normalizePhone(phone, countryCode);
    
    // Basic validation
    if (!normalizedPhone || normalizedPhone.length < 6 || normalizedPhone.length > 14) {
      throw new Error('Invalid phone number length (must be 6-14 digits after normalization)');
    }
    
    if (!cleanCountryCode || cleanCountryCode.length === 0) {
      throw new Error('Invalid country code');
    }
    
    // Always build E.164 from country code + normalized national number
    const fullNumber = cleanCountryCode + normalizedPhone;
    
    // Enforce E.164 standard: total length must be 8-15 digits
    if (fullNumber.length < 8 || fullNumber.length > 15) {
      throw new Error(`Invalid E.164 phone number length: ${fullNumber.length} digits (must be 8-15)`);
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
    // Enhanced logging for message sending attempt
    console.log(`[WhatsApp] 📱 Attempting to send ${messageType} message to ${to}${appointmentId ? ` (Appointment: ${appointmentId})` : ''}`);
    
    try {
      const client = this.getTwilioClient();
      
      const messageParams = {
        body: message,
        from: this.TWILIO_PHONE,
        to: to
      };
      
      console.log(`[WhatsApp] 🚀 Sending message via Twilio from ${this.TWILIO_PHONE}`);
      const result = await client.messages.create(messageParams);

      // Enhanced success logging
      const statusInfo = result.status ? ` (Status: ${result.status})` : '';
      const priceInfo = result.price ? ` (Price: ${result.price})` : '';
      
      console.log(`[WhatsApp] ✅ Message sent successfully to ${to}`);
      console.log(`[WhatsApp] 📋 Twilio SID: ${result.sid}${statusInfo}${priceInfo}`);

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
          providerResponse: JSON.stringify({ 
            sid: result.sid, 
            status: result.status,
            price: result.price,
            direction: result.direction
          })
        });
        
        console.log(`[WhatsApp] 💾 Message logged to database for ${countryCode}${nationalNumber}`);
      } catch (dbError: any) {
        console.error(`[WhatsApp] ❌ Failed to log message to database: ${dbError.message}`);
      }

      return {
        success: true,
        message: 'WhatsApp message sent successfully',
        messageSid: result.sid
      };
    } catch (error: any) {
      // Enhanced error logging with Twilio-specific diagnostics
      const errorCode = error?.code || 'N/A';
      const moreInfo = error?.moreInfo || '';
      const status = error?.status || '';
      
      console.error(`[WhatsApp] ❌ Failed to send ${messageType} message to ${to}`);
      console.error(`[WhatsApp] 🔍 Error Code: ${errorCode}`);
      console.error(`[WhatsApp] 📝 Error Message: ${error.message}`);
      
      if (status) {
        console.error(`[WhatsApp] 📊 HTTP Status: ${status}`);
      }
      
      if (moreInfo) {
        console.error(`[WhatsApp] ℹ️ More Info: ${moreInfo}`);
      }
      
      // Log common Twilio WhatsApp errors for debugging
      if (errorCode === '63016') {
        console.error(`[WhatsApp] 🚫 WhatsApp number not registered with Twilio`);
      } else if (errorCode === '63015') {
        console.error(`[WhatsApp] ⏰ Message failed due to timing restrictions`);
      } else if (errorCode === '21211') {
        console.error(`[WhatsApp] 📞 Invalid 'To' phone number format`);
      } else if (errorCode === '21212') {
        console.error(`[WhatsApp] 📱 Invalid 'From' phone number format`);
      } else if (errorCode === '21614') {
        console.error(`[WhatsApp] 🚫 'To' number is not a valid mobile number`);
      }
      
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
          providerResponse: JSON.stringify({ 
            error: error.message,
            code: errorCode,
            status: status,
            moreInfo: moreInfo
          })
        });
        
        console.log(`[WhatsApp] 💾 Failed message logged to database for ${countryCode}${nationalNumber}`);
      } catch (dbError: any) {
        console.error(`[WhatsApp] ❌ Failed to log error to database: ${dbError.message}`);
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
    try {
      // Validate phone number before formatting
      const validation = this.validateWhatsAppNumber(phone, countryCode);
      if (!validation.valid) {
        return {
          success: false,
          message: 'WhatsApp message failed: Invalid phone number',
          error: validation.message
        };
      }

      const whatsappNumber = this.formatWhatsAppNumber(phone, countryCode);
      const message = this.generateAppointmentConfirmationMessage(data);
      
      return this.sendMessage(whatsappNumber, message, 'appointment_confirmation', appointmentId);
    } catch (error: any) {
      console.error(`[WhatsApp] Appointment confirmation formatting error: ${error.message}`);
      return {
        success: false,
        message: 'WhatsApp message failed: Phone number formatting error',
        error: error.message
      };
    }
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
    try {
      // Validate phone number before formatting
      const validation = this.validateWhatsAppNumber(phone, countryCode);
      if (!validation.valid) {
        return {
          success: false,
          message: 'WhatsApp message failed: Invalid phone number',
          error: validation.message
        };
      }

      const whatsappNumber = this.formatWhatsAppNumber(phone, countryCode);
      const message = this.generateStatusUpdateMessage(data);
      
      return this.sendMessage(whatsappNumber, message, 'status_update', appointmentId);
    } catch (error: any) {
      console.error(`[WhatsApp] Status update formatting error: ${error.message}`);
      return {
        success: false,
        message: 'WhatsApp message failed: Phone number formatting error',
        error: error.message
      };
    }
  }

  /**
   * Send bid notification WhatsApp message
   */
  static async sendBidNotification(
    phone: string,
    countryCode: string,
    data: BidNotificationData
  ): Promise<WhatsAppSendResult> {
    try {
      // Validate phone number before formatting
      const validation = this.validateWhatsAppNumber(phone, countryCode);
      if (!validation.valid) {
        return {
          success: false,
          message: 'WhatsApp message failed: Invalid phone number',
          error: validation.message
        };
      }

      const whatsappNumber = this.formatWhatsAppNumber(phone, countryCode);
      const message = this.generateBidNotificationMessage(data);
      
      return this.sendMessage(whatsappNumber, message, 'bid_notification');
    } catch (error: any) {
      console.error(`[WhatsApp] Bid notification formatting error: ${error.message}`);
      return {
        success: false,
        message: 'WhatsApp message failed: Phone number formatting error',
        error: error.message
      };
    }
  }

  /**
   * Send welcome message to new users
   */
  static async sendWelcomeMessage(
    phone: string,
    countryCode: string,
    customerName: string
  ): Promise<WhatsAppSendResult> {
    try {
      // Validate phone number before formatting
      const validation = this.validateWhatsAppNumber(phone, countryCode);
      if (!validation.valid) {
        return {
          success: false,
          message: 'WhatsApp message failed: Invalid phone number',
          error: validation.message
        };
      }

      const whatsappNumber = this.formatWhatsAppNumber(phone, countryCode);
      const message = this.generateWelcomeMessage(customerName);
      
      return this.sendMessage(whatsappNumber, message, 'welcome_message');
    } catch (error: any) {
      console.error(`[WhatsApp] Welcome message formatting error: ${error.message}`);
      return {
        success: false,
        message: 'WhatsApp message failed: Phone number formatting error',
        error: error.message
      };
    }
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
    try {
      // Validate phone number before formatting
      const validation = this.validateWhatsAppNumber(phone, countryCode);
      if (!validation.valid) {
        return {
          success: false,
          message: 'WhatsApp message failed: Invalid phone number',
          error: validation.message
        };
      }

      const whatsappNumber = this.formatWhatsAppNumber(phone, countryCode);
      const message = this.generateServiceProviderBookingMessage(data);
      
      return this.sendMessage(whatsappNumber, message, 'booking_request', appointmentId);
    } catch (error: any) {
      console.error(`[WhatsApp] Service provider notification formatting error: ${error.message}`);
      return {
        success: false,
        message: 'WhatsApp message failed: Phone number formatting error',
        error: error.message
      };
    }
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
    // Input validation
    if (!phone || !countryCode) {
      return { valid: false, message: 'Phone number and country code are required' };
    }

    const cleanCountryCode = countryCode.replace(/\D/g, '');
    const normalizedPhone = this.normalizePhone(phone, countryCode);

    // Basic phone number validation
    if (!/^\d{6,14}$/.test(normalizedPhone)) {
      return { valid: false, message: 'Phone number must be 6-14 digits after removing country code and trunk prefix' };
    }

    // Country code validation
    if (!cleanCountryCode || cleanCountryCode.length === 0) {
      return { valid: false, message: 'Invalid country code format' };
    }

    // Country-specific validation
    if (countryCode === '+91' || cleanCountryCode === '91') {
      // India: Must start with 6, 7, 8, or 9 and be exactly 10 digits
      if (!/^[6-9]\d{9}$/.test(normalizedPhone)) {
        return { valid: false, message: 'Invalid Indian mobile number format (must start with 6-9 and be 10 digits)' };
      }
    } else if (countryCode === '+1' || cleanCountryCode === '1') {
      // USA/Canada: Must be exactly 10 digits
      if (!/^\d{10}$/.test(normalizedPhone)) {
        return { valid: false, message: 'Invalid US/Canada phone number format (must be 10 digits)' };
      }
    } else if (countryCode === '+44' || cleanCountryCode === '44') {
      // UK: Accept both 07... (11 digits) and 7... (10 digits) formats
      const rawPhone = phone.replace(/\D/g, '');
      if (!/^(07\d{9}|7\d{9})$/.test(rawPhone)) {
        return { valid: false, message: 'Invalid UK mobile number format (must be 07xxxxxxxx or 7xxxxxxxx)' };
      }
      // After normalization, should be 10 digits starting with 7
      if (!/^7\d{9}$/.test(normalizedPhone)) {
        return { valid: false, message: 'Invalid UK mobile number format after normalization' };
      }
    } else if (countryCode === '+61' || cleanCountryCode === '61') {
      // Australia: Mobile numbers start with 4, accept both 04... and 4... formats
      const rawPhone = phone.replace(/\D/g, '');
      if (!/^(04\d{8}|4\d{8})$/.test(rawPhone)) {
        return { valid: false, message: 'Invalid Australian mobile number format (must be 04xxxxxxxx or 4xxxxxxxx)' };
      }
    }

    // Final E.164 length check
    const fullNumber = cleanCountryCode + normalizedPhone;
    if (fullNumber.length < 8 || fullNumber.length > 15) {
      return { valid: false, message: `Phone number length ${fullNumber.length} exceeds E.164 standard (8-15 digits)` };
    }

    return { valid: true };
  }
}