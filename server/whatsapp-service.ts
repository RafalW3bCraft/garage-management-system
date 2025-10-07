import { getStorage } from './storage';
import type { InsertWhatsAppMessage } from '@shared/schema';
import { 
  createCommunicationResult, 
  categorizeError, 
  isErrorRetryable,
  type CommunicationResult 
} from '@shared/communication-types';
import { BaseCommunicationService, type RetryConfig, type CircuitBreakerConfig } from './base-communication-service';
import { OTPService } from './otp-service';
import { sendEmailV2 } from './email-service';

// Twilio error and response types
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

// WhatsApp message types for different business scenarios
export type WhatsAppMessageType = 
  | 'appointment_confirmation' 
  | 'booking_request'
  | 'status_update'
  | 'bid_notification'
  | 'welcome_message'
  | 'otp';

// Legacy interface for backward compatibility - use CommunicationResult instead
export interface WhatsAppSendResult extends CommunicationResult {
  // All functionality moved to CommunicationResult
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

export class WhatsAppService {
  private static readonly TWILIO_PHONE = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';
  
  // Configuration from environment variables with fallback defaults
  private static readonly INITIAL_RETRY_DELAY = parseInt(process.env.WHATSAPP_RETRY_DELAY || '1000'); // ms
  private static readonly MAX_RETRY_DELAY = parseInt(process.env.WHATSAPP_MAX_RETRY_DELAY || '60000'); // ms
  private static readonly MAX_RETRIES = parseInt(process.env.WHATSAPP_MAX_RETRIES || '3');
  private static readonly BACKOFF_MULTIPLIER = parseFloat(process.env.WHATSAPP_BACKOFF_MULTIPLIER || '2');
  
  // Circuit breaker configuration
  private static readonly CIRCUIT_FAILURE_THRESHOLD = parseInt(process.env.WHATSAPP_CIRCUIT_THRESHOLD || '5');
  private static readonly CIRCUIT_RECOVERY_MINUTES = parseInt(process.env.WHATSAPP_CIRCUIT_RECOVERY_MIN || '5');
  
  // Fallback configuration
  // NOTE: SMS fallback is disabled by default as OTPService only supports OTP messages, not arbitrary messages
  // To enable SMS fallback, set WHATSAPP_ENABLE_SMS_FALLBACK=true and extend OTPService with sendSMS method
  private static readonly ENABLE_SMS_FALLBACK = process.env.WHATSAPP_ENABLE_SMS_FALLBACK === 'true'; // default false (not yet implemented)
  private static readonly ENABLE_EMAIL_FALLBACK = process.env.WHATSAPP_ENABLE_EMAIL_FALLBACK !== 'false'; // default true
  
  // Helper instance with circuit breaker and retry logic
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
  private static async getTwilioClient(): Promise<TwilioClient> {
    console.log('[WhatsApp] 🔧 Initializing Twilio client...');
    
    this.checkProductionRequirements();
    
    const hasSID = !!process.env.TWILIO_ACCOUNT_SID;
    const hasToken = !!process.env.TWILIO_AUTH_TOKEN;
    const sidPreview = process.env.TWILIO_ACCOUNT_SID ? `${process.env.TWILIO_ACCOUNT_SID.substring(0, 6)}...` : 'NOT_SET';
    
    console.log(`[WhatsApp] 📋 Twilio credentials status: SID=${hasSID ? 'SET' : 'NOT_SET'} (${sidPreview}), Token=${hasToken ? 'SET' : 'NOT_SET'}`);
    
    // In development, return a mock client for testing
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      console.log('[WhatsApp] ⚠️ Development mode - returning mock client (no credentials)');
      return {
        messages: {
          create: async (options: TwilioMessageOptions): Promise<TwilioMessageResponse> => {
            console.log(`[WhatsApp] 📱 Mock message sent to ${options.to}: ${options.body}`);
            return { sid: 'mock_' + Date.now() };
          }
        }
      };
    }

    // Use dynamic import for ES module compatibility
    try {
      console.log('[WhatsApp] 📦 Loading Twilio package...');
      const { default: twilio } = await import('twilio');
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN) as unknown as TwilioClient;
      console.log('[WhatsApp] ✅ Twilio client initialized successfully');
      return client;
    } catch (error) {
      const err = error as Error;
      console.error(`[WhatsApp] ❌ Twilio initialization failed: ${err.message}`);
      console.error('[WhatsApp] 📦 Twilio package not found. Install with: npm install twilio');
      throw new Error('Twilio package not installed');
    }
  }

  /**
   * Comprehensive trunk prefix mapping for international phone numbers
   */
  private static readonly TRUNK_PREFIX_MAP: { [countryCode: string]: { prefix: string; name: string } } = {
    '44': { prefix: '0', name: 'UK' },
    '61': { prefix: '0', name: 'Australia' },
    '65': { prefix: '0', name: 'Singapore' },
    '33': { prefix: '0', name: 'France' },
    '49': { prefix: '0', name: 'Germany' },
    '39': { prefix: '0', name: 'Italy' },
    '34': { prefix: '0', name: 'Spain' },
    '81': { prefix: '0', name: 'Japan' },
    '82': { prefix: '0', name: 'South Korea' },
    '86': { prefix: '0', name: 'China' },
    '60': { prefix: '0', name: 'Malaysia' },
    '66': { prefix: '0', name: 'Thailand' },
    '971': { prefix: '0', name: 'UAE' },
    '966': { prefix: '0', name: 'Saudi Arabia' },
    '91': { prefix: '0', name: 'India' },
    '92': { prefix: '0', name: 'Pakistan' },
    '94': { prefix: '0', name: 'Sri Lanka' },
    '90': { prefix: '0', name: 'Turkey' },
    '30': { prefix: '0', name: 'Greece' },
    '31': { prefix: '0', name: 'Netherlands' },
    '32': { prefix: '0', name: 'Belgium' },
    '43': { prefix: '0', name: 'Austria' },
    '47': { prefix: '0', name: 'Norway' },
    '48': { prefix: '0', name: 'Poland' },
    '51': { prefix: '0', name: 'Peru' },
    '52': { prefix: '0', name: 'Mexico' },
    '54': { prefix: '0', name: 'Argentina' },
    '55': { prefix: '0', name: 'Brazil' },
  };
  
  /**
   * Enhanced phone number normalization with comprehensive trunk prefix support
   */
  private static normalizePhone(phone: string, countryCode: string): string {
    let cleanPhone = phone.replace(/\D/g, '');
    const cleanCountryCode = countryCode.replace(/\D/g, '');
    
    const trunkInfo = this.TRUNK_PREFIX_MAP[cleanCountryCode];
    if (trunkInfo && cleanPhone.startsWith(trunkInfo.prefix)) {
      cleanPhone = cleanPhone.substring(trunkInfo.prefix.length);
    }
    
    return cleanPhone;
  }

  /**
   * Format phone number to E.164 format for WhatsApp (international standard)
   */
  private static formatWhatsAppNumber(phone: string, countryCode: string): string {
    console.log(`[WhatsApp] 📞 Formatting phone number - Input: phone="${phone}", countryCode="${countryCode}"`);
    
    if (!phone || !countryCode) {
      const error = 'Phone number and country code are required';
      console.error(`[WhatsApp] ❌ Validation failed: ${error}`);
      throw new Error(error);
    }

    const cleanCountryCode = countryCode.replace(/\D/g, '');
    console.log(`[WhatsApp] 🔧 Clean country code: "${cleanCountryCode}"`);
    
    const normalizedPhone = this.normalizePhone(phone, countryCode);
    console.log(`[WhatsApp] 🔧 Normalized phone: "${normalizedPhone}"`);
    
    if (!normalizedPhone || normalizedPhone.length < 6 || normalizedPhone.length > 14) {
      const error = 'Invalid phone number length (must be 6-14 digits after normalization)';
      console.error(`[WhatsApp] ❌ Validation failed: ${error} - Got ${normalizedPhone?.length || 0} digits`);
      throw new Error(error);
    }
    
    if (!cleanCountryCode || cleanCountryCode.length === 0) {
      const error = 'Invalid country code';
      console.error(`[WhatsApp] ❌ Validation failed: ${error}`);
      throw new Error(error);
    }
    
    const fullNumber = cleanCountryCode + normalizedPhone;
    console.log(`[WhatsApp] 🔧 Full E.164 number: "+${fullNumber}"`);
    
    if (fullNumber.length < 8 || fullNumber.length > 15) {
      const error = `Invalid E.164 phone number length: ${fullNumber.length} digits (must be 8-15)`;
      console.error(`[WhatsApp] ❌ Validation failed: ${error}`);
      throw new Error(error);
    }
    
    const formattedNumber = `whatsapp:+${fullNumber}`;
    console.log(`[WhatsApp] ✅ Formatted WhatsApp number: "${formattedNumber}"`);
    
    return formattedNumber;
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
   * Generate OTP verification message
   */
  private static generateOTPMessage(otpCode: string): string {
    return `Your Ronak Motor verification code is: ${otpCode}. Valid for 5 minutes.`;
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
   * Core message sending function (for internal use with retry wrapper)
   */
  private static async sendMessageCore(
    to: string,
    message: string,
    messageType: WhatsAppMessageType,
    appointmentId?: string
  ): Promise<TwilioMessageResponse> {
    console.log(`[WhatsApp] 📤 Sending ${messageType} message...`);
    console.log(`[WhatsApp] 📋 Message parameters:`);
    console.log(`[WhatsApp]    - To: ${to}`);
    console.log(`[WhatsApp]    - From: ${this.TWILIO_PHONE}`);
    console.log(`[WhatsApp]    - Message type: ${messageType}`);
    console.log(`[WhatsApp]    - Message length: ${message.length} chars`);
    console.log(`[WhatsApp]    - Message preview: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`);
    if (appointmentId) {
      console.log(`[WhatsApp]    - Appointment ID: ${appointmentId}`);
    }
    
    const client = await this.getTwilioClient();
    
    const messageParams = {
      body: message,
      from: this.TWILIO_PHONE,
      to: to
    };
    
    console.log(`[WhatsApp] 🚀 Calling Twilio API with params:`, JSON.stringify(messageParams, null, 2));
    
    try {
      const result = await client.messages.create(messageParams);
      
      console.log(`[WhatsApp] ✅ Message sent successfully!`);
      console.log(`[WhatsApp] 📋 Twilio response:`);
      console.log(`[WhatsApp]    - SID: ${result.sid}`);
      console.log(`[WhatsApp]    - Status: ${result.status || 'N/A'}`);
      console.log(`[WhatsApp]    - Direction: ${result.direction || 'N/A'}`);
      console.log(`[WhatsApp]    - Price: ${result.price || 'N/A'}`);
      
      return result;
    } catch (error) {
      const twilioError = error as TwilioError;
      console.error(`[WhatsApp] ❌ Twilio API error occurred:`);
      console.error(`[WhatsApp]    - Error message: ${twilioError.message}`);
      console.error(`[WhatsApp]    - Error code: ${twilioError.code || 'N/A'}`);
      console.error(`[WhatsApp]    - HTTP status: ${twilioError.status || 'N/A'}`);
      console.error(`[WhatsApp]    - More info: ${twilioError.moreInfo || 'N/A'}`);
      console.error(`[WhatsApp]    - Full error:`, JSON.stringify(twilioError, null, 2));
      throw error;
    }
  }

  /**
   * Attempt SMS fallback when WhatsApp fails
   * 
   * NOTE: SMS fallback is currently NOT IMPLEMENTED
   * - OTPService only supports sending OTP verification codes, not arbitrary messages
   * - To enable SMS fallback:
   *   1. Extend OTPService with a generic sendSMS(phone, message) method
   *   2. OR create a generic SMS gateway service
   *   3. Set WHATSAPP_ENABLE_SMS_FALLBACK=true in environment
   * 
   * Current behavior: Returns failure immediately if enabled
   * Recommended: Keep disabled and rely on Email fallback (fully functional)
   * 
   * @param phone - Phone number (national format)
   * @param countryCode - Country code with + prefix
   * @param message - Message content
   * @returns CommunicationResult indicating SMS is not available
   */
  private static async attemptSMSFallback(
    phone: string,
    countryCode: string,
    message: string
  ): Promise<CommunicationResult> {
    if (!this.ENABLE_SMS_FALLBACK) {
      console.log('[WhatsApp] 🚫 SMS fallback is disabled (not implemented)');
      return createCommunicationResult('sms', false, 'SMS fallback disabled - not yet implemented', {
        errorType: 'service_unavailable'
      });
    }
    
    // SMS fallback is enabled but not implemented
    console.log('[WhatsApp] ⚠️ SMS fallback is enabled but NOT IMPLEMENTED');
    console.log('[WhatsApp] ℹ️ OTPService only supports OTP messages, not arbitrary messages');
    console.log('[WhatsApp] 📝 To implement: Extend OTPService with sendSMS method or create SMS gateway');
    
    return createCommunicationResult('sms', false, 'SMS fallback not yet implemented - requires OTPService extension', {
      errorType: 'service_unavailable',
      metadata: { 
        needsImplementation: true
      }
    });
  }

  /**
   * Attempt email fallback when WhatsApp and SMS fail
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
      console.log('[WhatsApp] 🚫 Email fallback is disabled');
      return createCommunicationResult('email', false, 'Email fallback disabled', {
        errorType: 'service_unavailable'
      });
    }
    
    if (!email) {
      console.log('[WhatsApp] ⚠️ Email fallback skipped - no email address provided');
      return createCommunicationResult('email', false, 'No email address available', {
        errorType: 'validation'
      });
    }
    
    console.log('[WhatsApp] 📧 Attempting email fallback');
    
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
        console.log('[WhatsApp] ✅ Email fallback succeeded');
      } else {
        console.log('[WhatsApp] ❌ Email fallback failed');
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
    console.log(`[WhatsApp] 📱 Sending ${messageType} message to ${to}${appointmentId ? ` (Appointment: ${appointmentId})` : ''}`);
    
    // Extract phone number for database logging
    const phoneMatch = to.match(/whatsapp:\+([1-9]\d{6,14})$/);
    const fullNumber = phoneMatch ? phoneMatch[1] : to.replace(/[^\d]/g, '');
    const countryCode = this.extractCountryCode(fullNumber);
    const nationalNumber = fullNumber.substring(countryCode.length);
    
    // Check circuit breaker before attempting
    if (!this.helper['circuitBreaker'].canAttempt()) {
      const state = this.helper['circuitBreaker'].getState();
      console.log(`[WhatsApp] ⚡ Circuit breaker is ${state} - fast failing without retry`);
      
      // Attempt fallback immediately
      console.log('[WhatsApp] 🔄 Attempting fallback due to circuit breaker open');
      const smsFallback = await this.attemptSMSFallback(nationalNumber, `+${countryCode}`, message);
      if (smsFallback.success) {
        return {
          success: true,
          message: 'Message delivered via SMS fallback (circuit breaker open)',
          service: 'sms' as const,
          fallbackUsed: 'sms'
        };
      }
      
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
        message: `WhatsApp circuit breaker is ${state}, all fallbacks failed`,
        service: 'whatsapp' as const,
        error: 'Circuit breaker open, service unavailable',
        circuitBreakerOpen: true
      };
    }
    
    // Log initial message in database
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
      console.log(`[WhatsApp] 💾 Message logged in database (ID: ${messageId})`);
    } catch (dbError) {
      const err = dbError as Error;
      console.error(`[WhatsApp] ⚠️ Database logging failed: ${err.message}`);
    }
    
    // Attempt to send with retries
    const operationName = `send ${messageType} to ${to}`;
    const { result, success, error, attempts } = await this.helper['executeWithProtection'](
      () => this.sendMessageCore(to, message, messageType, appointmentId),
      operationName,
      { skipCircuitBreaker: true }
    );
    
    // Update database with final result
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
    
    // Return success if WhatsApp worked
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
    
    // WhatsApp failed - attempt fallbacks
    const twilioError = error as TwilioError;
    console.error(`[WhatsApp] ❌ Failed after ${attempts} attempts: ${twilioError.message}`);
    
    // Try SMS fallback
    console.log('[WhatsApp] 🔄 Attempting SMS fallback');
    const smsFallback = await this.attemptSMSFallback(nationalNumber, `+${countryCode}`, message);
    
    if (smsFallback.success) {
      // Update database to reflect SMS fallback was used
      if (messageId) {
        try {
          const storage = await getStorage();
          await storage.updateWhatsAppMessage(messageId, {
            status: 'fallback_sent',
            providerResponse: JSON.stringify({ 
              originalError: twilioError.message,
              fallbackMethod: 'sms',
              fallbackSuccess: true
            })
          });
        } catch (dbError) {
          console.error(`[WhatsApp] ⚠️ Failed to update fallback status: ${(dbError as Error).message}`);
        }
      }
      
      return {
        success: true,
        message: 'Message delivered via SMS fallback',
        service: 'sms' as const,
        fallbackUsed: 'sms',
        originalError: twilioError.message
      };
    }
    
    // Try email fallback
    console.log('[WhatsApp] 🔄 Attempting email fallback');
    const emailSubject = `${messageType.replace('_', ' ')} - Ronak Motor Garage`;
    const emailFallback = await this.attemptEmailFallback(fallbackEmail, message, emailSubject);
    
    if (emailFallback.success) {
      // Update database to reflect email fallback was used
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
    
    // All attempts failed
    console.error('[WhatsApp] ❌ All delivery methods failed (WhatsApp, SMS, Email)');
    
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
    // Remove any non-digit characters
    const digits = fullNumber.replace(/\D/g, '');
    
    // Try matching country codes from longest to shortest (1-4 digits)
    for (let length = 4; length >= 1; length--) {
      const possibleCode = digits.substring(0, length);
      
      // Check against known country codes (simplified list - extend as needed)
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
    
    // Default to single digit if no match (covers most NANP countries)
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
    const whatsappNumber = this.formatWhatsAppNumber(phone, countryCode);
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
    const whatsappNumber = this.formatWhatsAppNumber(phone, countryCode);
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
    const whatsappNumber = this.formatWhatsAppNumber(phone, countryCode);
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
    const whatsappNumber = this.formatWhatsAppNumber(phone, countryCode);
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
    const whatsappNumber = this.formatWhatsAppNumber(phone, countryCode);
    const message = this.generateServiceProviderBookingMessage(data);
    return this.sendMessage(whatsappNumber, message, 'booking_request', data.bookingId, fallbackEmail);
  }

  /**
   * Send OTP verification code via WhatsApp
   */
  static async sendOTPMessage(
    phone: string,
    countryCode: string,
    otpCode: string
  ): Promise<WhatsAppSendResult> {
    console.log(`[WhatsApp] 🔐 Initiating OTP message send...`);
    console.log(`[WhatsApp] 📋 OTP Details:`);
    console.log(`[WhatsApp]    - Phone: ${phone}`);
    console.log(`[WhatsApp]    - Country Code: ${countryCode}`);
    console.log(`[WhatsApp]    - OTP Code: ${otpCode.substring(0, 2)}****`);
    
    // Validate and log TWILIO_WHATSAPP_NUMBER configuration
    console.log(`[WhatsApp] 📞 TWILIO_WHATSAPP_NUMBER configuration:`);
    console.log(`[WhatsApp]    - Value: ${this.TWILIO_PHONE}`);
    console.log(`[WhatsApp]    - Format valid: ${this.TWILIO_PHONE.startsWith('whatsapp:+')}`);
    
    if (!this.TWILIO_PHONE.startsWith('whatsapp:+')) {
      console.error(`[WhatsApp] ❌ TWILIO_WHATSAPP_NUMBER has invalid format!`);
      console.error(`[WhatsApp]    - Expected format: whatsapp:+14155238886`);
      console.error(`[WhatsApp]    - Actual value: ${this.TWILIO_PHONE}`);
    }
    
    const whatsappNumber = this.formatWhatsAppNumber(phone, countryCode);
    const message = this.generateOTPMessage(otpCode);
    
    console.log(`[WhatsApp] 📨 Generated OTP message: "${message}"`);
    
    return this.sendMessage(whatsappNumber, message, 'otp');
  }

  /**
   * Validate phone number format for WhatsApp
   */
  static validatePhoneNumber(phone: string, countryCode: string): { valid: boolean; message?: string } {
    try {
      this.formatWhatsAppNumber(phone, countryCode);
      return { valid: true };
    } catch (error) {
      const err = error as Error;
      return { valid: false, message: err.message };
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
}
