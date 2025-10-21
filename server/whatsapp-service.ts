import { getStorage } from './storage';
import type { InsertWhatsAppMessage } from '@shared/schema';
import { 
  createCommunicationResult, 
  categorizeError, 
  isErrorRetryable,
  type CommunicationResult 
} from '@shared/communication-types';
import { 
  formatWhatsAppNumber, 
  extractCountryCode 
} from '@shared/phone-utils';
import { BaseCommunicationService, type RetryConfig, type CircuitBreakerConfig } from './base-communication-service';
import { sendEmailV2 } from './email-service';

interface TwilioError extends Error {
  code?: string | number;
  status?: number;
  message: string;
  moreInfo?: string;
}

interface TwilioMessageResponse {
  sid: string;
  status?: string;
  price?: string | null;
  direction?: string;
  [key: string]: unknown;
}

interface TwilioMessageOptions {
  body: string;
  from: string;
  to: string;
}

interface TwilioClient {
  messages: {
    create: (options: TwilioMessageOptions) => Promise<TwilioMessageResponse>;
  };
}

export type WhatsAppMessageType = 
  | 'appointment_confirmation' 
  | 'booking_request'
  | 'status_update'
  | 'bid_notification'
  | 'welcome_message';

export interface WhatsAppSendResult extends CommunicationResult {

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

/**
 * Internal helper class that extends BaseCommunicationService
 * Used for composition to maintain backward compatibility with static interface
 */
class WhatsAppServiceHelper extends BaseCommunicationService {
  constructor(retryConfig: RetryConfig, circuitBreakerConfig: CircuitBreakerConfig) {
    super('WhatsApp', retryConfig, circuitBreakerConfig);
  }
}

interface TwilioCredentials {
  accountSid: string;
  apiKey: string;
  apiKeySecret: string;
  phoneNumber: string;
}

export class WhatsAppService {
  private static twilioPhone: string | null = null;
  private static twilioCredentials: TwilioCredentials | null = null;

  private static readonly INITIAL_RETRY_DELAY = parseInt(process.env.WHATSAPP_RETRY_DELAY || '1000');
  private static readonly MAX_RETRY_DELAY = parseInt(process.env.WHATSAPP_MAX_RETRY_DELAY || '60000');
  private static readonly MAX_RETRIES = parseInt(process.env.WHATSAPP_MAX_RETRIES || '3');
  private static readonly BACKOFF_MULTIPLIER = parseFloat(process.env.WHATSAPP_BACKOFF_MULTIPLIER || '2');

  private static readonly CIRCUIT_FAILURE_THRESHOLD = parseInt(process.env.WHATSAPP_CIRCUIT_THRESHOLD || '5');
  private static readonly CIRCUIT_RECOVERY_MINUTES = parseInt(process.env.WHATSAPP_CIRCUIT_RECOVERY_MIN || '5');

  private static readonly ENABLE_EMAIL_FALLBACK = process.env.WHATSAPP_ENABLE_EMAIL_FALLBACK !== 'false';

  private static readonly helper = new WhatsAppServiceHelper(
    {
      initialDelayMs: WhatsAppService.INITIAL_RETRY_DELAY,
      maxDelayMs: WhatsAppService.MAX_RETRY_DELAY,
      maxRetries: WhatsAppService.MAX_RETRIES,
      backoffMultiplier: WhatsAppService.BACKOFF_MULTIPLIER
    },
    {
      failureThreshold: WhatsAppService.CIRCUIT_FAILURE_THRESHOLD,
      recoveryTimeoutMinutes: WhatsAppService.CIRCUIT_RECOVERY_MINUTES
    }
  );
  
  /**
   * Get Twilio credentials from Replit Connector
   */
  private static async getTwilioCredentials(): Promise<TwilioCredentials> {
    if (this.twilioCredentials) {
      return this.twilioCredentials;
    }

    const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
    const xReplitToken = process.env.REPL_IDENTITY 
      ? 'repl ' + process.env.REPL_IDENTITY 
      : process.env.WEB_REPL_RENEWAL 
      ? 'depl ' + process.env.WEB_REPL_RENEWAL 
      : null;

    if (!xReplitToken || !hostname) {
      console.warn('[WhatsApp] ⚠️ Replit connector environment not available, falling back to env vars');
      
      if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        const phoneNumber = process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_PHONE_NUMBER || 'whatsapp:+14155238886';
        this.twilioCredentials = {
          accountSid: process.env.TWILIO_ACCOUNT_SID,
          apiKey: process.env.TWILIO_ACCOUNT_SID,
          apiKeySecret: process.env.TWILIO_AUTH_TOKEN,
          phoneNumber
        };
        return this.twilioCredentials;
      }
      
      throw new Error('Twilio credentials not available');
    }

    try {
      const response = await fetch(
        'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=twilio',
        {
          headers: {
            'Accept': 'application/json',
            'X_REPLIT_TOKEN': xReplitToken
          }
        }
      );

      const data = await response.json();
      const connectionSettings = data.items?.[0];

      if (!connectionSettings || !connectionSettings.settings.account_sid || !connectionSettings.settings.api_key || !connectionSettings.settings.api_key_secret) {
        throw new Error('Twilio connector not properly configured');
      }

      this.twilioCredentials = {
        accountSid: connectionSettings.settings.account_sid,
        apiKey: connectionSettings.settings.api_key,
        apiKeySecret: connectionSettings.settings.api_key_secret,
        phoneNumber: connectionSettings.settings.phone_number || 'whatsapp:+14155238886'
      };

      console.log('[WhatsApp] ✅ Retrieved Twilio credentials from Replit Connector');
      return this.twilioCredentials;
    } catch (error) {
      const err = error as Error;
      console.error('[WhatsApp] ❌ Failed to get Twilio credentials from connector:', err.message);
      throw error;
    }
  }

  /**
   * Get WhatsApp phone number
   */
  private static async getWhatsAppPhone(): Promise<string> {
    if (this.twilioPhone) {
      return this.twilioPhone;
    }

    const credentials = await this.getTwilioCredentials();
    let phoneNumber = credentials.phoneNumber;

    if (!phoneNumber.startsWith('whatsapp:')) {
      phoneNumber = `whatsapp:${phoneNumber}`;
    }

    this.twilioPhone = phoneNumber;
    return phoneNumber;
  }

  /**
   * Initialize Twilio client using Replit Connector
   */
  private static async getTwilioClient(): Promise<TwilioClient> {
    try {
      const credentials = await this.getTwilioCredentials();
      
      console.log('[WhatsApp] 🔍 Twilio client initialization:');
      console.log(`[WhatsApp]    - Account SID: ${credentials.accountSid.substring(0, 6)}...`);
      console.log(`[WhatsApp]    - Phone: ${credentials.phoneNumber}`);
      console.log(`[WhatsApp]    - NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);

      const { default: twilio } = await import('twilio');
      const client = twilio(credentials.apiKey, credentials.apiKeySecret, {
        accountSid: credentials.accountSid
      }) as unknown as TwilioClient;
      
      console.log('[WhatsApp] ✅ Twilio client initialized successfully via Replit Connector');
      return client;
    } catch (error) {
      const err = error as Error;
      console.error(`[WhatsApp] ❌ Twilio initialization failed: ${err.message}`);
      
      console.warn('[WhatsApp] ⚠️ Using MOCK client for testing');
      return {
        messages: {
          create: async (options: TwilioMessageOptions): Promise<TwilioMessageResponse> => {
            console.log('[WhatsApp] 🎭 MOCK: Would send message:', {
              to: options.to,
              from: options.from,
              bodyLength: options.body.length
            });
            return { sid: 'mock_' + Date.now() };
          }
        }
      };
    }
  }

  /**
   * Wrapper for formatWhatsAppNumber with WhatsApp-specific logging
   */
  private static formatWhatsAppNumberWithLogging(phone: string, countryCode: string): string {
    
    try {
      const formattedNumber = formatWhatsAppNumber(phone, countryCode);
      return formattedNumber;
    } catch (error) {
      const err = error as Error;
      console.error(`[WhatsApp] ❌ Validation failed: ${err.message}`);
      throw error;
    }
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
   * Generate invoice notification message
   */
  private static generateInvoiceMessage(
    customerName: string,
    invoiceNumber: string,
    totalAmount: string,
    invoiceUrl: string
  ): string {
    return `🧾 *New Invoice from Ronak Motor Garage*

Hi ${customerName}!

Your invoice has been generated:

📋 *Invoice #:* ${invoiceNumber}
💰 *Total Amount:* ₹${totalAmount}

View your invoice here:
${invoiceUrl}

Please make payment within the due date.

Thank you for your business! 🚗

*Ronak Motor Garage* - Your trusted automotive service center`;
  }

  /**
   * Generate promotional message
   */
  private static generatePromotionalMessage(
    customerName: string | undefined,
    offerDetails: string,
    validUntil?: string,
    ctaUrl?: string
  ): string {
    let message = `🎉 *Special Offer from Ronak Motor Garage* 🎉\n\n`;
    
    if (customerName) {
      message += `Hi ${customerName}!\n\n`;
    }
    
    message += `${offerDetails}\n\n`;
    
    if (validUntil) {
      message += `⏰ *Valid until:* ${validUntil}\n\n`;
    }
    
    if (ctaUrl) {
      message += `Book now: ${ctaUrl}\n\n`;
    }
    
    message += `Don't miss out on this amazing deal! 🚗✨\n\n`;
    message += `*Ronak Motor Garage* - Quality service at great prices`;
    
    return message;
  }

  /**
   * Core message sending function (for internal use with retry wrapper)
   */
  private static async sendMessageCore(
    to: string,
    message: string,
    messageType: WhatsAppMessageType,
    appointmentId?: string
  ): Promise<TwilioMessageResponse> {
    console.log('[WhatsApp] 📤 Attempting to send message:');
    console.log(`[WhatsApp]    - To: ${to}`);
    console.log(`[WhatsApp]    - Type: ${messageType}`);
    console.log(`[WhatsApp]    - Message length: ${message.length} chars`);
    if (appointmentId) {
      console.log(`[WhatsApp]    - Appointment ID: ${appointmentId}`);
    }
    
    const client = await this.getTwilioClient();
    const fromPhone = await this.getWhatsAppPhone();
    
    const messageParams = {
      body: message,
      from: fromPhone,
      to: to
    };
    
    console.log(`[WhatsApp]    - From: ${fromPhone}`);
    
    try {
      const result = await client.messages.create(messageParams);
      console.log(`[WhatsApp] ✅ Message sent successfully! SID: ${result.sid}`);
      return result;
    } catch (error) {
      const twilioError = error as TwilioError;
      console.error(`[WhatsApp] ❌ Twilio API error occurred:`);
      console.error(`[WhatsApp]    - Error message: ${twilioError.message}`);
      console.error(`[WhatsApp]    - Error code: ${twilioError.code || 'N/A'}`);
      console.error(`[WhatsApp]    - HTTP status: ${twilioError.status || 'N/A'}`);
      console.error(`[WhatsApp]    - More info: ${twilioError.moreInfo || 'N/A'}`);
      
      // Provide helpful guidance for common errors
      if (twilioError.code === 63007) {
        console.error(`[WhatsApp] 📋 SOLUTION: Error 63007 means the WhatsApp sender number is not configured.`);
        console.error(`[WhatsApp]    To fix this:`);
        console.error(`[WhatsApp]    1. Go to Twilio Console: https://console.twilio.com/us1/develop/sms/senders/whatsapp-senders`);
        console.error(`[WhatsApp]    2. Enable WhatsApp for your number: ${fromPhone}`);
        console.error(`[WhatsApp]    3. OR use Twilio WhatsApp Sandbox for testing`);
        console.error(`[WhatsApp]    4. Update your Twilio connection settings in Replit with the enabled WhatsApp number`);
      } else if (twilioError.code === 21211) {
        console.error(`[WhatsApp] 📋 SOLUTION: Error 21211 - Invalid 'To' phone number.`);
        console.error(`[WhatsApp]    The recipient number must be in WhatsApp format: whatsapp:+[country code][number]`);
      } else if (twilioError.code === 21608) {
        console.error(`[WhatsApp] 📋 SOLUTION: Error 21608 - The number is not a valid WhatsApp number.`);
        console.error(`[WhatsApp]    The recipient must have an active WhatsApp account.`);
      }
      
      throw error;
    }
  }

  /**
   * Attempt email fallback when WhatsApp fails
   * 
   * @param email - Email address (if available)
   * @param message - Message content
   * @param subject - Email subject
   * @returns CommunicationResult
   */
  private static async attemptEmailFallback(
    email: string | undefined,
    message: string,
    subject: string
  ): Promise<CommunicationResult> {
    if (!this.ENABLE_EMAIL_FALLBACK) {
      return createCommunicationResult('email', false, 'Email fallback disabled', {
        errorType: 'service_unavailable'
      });
    }
    
    if (!email) {
      return createCommunicationResult('email', false, 'No email address available', {
        errorType: 'validation'
      });
    }
    
    try {
      const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@ronakmotorgarage.com';
      const result = await sendEmailV2({
        to: email,
        from: fromEmail,
        subject: subject,
        text: message,
        html: `<pre>${message}</pre>`
      });
      
      if (result.success) {
      } else {
      }
      
      return result;
    } catch (error) {
      const err = error as Error;
      console.error('[WhatsApp] ❌ Email fallback error:', err.message);
      return createCommunicationResult('email', false, `Email fallback error: ${err.message}`, {
        errorType: 'unknown'
      });
    }
  }

  /**
   * Send WhatsApp message with circuit breaker, retry mechanism, and fallback
   * 
   * @param to - WhatsApp number in E.164 format (whatsapp:+1234567890)
   * @param message - Message content
   * @param messageType - Type of message for tracking
   * @param appointmentId - Optional appointment ID for linking
   * @param fallbackEmail - Optional email for fallback notifications
   * @returns WhatsAppSendResult with success status and details
   */
  public static async sendMessage(
    to: string, 
    message: string, 
    messageType: WhatsAppMessageType,
    appointmentId?: string,
    fallbackEmail?: string
  ): Promise<WhatsAppSendResult> {

    const phoneMatch = to.match(/whatsapp:\+([1-9]\d{6,14})$/);
    const fullNumber = phoneMatch ? phoneMatch[1] : to.replace(/[^\d]/g, '');
    const countryCode = this.extractCountryCode(fullNumber);
    const nationalNumber = fullNumber.substring(countryCode.length);

    if (!this.helper['circuitBreaker'].canAttempt()) {
      const state = this.helper['circuitBreaker'].getState();

      const emailSubject = `${messageType.replace('_', ' ')} - Ronak Motor Garage`;
      const emailFallback = await this.attemptEmailFallback(fallbackEmail, message, emailSubject);
      if (emailFallback.success) {
        return {
          success: true,
          message: 'Message delivered via email fallback (circuit breaker open)',
          service: 'email' as const,
          fallbackUsed: 'email'
        };
      }
      
      return {
        success: false,
        message: `WhatsApp circuit breaker is ${state}, email fallback failed`,
        service: 'whatsapp' as const,
        error: 'Circuit breaker open, service unavailable',
        circuitBreakerOpen: true
      };
    }

    let messageId: string | null = null;
    try {
      const storage = await getStorage();
      const messageRecord = await storage.logWhatsAppMessage({
        phone: nationalNumber,
        countryCode: `+${countryCode}`,
        messageType,
        content: message,
        status: 'pending',
        appointmentId: appointmentId || null,
        providerResponse: JSON.stringify({ initiatedAt: new Date().toISOString() })
      });
      messageId = messageRecord.id;
    } catch (dbError) {
      const err = dbError as Error;
      console.error(`[WhatsApp] ⚠️ Database logging failed: ${err.message}`);
    }

    const operationName = `send ${messageType} to ${to}`;
    const { result, success, error, attempts } = await this.helper['executeWithProtection'](
      () => this.sendMessageCore(to, message, messageType, appointmentId),
      operationName,
      { skipCircuitBreaker: true }
    );

    if (messageId) {
      try {
        const storage = await getStorage();
        
        if (success && result) {
          await storage.updateWhatsAppMessage(messageId, {
            status: 'sent',
            messageSid: result.sid,
            retryCount: attempts - 1,
            providerResponse: JSON.stringify({ 
              sid: result.sid, 
              status: result.status,
              totalAttempts: attempts,
              circuitBreakerState: this.helper['circuitBreaker'].getState()
            })
          });
        } else {
          const twilioError = error as TwilioError;
          await storage.updateWhatsAppMessage(messageId, {
            status: this.helper['isRetryableError'](twilioError) ? 'retry_failed' : 'failed',
            retryCount: attempts - 1,
            lastRetryAt: new Date(),
            failureReason: twilioError.message,
            providerResponse: JSON.stringify({ 
              error: twilioError.message,
              code: (twilioError as any).code,
              totalAttempts: attempts,
              circuitBreakerState: this.helper['circuitBreaker'].getState()
            })
          });
        }
      } catch (dbError) {
        const err = dbError as Error;
        console.error(`[WhatsApp] ⚠️ Failed to update database: ${err.message}`);
      }
    }

    if (success && result) {
      return {
        success: true,
        message: 'WhatsApp message sent successfully',
        service: 'whatsapp' as const,
        messageSid: result.sid,
        retryCount: attempts - 1,
        totalAttempts: attempts
      };
    }

    const twilioError = error as TwilioError;
    console.error(`[WhatsApp] ❌ Failed after ${attempts} attempts: ${twilioError.message}`);

    const emailSubject = `${messageType.replace('_', ' ')} - Ronak Motor Garage`;
    const emailFallback = await this.attemptEmailFallback(fallbackEmail, message, emailSubject);
    
    if (emailFallback.success) {

      if (messageId) {
        try {
          const storage = await getStorage();
          await storage.updateWhatsAppMessage(messageId, {
            status: 'fallback_sent',
            providerResponse: JSON.stringify({ 
              originalError: twilioError.message,
              fallbackMethod: 'email',
              fallbackSuccess: true
            })
          });
        } catch (dbError) {
          console.error(`[WhatsApp] ⚠️ Failed to update fallback status: ${(dbError as Error).message}`);
        }
      }
      
      return {
        success: true,
        message: 'Message delivered via email fallback',
        service: 'email' as const,
        fallbackUsed: 'email',
        originalError: twilioError.message
      };
    }

    console.error('[WhatsApp] ❌ All delivery methods failed (WhatsApp, Email)');
    
    return {
      success: false,
      message: 'Failed to send message via WhatsApp and all fallbacks',
      service: 'whatsapp' as const,
      error: twilioError.message,
      retryCount: attempts - 1,
      totalAttempts: attempts,
      finalFailure: true,
      fallbackAttempted: true
    };
  }

  /**
   * Extract country code from full E.164 number
   * Uses longest match from known country codes
   */
  private static extractCountryCode(fullNumber: string): string {

    const digits = fullNumber.replace(/\D/g, '');

    for (let length = 4; length >= 1; length--) {
      const possibleCode = digits.substring(0, length);

      const knownCodes = [
        '1', '7', '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44', 
        '45', '46', '47', '48', '49', '51', '52', '53', '54', '55', '56', '57', '58', '60', '61',
        '62', '63', '64', '65', '66', '81', '82', '84', '86', '90', '91', '92', '93', '94', '95',
        '98', '212', '213', '216', '218', '220', '221', '222', '223', '224', '225', '226', '227',
        '228', '229', '230', '231', '232', '233', '234', '235', '236', '237', '238', '239', '240',
        '241', '242', '243', '244', '245', '246', '248', '249', '250', '251', '252', '253', '254',
        '255', '256', '257', '258', '260', '261', '262', '263', '264', '265', '266', '267', '268',
        '269', '290', '291', '297', '298', '299', '350', '351', '352', '353', '354', '355', '356',
        '357', '358', '359', '370', '371', '372', '373', '374', '375', '376', '377', '378', '380',
        '381', '382', '383', '385', '386', '387', '389', '420', '421', '423', '500', '501', '502',
        '503', '504', '505', '506', '507', '508', '509', '590', '591', '592', '593', '594', '595',
        '596', '597', '598', '599', '670', '672', '673', '674', '675', '676', '677', '678', '679',
        '680', '681', '682', '683', '685', '686', '687', '688', '689', '690', '691', '692', '850',
        '852', '853', '855', '856', '870', '878', '880', '886', '960', '961', '962', '963', '964',
        '965', '966', '967', '968', '970', '971', '972', '973', '974', '975', '976', '977', '992',
        '993', '994', '995', '996', '998'
      ];
      
      if (knownCodes.includes(possibleCode)) {
        return possibleCode;
      }
    }

    return digits.substring(0, 1);
  }

  /**
   * Send appointment confirmation message via WhatsApp
   */
  static async sendAppointmentConfirmation(
    phone: string,
    countryCode: string,
    data: AppointmentConfirmationData,
    fallbackEmail?: string
  ): Promise<WhatsAppSendResult> {
    const whatsappNumber = this.formatWhatsAppNumberWithLogging(phone, countryCode);
    const message = this.generateAppointmentConfirmationMessage(data);
    return this.sendMessage(whatsappNumber, message, 'appointment_confirmation', data.bookingId, fallbackEmail);
  }

  /**
   * Send status update message via WhatsApp
   */
  static async sendStatusUpdate(
    phone: string,
    countryCode: string,
    data: StatusUpdateData,
    fallbackEmail?: string
  ): Promise<WhatsAppSendResult> {
    const whatsappNumber = this.formatWhatsAppNumberWithLogging(phone, countryCode);
    const message = this.generateStatusUpdateMessage(data);
    return this.sendMessage(whatsappNumber, message, 'status_update', undefined, fallbackEmail);
  }

  /**
   * Send bid notification via WhatsApp
   */
  static async sendBidNotification(
    phone: string,
    countryCode: string,
    data: BidNotificationData,
    fallbackEmail?: string
  ): Promise<WhatsAppSendResult> {
    const whatsappNumber = this.formatWhatsAppNumberWithLogging(phone, countryCode);
    const message = this.generateBidNotificationMessage(data);
    return this.sendMessage(whatsappNumber, message, 'bid_notification', undefined, fallbackEmail);
  }

  /**
   * Send welcome message via WhatsApp
   */
  static async sendWelcomeMessage(
    phone: string,
    countryCode: string,
    customerName: string,
    fallbackEmail?: string
  ): Promise<WhatsAppSendResult> {
    const whatsappNumber = this.formatWhatsAppNumberWithLogging(phone, countryCode);
    const message = this.generateWelcomeMessage(customerName);
    return this.sendMessage(whatsappNumber, message, 'welcome_message', undefined, fallbackEmail);
  }

  /**
   * Send service provider booking notification via WhatsApp
   */
  static async sendServiceProviderNotification(
    phone: string,
    countryCode: string,
    data: ServiceProviderBookingData,
    fallbackEmail?: string
  ): Promise<WhatsAppSendResult> {
    const whatsappNumber = this.formatWhatsAppNumberWithLogging(phone, countryCode);
    const message = this.generateServiceProviderBookingMessage(data);
    return this.sendMessage(whatsappNumber, message, 'booking_request', data.bookingId, fallbackEmail);
  }

  /**
   * Send invoice notification via WhatsApp
   */
  static async sendInvoiceNotification(
    phone: string,
    countryCode: string,
    customerName: string,
    invoiceNumber: string,
    totalAmount: string,
    invoiceUrl: string,
    fallbackEmail?: string
  ): Promise<WhatsAppSendResult> {
    const whatsappNumber = this.formatWhatsAppNumberWithLogging(phone, countryCode);
    const message = this.generateInvoiceMessage(customerName, invoiceNumber, totalAmount, invoiceUrl);
    return this.sendMessage(whatsappNumber, message, 'status_update', undefined, fallbackEmail);
  }

  /**
   * Send promotional message via WhatsApp
   */
  static async sendPromotionalMessage(
    phone: string,
    countryCode: string,
    customerName: string | undefined,
    offerDetails: string,
    validUntil?: string,
    ctaUrl?: string,
    fallbackEmail?: string
  ): Promise<WhatsAppSendResult> {
    const whatsappNumber = this.formatWhatsAppNumberWithLogging(phone, countryCode);
    const message = this.generatePromotionalMessage(customerName, offerDetails, validUntil, ctaUrl);
    return this.sendMessage(whatsappNumber, message, 'status_update', undefined, fallbackEmail);
  }

  /**
   * Send bulk promotional messages to multiple customers
   */
  static async sendBulkPromotionalMessages(
    recipients: Array<{ phone: string; countryCode: string; customerName?: string; email?: string }>,
    offerDetails: string,
    validUntil?: string,
    ctaUrl?: string
  ): Promise<{
    total: number;
    successful: number;
    failed: number;
    results: Array<{ phone: string; success: boolean; error?: string }>;
  }> {
    const results: Array<{ phone: string; success: boolean; error?: string }> = [];
    let successful = 0;
    let failed = 0;

    for (const recipient of recipients) {
      try {
        const result = await this.sendPromotionalMessage(
          recipient.phone,
          recipient.countryCode,
          recipient.customerName,
          offerDetails,
          validUntil,
          ctaUrl,
          recipient.email
        );

        results.push({
          phone: recipient.phone,
          success: result.success,
          error: result.error
        });

        if (result.success) {
          successful++;
        } else {
          failed++;
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        const err = error as Error;
        results.push({
          phone: recipient.phone,
          success: false,
          error: err.message
        });
        failed++;
      }
    }

    return {
      total: recipients.length,
      successful,
      failed,
      results
    };
  }

  /**
   * Validate phone number format for WhatsApp
   */
  static validatePhoneNumber(phone: string, countryCode: string): { valid: boolean; message?: string } {
    try {
      formatWhatsAppNumber(phone, countryCode);
      return { valid: true };
    } catch (error) {
      const err = error as Error;
      return { valid: false, message: err.message };
    }
  }

  /**
   * Validate WhatsApp phone number (alias for validatePhoneNumber for compatibility)
   */
  static validateWhatsAppNumber(phone: string, countryCode: string): { valid: boolean; message?: string } {
    return this.validatePhoneNumber(phone, countryCode);
  }

  /**
   * Get WhatsApp message history for a phone number
   */
  static async getMessageHistory(phone: string, limit: number = 20): Promise<any[]> {
    try {
      const storage = await getStorage();
      const messages = await storage.getWhatsAppMessageHistory(phone, limit);
      return messages;
    } catch (error) {
      const err = error as Error;
      console.error(`[WhatsApp] ❌ Failed to get message history: ${err.message}`);
      return [];
    }
  }
  
  /**
   * Get circuit breaker status (for monitoring/debugging)
   */
  static getCircuitBreakerStatus(): {
    state: string;
    failureCount: number;
    threshold: number;
    recoveryMinutes: number;
  } {
    return {
      state: this.helper['circuitBreaker'].getState(),
      failureCount: this.helper['circuitBreaker'].getFailureCount(),
      threshold: this.CIRCUIT_FAILURE_THRESHOLD,
      recoveryMinutes: this.CIRCUIT_RECOVERY_MINUTES
    };
  }
  
  /**
   * Manually reset circuit breaker (for admin/debugging)
   */
  static resetCircuitBreaker(): void {
    this.helper.resetCircuitBreaker();
  }

  /**
   * Send bulk promotional WhatsApp messages to multiple users
   * 
   * @param recipients - Array of recipient objects with phone, countryCode, name, and optional email
   * @param message - Message content to send
   * @param messageSubject - Subject for email fallback
   * @returns Object with success/failure counts and detailed results
   */
  static async sendBulkPromotionalMessages(
    recipients: Array<{
      phone: string;
      countryCode: string;
      name: string;
      email?: string;
    }>,
    message: string,
    messageSubject: string = 'Special Offer from Ronak Motor Garage'
  ): Promise<{
    total: number;
    successful: number;
    failed: number;
    results: Array<{
      phone: string;
      name: string;
      success: boolean;
      method: 'whatsapp' | 'email' | 'none';
      error?: string;
    }>;
  }> {
    console.log(`[WhatsApp] 📢 Starting bulk promotional message to ${recipients.length} recipients`);
    
    const results: Array<{
      phone: string;
      name: string;
      success: boolean;
      method: 'whatsapp' | 'email' | 'none';
      error?: string;
    }> = [];

    let successful = 0;
    let failed = 0;

    for (const recipient of recipients) {
      try {
        const personalizedMessage = message.replace(/\{name\}/g, recipient.name);
        
        const whatsappNumber = this.formatWhatsAppNumberWithLogging(
          recipient.phone,
          recipient.countryCode
        );
        
        const result = await this.sendMessage(
          whatsappNumber,
          personalizedMessage,
          'welcome_message',
          undefined,
          recipient.email
        );

        if (result.success) {
          successful++;
          results.push({
            phone: recipient.phone,
            name: recipient.name,
            success: true,
            method: result.service as 'whatsapp' | 'email'
          });
        } else {
          failed++;
          results.push({
            phone: recipient.phone,
            name: recipient.name,
            success: false,
            method: 'none',
            error: result.error || 'Unknown error'
          });
        }

        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        const err = error as Error;
        failed++;
        results.push({
          phone: recipient.phone,
          name: recipient.name,
          success: false,
          method: 'none',
          error: err.message
        });
        console.error(`[WhatsApp] ❌ Failed to send to ${recipient.name}: ${err.message}`);
      }
    }

    console.log(`[WhatsApp] ✅ Bulk send complete: ${successful} successful, ${failed} failed out of ${recipients.length} total`);

    return {
      total: recipients.length,
      successful,
      failed,
      results
    };
  }

  /**
   * Generate promotional message template
   */
  static generatePromotionalMessage(
    recipientName: string,
    offerTitle: string,
    offerDetails: string,
    validUntil?: string
  ): string {
    const validityText = validUntil ? `\n⏰ *Valid Until:* ${validUntil}` : '';
    
    return `🎉 *${offerTitle}*

Hi ${recipientName}!

${offerDetails}${validityText}

📱 Visit us or call to avail this exclusive offer!

*Ronak Motor Garage* - Your trusted automotive partner`;
  }
}
