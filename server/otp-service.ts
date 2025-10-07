import crypto from 'crypto';
import { getStorage } from './storage';
import { 
  createCommunicationResult, 
  categorizeError, 
  type CommunicationResult 
} from '@shared/communication-types';
import { BaseCommunicationService, type RetryConfig, type CircuitBreakerConfig } from './base-communication-service';
import { WhatsAppService } from './whatsapp-service';
import { sendEmailV2 } from './email-service';

// Country codes for phone number validation and formatting (India primary + Universal format)
export const SUPPORTED_COUNTRIES = [
  // Primary market - India 
  { code: '+91', name: 'India', flag: '🇮🇳' },
  
  // Universal format for all other countries
  { code: 'UNIVERSAL', name: 'Other Countries', flag: '🌍' },
] as const;

// Legacy interfaces for backward compatibility - maintain all legacy fields
export interface OtpSendResult extends CommunicationResult {
  // Legacy fields for backward compatibility - guaranteed to be present
  rateLimited?: boolean;
  expiresIn?: number;
  attempts?: number;
  maxAttempts?: number;
  expired?: boolean;
  error?: string;
}

export interface OtpVerifyResult extends CommunicationResult {
  // Legacy fields for backward compatibility - guaranteed to be present
  rateLimited?: boolean;
  expiresIn?: number;
  attempts?: number;
  maxAttempts?: number;
  expired?: boolean;
  error?: string;
}

/**
 * Internal helper class that extends BaseCommunicationService
 * Provides circuit breaker and retry logic for OTP SMS service
 */
class OTPServiceHelper extends BaseCommunicationService {
  constructor(retryConfig: RetryConfig, circuitBreakerConfig: CircuitBreakerConfig) {
    super('OTP', retryConfig, circuitBreakerConfig);
  }
}

export class OTPService {
  private static readonly OTP_EXPIRY_MINUTES = 5;
  private static readonly MAX_ATTEMPTS = 3;
  private static readonly RATE_LIMIT_WINDOW_MINUTES = 60;
  private static readonly MAX_SENDS_PER_HOUR = 5;

  // Configuration from environment variables with fallback defaults
  private static readonly SMS_RETRY_CONFIG: RetryConfig = {
    initialDelayMs: parseInt(process.env.OTP_RETRY_DELAY || '1000'),
    maxDelayMs: parseInt(process.env.OTP_MAX_RETRY_DELAY || '30000'),
    maxRetries: parseInt(process.env.OTP_MAX_RETRIES || '2'),
    backoffMultiplier: parseFloat(process.env.OTP_BACKOFF_MULTIPLIER || '2')
  };

  private static readonly SMS_CIRCUIT_CONFIG: CircuitBreakerConfig = {
    failureThreshold: parseInt(process.env.OTP_CIRCUIT_THRESHOLD || '5'),
    recoveryTimeoutMinutes: parseInt(process.env.OTP_CIRCUIT_RECOVERY_MIN || '5')
  };

  // Helper instance with circuit breaker and retry logic
  private static readonly helper = new OTPServiceHelper(
    OTPService.SMS_RETRY_CONFIG,
    OTPService.SMS_CIRCUIT_CONFIG
  );

  // Production safety checks
  private static checkProductionRequirements(): void {
    const isProduction = process.env.NODE_ENV === 'production';
    
    if (isProduction) {
      if (!process.env.OTP_SECRET || process.env.OTP_SECRET === 'default-secret-change-in-production') {
        throw new Error('OTP_SECRET must be set to a secure value in production');
      }
      
      if (!process.env.MESSAGECENTRAL_AUTH_TOKEN) {
        throw new Error('MESSAGECENTRAL_AUTH_TOKEN must be set in production');
      }
    }
  }

  /**
   * Generate a secure 6-digit OTP code
   */
  private static generateOTP(): string {
    return crypto.randomInt(100000, 999999).toString();
  }

  /**
   * Hash OTP code with server secret for secure storage using HMAC
   */
  private static hashOTP(otpCode: string, phone: string): string {
    const secret = process.env.OTP_SECRET || 'default-secret-change-in-production';
    const data = `${otpCode}-${phone}`;
    return crypto.createHmac('sha256', secret).update(data).digest('hex');
  }

  /**
   * Verify OTP hash matches the provided code using timing-safe comparison
   */
  private static verifyOTPHash(otpCode: string, hash: string, phone: string): boolean {
    const expectedHash = this.hashOTP(otpCode, phone);
    return crypto.timingSafeEqual(
      Buffer.from(hash, 'hex'), 
      Buffer.from(expectedHash, 'hex')
    );
  }

  /**
   * Send OTP via WhatsApp using Twilio API
   */
  private static async sendWhatsAppOTP(phone: string, countryCode: string, otpCode: string): Promise<boolean> {
    console.log(`[OTP] 🔐 Starting WhatsApp OTP send process...`);
    console.log(`[OTP] 📋 Request details:`);
    console.log(`[OTP]    - Phone: ${phone}`);
    console.log(`[OTP]    - Country Code: ${countryCode}`);
    console.log(`[OTP]    - OTP (masked): ${otpCode.substring(0, 2)}****`);
    console.log(`[OTP]    - Target: ${countryCode}${phone}`);
    
    try {
      console.log(`[OTP] 📞 Calling WhatsAppService.sendOTPMessage()...`);
      const result = await WhatsAppService.sendOTPMessage(phone, countryCode, otpCode);
      
      console.log(`[OTP] 📋 WhatsApp service response:`);
      console.log(`[OTP]    - Success: ${result.success}`);
      console.log(`[OTP]    - Service: ${result.service}`);
      console.log(`[OTP]    - Message: ${result.message}`);
      
      if (result.messageSid) {
        console.log(`[OTP]    - Message SID: ${result.messageSid}`);
      }
      
      if (result.retryCount !== undefined) {
        console.log(`[OTP]    - Retry count: ${result.retryCount}`);
      }
      
      if (result.fallbackUsed) {
        console.log(`[OTP]    - Fallback used: ${result.fallbackUsed}`);
      }
      
      if (result.error) {
        console.error(`[OTP]    - Error details: ${result.error}`);
      }
      
      if (result.success) {
        console.log(`[OTP] ✅ WhatsApp OTP sent successfully to ${countryCode}${phone}`);
        return true;
      }
      
      console.error(`[OTP] ❌ WhatsApp OTP failed: ${result.message}`);
      console.error(`[OTP] 💡 Troubleshooting hints:`);
      console.error(`[OTP]    - Check if TWILIO_ACCOUNT_SID is set correctly`);
      console.error(`[OTP]    - Check if TWILIO_AUTH_TOKEN is set correctly`);
      console.error(`[OTP]    - Check if TWILIO_WHATSAPP_NUMBER is in format: whatsapp:+14155238886`);
      console.error(`[OTP]    - Verify phone number format: ${countryCode}${phone}`);
      console.error(`[OTP]    - Check Twilio account status and WhatsApp sandbox configuration`);
      
      return false;
    } catch (error) {
      const err = error as Error;
      console.error(`[OTP] ❌ WhatsApp OTP exception caught:`);
      console.error(`[OTP]    - Error type: ${err.constructor.name}`);
      console.error(`[OTP]    - Error message: ${err.message}`);
      console.error(`[OTP]    - Error stack:`, err.stack);
      
      // Check for specific Twilio errors
      const twilioError = error as any;
      if (twilioError.code) {
        console.error(`[OTP]    - Twilio error code: ${twilioError.code}`);
      }
      if (twilioError.status) {
        console.error(`[OTP]    - HTTP status: ${twilioError.status}`);
      }
      if (twilioError.moreInfo) {
        console.error(`[OTP]    - More info: ${twilioError.moreInfo}`);
      }
      
      console.error(`[OTP] 💡 Debugging steps:`);
      console.error(`[OTP]    1. Verify Twilio credentials are correctly set`);
      console.error(`[OTP]    2. Check if Twilio WhatsApp sandbox is activated`);
      console.error(`[OTP]    3. Verify phone number format matches E.164 standard`);
      console.error(`[OTP]    4. Check Twilio account balance and limits`);
      console.error(`[OTP]    5. Review Twilio console for detailed error logs`);
      
      return false;
    }
  }

  /**
   * Send OTP via Email using SendGrid
   */
  private static async sendEmailOTP(phone: string, countryCode: string, otpCode: string, email?: string): Promise<boolean> {
    try {
      if (!email) {
        console.error('[OTP] Email address required for email OTP channel');
        return false;
      }

      console.log(`[OTP] Sending Email OTP to ${email}`);
      
      const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@ronakmotorgarage.com';
      const subject = 'Your Verification Code';
      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
              .content { background-color: #f9f9f9; padding: 30px; border-radius: 5px; margin-top: 20px; }
              .otp-code { font-size: 32px; font-weight: bold; color: #4CAF50; text-align: center; padding: 20px; background-color: white; border-radius: 5px; margin: 20px 0; letter-spacing: 5px; }
              .footer { text-align: center; margin-top: 20px; color: #777; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Ronak Motor Garage</h1>
              </div>
              <div class="content">
                <h2>Your Verification Code</h2>
                <p>Use the following code to complete your verification:</p>
                <div class="otp-code">${otpCode}</div>
                <p><strong>This code will expire in 5 minutes.</strong></p>
                <p>If you didn't request this code, please ignore this email.</p>
              </div>
              <div class="footer">
                <p>Ronak Motor Garage - Your trusted automotive service center</p>
              </div>
            </div>
          </body>
        </html>
      `;
      
      const textContent = `Your Ronak Motor verification code is: ${otpCode}. Valid for 5 minutes.`;
      
      const result = await sendEmailV2({
        to: email,
        from: fromEmail,
        subject: subject,
        text: textContent,
        html: htmlContent
      });
      
      if (result.success) {
        console.log(`[OTP] ✅ Email OTP sent successfully to ${email}`);
        return true;
      }
      
      console.error(`[OTP] ❌ Email OTP failed: ${result.message}`);
      return false;
    } catch (error) {
      const err = error as Error;
      console.error(`[OTP] Email OTP error:`, err.message);
      return false;
    }
  }

  /**
   * Check if phone number has exceeded rate limits
   */
  private static async checkRateLimit(phone: string, countryCode: string): Promise<boolean> {
    const storage = await getStorage();
    const oneHourAgo = new Date(Date.now() - (this.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000));
    
    const recentOtps = await storage.getRecentOtpAttempts(phone, countryCode, oneHourAgo);
    return recentOtps.length >= this.MAX_SENDS_PER_HOUR;
  }

  /**
   * Send OTP to phone number via specified channel (WhatsApp or Email)
   */
  static async sendOTP(phone: string, countryCode: string, purpose: string, channel: 'whatsapp' | 'email' = 'whatsapp', email?: string): Promise<OtpSendResult> {
    try {
      // Check rate limiting
      const rateLimited = await this.checkRateLimit(phone, countryCode);
      if (rateLimited) {
        console.log(`[OTP] Rate limited: ${countryCode}${phone}`);
        return createCommunicationResult('otp', false, 'Too many OTP requests. Please wait before requesting another code.', {
          errorType: 'rate_limit',
          retryable: true,
          metadata: { rateLimited: true }
        });
      }

      // Generate OTP code
      const otpCode = this.generateOTP();
      console.log(`[OTP] Generated OTP for ${countryCode}${phone} via ${channel}`);

      // Send OTP via selected channel
      let sendSuccess = false;
      let channelMessage = '';
      
      if (channel === 'whatsapp') {
        sendSuccess = await this.sendWhatsAppOTP(phone, countryCode, otpCode);
        channelMessage = `WhatsApp message sent to ${countryCode}${phone}`;
      } else if (channel === 'email') {
        sendSuccess = await this.sendEmailOTP(phone, countryCode, otpCode, email);
        channelMessage = `Email sent to ${email}`;
      }
      
      if (!sendSuccess) {
        return createCommunicationResult('otp', false, `Failed to send OTP via ${channel}. Please try again later.`, {
          errorType: 'service_unavailable',
          retryable: true,
          metadata: { 
            maxAttempts: this.MAX_ATTEMPTS,
            expiresIn: this.OTP_EXPIRY_MINUTES * 60
          }
        });
      }

      const expiresAt = new Date(Date.now() + (this.OTP_EXPIRY_MINUTES * 60 * 1000));
      const otpHash = this.hashOTP(otpCode, phone);

      // Store OTP hash in database (invalidate ALL previous active OTPs first)
      const storage = await getStorage();
      
      // Expire ALL existing active OTPs for this phone/purpose to ensure single active OTP
      const expiredCount = await storage.expireAllActiveOtpsForTarget(phone, countryCode, purpose);
      if (expiredCount > 0) {
        console.log(`[OTP] Expired ${expiredCount} previous active OTP(s) for ${countryCode}${phone} (${purpose})`);
      }
      
      await storage.storeOTPVerification({
        phone,
        countryCode,
        channel,
        email: channel === 'email' ? email : null,
        otpCodeHash: otpHash,
        verificationId: null,
        purpose,
        maxAttempts: this.MAX_ATTEMPTS,
        expiresAt
      });

      return createCommunicationResult('otp', true, `OTP sent via ${channel}. Valid for ${this.OTP_EXPIRY_MINUTES} minutes.`, {
        metadata: { 
          expiresIn: this.OTP_EXPIRY_MINUTES * 60,
          maxAttempts: this.MAX_ATTEMPTS
        }
      });
    } catch (error) {
      const err = error as Error;
      console.error(`[OTP] Send error for ${countryCode}${phone}:`, err.message);
      const errorType = categorizeError(undefined, err.message);
      return createCommunicationResult('otp', false, `Failed to send OTP via ${channel}. Please try again later.`, {
        errorType,
        retryable: errorType !== 'validation',
        metadata: {
          maxAttempts: this.MAX_ATTEMPTS,
          expiresIn: this.OTP_EXPIRY_MINUTES * 60
        }
      });
    }
  }

  /**
   * Verify OTP code
   */
  static async verifyOTP(phone: string, countryCode: string, otpCode: string, purpose: string): Promise<OtpVerifyResult> {
    try {
      const storage = await getStorage();
      
      // Get the most recent unverified OTP for this phone and purpose
      const otpRecord = await storage.getActiveOtpVerification(phone, countryCode, purpose);
      
      if (!otpRecord) {
        return createCommunicationResult('otp', false, 'No active OTP found. Please request a new code.', {
          errorType: 'validation',
          retryable: false,
          metadata: {
            attempts: 0,
            maxAttempts: this.MAX_ATTEMPTS
          }
        });
      }

      // Check if max attempts exceeded
      const currentAttempts = otpRecord.attempts ?? 0;
      const maxAttempts = otpRecord.maxAttempts ?? 3;

      // Check if expired
      if (new Date() > otpRecord.expiresAt) {
        await storage.markOtpAsExpired(otpRecord.id);
        return createCommunicationResult('otp', false, 'OTP has expired. Please request a new code.', {
          errorType: 'validation',
          retryable: false,
          metadata: { 
            expired: true,
            attempts: currentAttempts,
            maxAttempts: maxAttempts
          }
        });
      }
      
      if (currentAttempts >= maxAttempts) {
        await storage.markOtpAsExpired(otpRecord.id);
        return createCommunicationResult('otp', false, 'Maximum verification attempts exceeded. Please request a new code.', {
          errorType: 'validation',
          retryable: false,
          metadata: { attempts: currentAttempts, maxAttempts: maxAttempts }
        });
      }

      // Verify the OTP code using hash-based verification
      if (!otpRecord.otpCodeHash) {
        console.error('[OTP] No OTP hash found in record');
        return createCommunicationResult('otp', false, 'Invalid OTP record. Please request a new code.', {
          errorType: 'validation',
          retryable: false,
          metadata: { attempts: currentAttempts, maxAttempts: maxAttempts }
        });
      }

      const isValid = this.verifyOTPHash(otpCode, otpRecord.otpCodeHash, phone);
      
      if (!isValid) {
        // Increment attempt count only on invalid attempts
        await storage.incrementOtpAttempts(otpRecord.id);
        const newAttemptCount = (otpRecord.attempts ?? 0) + 1;
        const remainingAttempts = (otpRecord.maxAttempts ?? 3) - newAttemptCount;
        
        if (remainingAttempts <= 0) {
          await storage.markOtpAsExpired(otpRecord.id);
          return createCommunicationResult('otp', false, 'Invalid OTP. Maximum attempts exceeded. Please request a new code.', {
            errorType: 'validation',
            retryable: false,
            metadata: { attempts: newAttemptCount, maxAttempts: otpRecord.maxAttempts ?? 3 }
          });
        }
        
        return createCommunicationResult('otp', false, `Invalid OTP. ${remainingAttempts} attempt${remainingAttempts !== 1 ? 's' : ''} remaining.`, {
          errorType: 'validation',
          retryable: false,
          metadata: { attempts: newAttemptCount, maxAttempts: otpRecord.maxAttempts ?? 3 }
        });
      }

      // Mark as verified
      await storage.markOtpAsVerified(otpRecord.id);
      
      console.log(`[OTP] Successfully verified OTP for ${countryCode}${phone} (${purpose})`);
      return createCommunicationResult('otp', true, 'OTP verified successfully!');
    } catch (error) {
      const err = error as Error;
      console.error(`[OTP] Verify error for ${countryCode}${phone}:`, err.message);
      const errorType = categorizeError(undefined, err.message);
      return createCommunicationResult('otp', false, 'Failed to verify OTP. Please try again.', {
        errorType,
        retryable: errorType !== 'validation',
        metadata: {
          attempts: 0,
          maxAttempts: this.MAX_ATTEMPTS
        }
      });
    }
  }

  /**
   * Clean up expired OTP records (should be called periodically)
   */
  static async cleanupExpiredOtps(): Promise<void> {
    try {
      const storage = await getStorage();
      const cutoffDate = new Date(Date.now() - (24 * 60 * 60 * 1000)); // 24 hours ago
      await storage.cleanupExpiredOtps(cutoffDate);
    } catch (error) {
      const err = error as Error;
      console.error('[OTP] Cleanup failed:', err.message);
    }
  }

  /**
   * Validate phone number format with enhanced international support
   */
  static validatePhoneNumber(phone: string, countryCode: string): { valid: boolean; message?: string } {
    // Sanitize inputs
    const cleanPhone = (phone || '').replace(/\D/g, '');
    const cleanCountryCode = (countryCode || '').trim();
    
    // Basic input validation
    if (!cleanPhone || !cleanCountryCode) {
      return { valid: false, message: 'Phone number and country code are required' };
    }

    // For India - strict 10-digit validation
    if (cleanCountryCode === '+91') {
      if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
        return { valid: false, message: 'Enter valid 10-digit Indian mobile number starting with 6-9' };
      }
      return { valid: true };
    }
    
    // For Universal format - enhanced international validation
    if (cleanCountryCode === 'UNIVERSAL') {
      return { valid: false, message: 'Please select a specific country code instead of Universal format' };
    }
    
    // Validate country code format for all other countries
    if (!/^\+\d{1,4}$/.test(cleanCountryCode)) {
      return { valid: false, message: 'Enter valid country code format (e.g., +1, +44, +86, +971)' };
    }
    
    // Extract numeric country code for validation
    const numericCountryCode = cleanCountryCode.substring(1);
    const countryCodeLength = numericCountryCode.length;
    
    // Validate country code length (1-4 digits as per ITU-T E.164)
    if (countryCodeLength < 1 || countryCodeLength > 4) {
      return { valid: false, message: 'Country code must be 1-4 digits' };
    }
    
    // Enhanced phone number validation for international numbers
    const phoneLength = cleanPhone.length;
    
    // ITU-T E.164 standard: total number (country code + national number) should be max 15 digits
    const totalLength = countryCodeLength + phoneLength;
    if (totalLength > 15) {
      return { valid: false, message: 'Phone number too long (max 15 digits total including country code)' };
    }
    
    if (totalLength < 8) {
      return { valid: false, message: 'Phone number too short (min 8 digits total including country code)' };
    }
    
    // National number validation (after country code)
    if (phoneLength < 4 || phoneLength > 14) {
      return { valid: false, message: 'Phone number must be 4-14 digits (excluding country code)' };
    }
    
    // Reject numbers that are all the same digit or obvious invalid patterns
    if (/^(\d)\1+$/.test(cleanPhone)) {
      return { valid: false, message: 'Phone number cannot be all the same digit' };
    }
    
    // Reject numbers starting with 0 for most international formats (except special cases)
    // Note: Some countries use 0 as a trunk prefix which should be removed before international format
    if (cleanPhone.startsWith('0') && !this.isValidZeroStartForCountry(numericCountryCode)) {
      return { valid: false, message: 'Remove leading zero from phone number for international format' };
    }
    
    // Country-specific validation for common cases
    const validationResult = this.validateCountrySpecificFormat(cleanPhone, numericCountryCode);
    if (!validationResult.valid) {
      return validationResult;
    }

    return { valid: true };
  }

  /**
   * Check if a country allows phone numbers starting with 0 in international format
   */
  private static isValidZeroStartForCountry(countryCode: string): boolean {
    // Some countries/territories have valid numbers starting with 0 in international format
    const allowedZeroStartCountries = ['212', '213', '216', '218', '220', '221', '222', '223', '224', '225', '226', '227', '228', '229', '230', '231', '232', '233', '234', '235', '236', '237', '238', '239', '240', '241', '242', '243', '244', '245', '246', '247', '248', '249', '250', '251', '252', '253', '254', '255', '256', '257', '258', '260', '261', '262', '263', '264', '265', '266', '267', '268', '269', '290', '291', '297', '298', '299'];
    return allowedZeroStartCountries.includes(countryCode);
  }

  /**
   * Country-specific phone number format validation
   */
  private static validateCountrySpecificFormat(phone: string, countryCode: string): { valid: boolean; message?: string } {
    // Common country-specific validations
    switch (countryCode) {
      case '1': // US/Canada (NANP)
        if (phone.length !== 10) {
          return { valid: false, message: 'US/Canada numbers must be exactly 10 digits' };
        }
        if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(phone)) {
          return { valid: false, message: 'Invalid US/Canada phone number format' };
        }
        break;
        
      case '44': // UK
        if (phone.length < 10 || phone.length > 11) {
          return { valid: false, message: 'UK numbers must be 10-11 digits' };
        }
        break;
        
      case '86': // China
        if (phone.length !== 11 || !phone.startsWith('1')) {
          return { valid: false, message: 'China mobile numbers must be 11 digits starting with 1' };
        }
        break;
        
      case '81': // Japan
        if (phone.length < 10 || phone.length > 11) {
          return { valid: false, message: 'Japan numbers must be 10-11 digits' };
        }
        break;
        
      case '33': // France
        if (phone.length !== 9) {
          return { valid: false, message: 'France numbers must be 9 digits (without leading 0)' };
        }
        break;
        
      case '49': // Germany
        if (phone.length < 10 || phone.length > 12) {
          return { valid: false, message: 'Germany numbers must be 10-12 digits' };
        }
        break;
        
      case '61': // Australia
        if (phone.length !== 9) {
          return { valid: false, message: 'Australia mobile numbers must be 9 digits (without leading 0)' };
        }
        if (!phone.startsWith('4')) {
          return { valid: false, message: 'Australia mobile numbers must start with 4' };
        }
        break;
    }
    
    return { valid: true };
  }
}