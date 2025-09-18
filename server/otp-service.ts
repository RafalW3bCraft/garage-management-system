import crypto from 'crypto';
import { getStorage } from './storage';

// Country codes for phone number validation and formatting (India as main land + international markets)
export const SUPPORTED_COUNTRIES = [
  // Primary market - India as main land
  { code: '+91', name: 'India', flag: '🇮🇳' },
  
  // Major English-speaking markets
  { code: '+1', name: 'US/Canada', flag: '🇺🇸' },
  { code: '+44', name: 'United Kingdom', flag: '🇬🇧' },
  { code: '+61', name: 'Australia', flag: '🇦🇺' },
  { code: '+64', name: 'New Zealand', flag: '🇳🇿' },
  
  // Gulf & Middle East (major Indian diaspora)
  { code: '+971', name: 'UAE', flag: '🇦🇪' },
  { code: '+966', name: 'Saudi Arabia', flag: '🇸🇦' },
  { code: '+965', name: 'Kuwait', flag: '🇰🇼' },
  { code: '+973', name: 'Bahrain', flag: '🇧🇭' },
  { code: '+974', name: 'Qatar', flag: '🇶🇦' },
  { code: '+968', name: 'Oman', flag: '🇴🇲' },
  
  // South & Southeast Asia
  { code: '+65', name: 'Singapore', flag: '🇸🇬' },
  { code: '+60', name: 'Malaysia', flag: '🇲🇾' },
  { code: '+66', name: 'Thailand', flag: '🇹🇭' },
  { code: '+62', name: 'Indonesia', flag: '🇮🇩' },
  { code: '+63', name: 'Philippines', flag: '🇵🇭' },
  { code: '+84', name: 'Vietnam', flag: '🇻🇳' },
  
  // Europe
  { code: '+49', name: 'Germany', flag: '🇩🇪' },
  { code: '+33', name: 'France', flag: '🇫🇷' },
  { code: '+39', name: 'Italy', flag: '🇮🇹' },
  { code: '+34', name: 'Spain', flag: '🇪🇸' },
  { code: '+31', name: 'Netherlands', flag: '🇳🇱' },
  
  // Asia Pacific & Other Major Markets
  { code: '+86', name: 'China', flag: '🇨🇳' },
  { code: '+81', name: 'Japan', flag: '🇯🇵' },
  { code: '+82', name: 'South Korea', flag: '🇰🇷' },
  { code: '+55', name: 'Brazil', flag: '🇧🇷' },
  { code: '+7', name: 'Russia', flag: '🇷🇺' },
] as const;

export interface OtpSendResult {
  success: boolean;
  message: string;
  rateLimited?: boolean;
  expiresIn?: number;
  attempts?: number;
  maxAttempts?: number;
}

export interface OtpVerifyResult {
  success: boolean;
  message: string;
  attempts?: number;
  maxAttempts?: number;
  expired?: boolean;
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
      
      if (!process.env.MESSAGECENTRAL_API_KEY) {
        throw new Error('MESSAGECENTRAL_API_KEY must be set in production');
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
   * Send OTP via MessageCentral SMS API
   */
  private static async sendSMS(phone: string, countryCode: string, otpCode: string): Promise<boolean> {
    const isProduction = process.env.NODE_ENV === 'production';
    
    // If no API credentials in development, log for debugging
    if (!process.env.MESSAGECENTRAL_API_KEY) {
      if (isProduction) {
        console.error('[OTP] MESSAGECENTRAL_API_KEY not configured in production');
        return false;
      }
      console.log(`[OTP] Development mode - OTP for ${countryCode}${phone}: ${otpCode}`);
      return true;
    }

    try {
      const response = await fetch('https://cpaas.messagecentral.com/verification/v2/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.MESSAGECENTRAL_API_KEY}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          type: 'SMS',
          countryCode: countryCode,
          phoneNumber: phone,
          otpLength: 6,
          channel: 'SMS',
          expiry: this.OTP_EXPIRY_MINUTES * 60, // Convert to seconds
          templateId: process.env.MESSAGECENTRAL_TEMPLATE_ID,
          senderId: process.env.MESSAGECENTRAL_SENDER_ID || 'RonakMotor',
          message: `Your Ronak Motor Garage verification code is: ${otpCode}. Valid for ${this.OTP_EXPIRY_MINUTES} minutes. Do not share this code.`
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[OTP] MessageCentral API error ${response.status}:`, errorText);
        return false;
      }

      const result = await response.json();
      console.log(`[OTP] SMS sent successfully to ${countryCode}${phone}`);
      return true;
    } catch (error: any) {
      console.error(`[OTP] Failed to send SMS to ${countryCode}${phone}:`, error.message);
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
        return {
          success: false,
          message: `Too many OTP requests. Please wait before requesting another code.`,
          rateLimited: true
        };
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
        return {
          success: false,
          message: 'Failed to send OTP. Please try again later.'
        };
      }

      return {
        success: true,
        message: `OTP sent to ${countryCode}${phone}. Valid for ${this.OTP_EXPIRY_MINUTES} minutes.`
      };
    } catch (error: any) {
      console.error(`[OTP] Send error for ${countryCode}${phone}:`, error.message);
      return {
        success: false,
        message: 'Failed to send OTP. Please try again later.'
      };
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
        return {
          success: false,
          message: 'No active OTP found. Please request a new code.'
        };
      }

      // Check if expired
      if (new Date() > otpRecord.expiresAt) {
        await storage.markOtpAsExpired(otpRecord.id);
        return {
          success: false,
          message: 'OTP has expired. Please request a new code.',
          expired: true
        };
      }

      // Check if max attempts exceeded
      const currentAttempts = otpRecord.attempts ?? 0;
      const maxAttempts = otpRecord.maxAttempts ?? 3;
      
      if (currentAttempts >= maxAttempts) {
        await storage.markOtpAsExpired(otpRecord.id);
        return {
          success: false,
          message: 'Maximum verification attempts exceeded. Please request a new code.',
          attempts: currentAttempts,
          maxAttempts: maxAttempts
        };
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
          return {
            success: false,
            message: 'Invalid OTP. Maximum attempts exceeded. Please request a new code.',
            attempts: newAttemptCount,
            maxAttempts: otpRecord.maxAttempts ?? 3
          };
        }
        
        return {
          success: false,
          message: `Invalid OTP. ${remainingAttempts} attempt${remainingAttempts !== 1 ? 's' : ''} remaining.`,
          attempts: newAttemptCount,
          maxAttempts: otpRecord.maxAttempts ?? 3
        };
      }

      // Mark as verified
      await storage.markOtpAsVerified(otpRecord.id);
      
      console.log(`[OTP] Successfully verified OTP for ${countryCode}${phone} (${purpose})`);
      return {
        success: true,
        message: 'OTP verified successfully!'
      };
    } catch (error: any) {
      console.error(`[OTP] Verify error for ${countryCode}${phone}:`, error.message);
      return {
        success: false,
        message: 'Failed to verify OTP. Please try again.'
      };
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
    } catch (error: any) {
      console.error('[OTP] Cleanup failed:', error.message);
    }
  }

  /**
   * Validate phone number format
   */
  static validatePhoneNumber(phone: string, countryCode: string): { valid: boolean; message?: string } {
    // Check if country code is supported
    const supportedCountry = SUPPORTED_COUNTRIES.find(c => c.code === countryCode);
    if (!supportedCountry) {
      return { valid: false, message: 'Unsupported country code' };
    }

    // Basic phone number validation
    if (!/^\d{7,15}$/.test(phone)) {
      return { valid: false, message: 'Phone number must be 7-15 digits' };
    }

    // India-specific validation
    if (countryCode === '+91' && !/^[6-9]\d{9}$/.test(phone)) {
      return { valid: false, message: 'Invalid Indian mobile number format' };
    }

    return { valid: true };
  }
}