import crypto from 'crypto';
import { getStorage } from './storage';
import { 
  createCommunicationResult, 
  categorizeError, 
  type CommunicationResult 
} from '@shared/communication-types';

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

export class OTPService {
  private static readonly OTP_EXPIRY_MINUTES = 5;
  private static readonly MAX_ATTEMPTS = 3;
  private static readonly RATE_LIMIT_WINDOW_MINUTES = 60;
  private static readonly MAX_SENDS_PER_HOUR = 5;

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
      
      if (!process.env.MESSAGECENTRAL_CUSTOMER_ID) {
        throw new Error('MESSAGECENTRAL_CUSTOMER_ID must be set in production');
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
   * Send OTP via MessageCentral v3 SMS API
   */
  private static async sendSMS(phone: string, countryCode: string, otpCode: string): Promise<boolean> {
    const isProduction = process.env.NODE_ENV === 'production';
    const authToken = process.env.MESSAGECENTRAL_AUTH_TOKEN;
    const customerId = process.env.MESSAGECENTRAL_CUSTOMER_ID;
    
    // Development fallback if credentials missing
    if (!authToken || !customerId) {
      if (isProduction) {
        console.error('[OTP] MessageCentral credentials missing in production');
        return false;
      }
      
      console.log(`[OTP] Development mode - MessageCentral credentials missing, using fallback`);
      console.log(`[OTP] OTP sent to ${countryCode}${phone} (code masked for security)`);
      return true;
    }

    try {
      const message = `Your Ronak Motor Garage verification code is: ${otpCode}. Valid for ${this.OTP_EXPIRY_MINUTES} minutes. Do not share this code.`;
      
      // Build v3 API URL with parameters
      const apiUrl = new URL('https://cpaas.messagecentral.com/verification/v3/send');
      apiUrl.searchParams.set('countryCode', countryCode.replace('+', ''));
      apiUrl.searchParams.set('customerId', customerId);
      apiUrl.searchParams.set('flowType', 'SMS');
      apiUrl.searchParams.set('mobileNumber', phone);
      apiUrl.searchParams.set('type', 'SMS');
      apiUrl.searchParams.set('message', message);

      console.log(`[OTP] Sending SMS to ${countryCode}${phone} via MessageCentral v3`);
      
      const response = await fetch(apiUrl.toString(), {
        method: 'POST',
        headers: {
          'authToken': authToken,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[OTP] MessageCentral v3 API error ${response.status}:`, errorText);
        
        // In development, show detailed error but still allow fallback
        if (!isProduction) {
          console.log(`[OTP] Development fallback - OTP sent to ${countryCode}${phone} (code masked for security)`);
          return true;
        }
        return false;
      }

      const result = await response.json();
      console.log(`[OTP] SMS sent successfully to ${countryCode}${phone}`);
      console.log(`[OTP] MessageCentral response:`, result);
      return true;
    } catch (error) {
      const err = error as Error;
      console.error(`[OTP] Failed to send SMS to ${countryCode}${phone}:`, err.message);
      
      // In development, provide fallback even on network errors
      if (!isProduction) {
        console.log(`[OTP] Development fallback due to error - OTP sent to ${countryCode}${phone} (code masked for security)`);
        return true;
      }
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
   * Send OTP to phone number
   */
  static async sendOTP(phone: string, countryCode: string, purpose: string): Promise<OtpSendResult> {
    try {
      // Check production requirements first
      this.checkProductionRequirements();
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

      // Generate OTP and hash it
      const otpCode = this.generateOTP();
      const otpHash = this.hashOTP(otpCode, phone);
      const expiresAt = new Date(Date.now() + (this.OTP_EXPIRY_MINUTES * 60 * 1000));

      // Store OTP in database (invalidate ALL previous active OTPs first)
      const storage = await getStorage();
      
      // Expire ALL existing active OTPs for this phone/purpose to ensure single active OTP
      const expiredCount = await storage.expireAllActiveOtpsForTarget(phone, countryCode, purpose);
      if (expiredCount > 0) {
        console.log(`[OTP] Expired ${expiredCount} previous active OTP(s) for ${countryCode}${phone} (${purpose})`);
      }
      
      await storage.storeOTPVerification({
        phone,
        countryCode,
        otpCodeHash: otpHash,
        purpose,
        maxAttempts: this.MAX_ATTEMPTS,
        expiresAt
      });

      // Send SMS
      const smsSuccess = await this.sendSMS(phone, countryCode, otpCode);
      
      if (!smsSuccess) {
        return createCommunicationResult('otp', false, 'Failed to send OTP. Please try again later.', {
          errorType: 'service_unavailable',
          retryable: true,
          metadata: { 
            maxAttempts: this.MAX_ATTEMPTS,
            expiresIn: this.OTP_EXPIRY_MINUTES * 60
          }
        });
      }

      return createCommunicationResult('otp', true, `OTP sent to ${countryCode}${phone}. Valid for ${this.OTP_EXPIRY_MINUTES} minutes.`, {
        metadata: { 
          expiresIn: this.OTP_EXPIRY_MINUTES * 60,
          maxAttempts: this.MAX_ATTEMPTS
        }
      });
    } catch (error) {
      const err = error as Error;
      console.error(`[OTP] Send error for ${countryCode}${phone}:`, err.message);
      const errorType = categorizeError(undefined, err.message);
      return createCommunicationResult('otp', false, 'Failed to send OTP. Please try again later.', {
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

      // Verify the OTP code
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