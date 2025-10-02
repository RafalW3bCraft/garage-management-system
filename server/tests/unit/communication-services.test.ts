import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { WhatsAppService } from '../../whatsapp-service';
import { sendEmailV2 } from '../../email-service';
import { OTPService } from '../../otp-service';
import { categorizeError, isErrorRetryable } from '@shared/communication-types';

// Mock Twilio
const mockTwilioCreate = jest.fn();
jest.mock('twilio', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: mockTwilioCreate
    }
  }));
});

// Mock SendGrid
const mockSendGridSend = jest.fn();
jest.mock('@sendgrid/mail', () => ({
  MailService: jest.fn().mockImplementation(() => ({
    setApiKey: jest.fn(),
    send: mockSendGridSend,
  })),
}));

// Mock storage
const mockGetStorage = jest.fn();
jest.mock('../../storage', () => ({
  getStorage: () => mockGetStorage(),
}));

// Mock global fetch for MessageCentral
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

describe('Communication Services - Unit Tests', () => {
  let mockStorage: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockStorage = {
      updateWhatsAppMessage: jest.fn<any>().mockResolvedValue(true),
      logWhatsAppMessage: jest.fn<any>().mockResolvedValue({ id: 'msg-123' }),
      storeOTPVerification: jest.fn<any>().mockResolvedValue({ id: 'otp-123' }),
      getActiveOtpVerification: jest.fn<any>(),
      expireAllActiveOtpsForTarget: jest.fn<any>().mockResolvedValue(1),
      getRecentOtpAttempts: jest.fn<any>().mockResolvedValue([]),
      incrementOtpAttempts: jest.fn<any>().mockResolvedValue(true),
      markOtpAsVerified: jest.fn<any>().mockResolvedValue(true),
      markOtpAsExpired: jest.fn<any>().mockResolvedValue(true),
    };
    
    (mockGetStorage as any).mockResolvedValue(mockStorage);
    
    // Set up environment variables
    process.env.TWILIO_ACCOUNT_SID = 'test-account-sid';
    process.env.TWILIO_AUTH_TOKEN = 'test-auth-token';
    process.env.TWILIO_WHATSAPP_FROM = 'whatsapp:+14155238886';
    process.env.SENDGRID_API_KEY = 'test-sendgrid-key';
    process.env.SENDGRID_FROM_EMAIL = 'test@example.com';
    process.env.MESSAGECENTRAL_AUTH_TOKEN = 'test-mc-token';
    process.env.MESSAGECENTRAL_CUSTOMER_ID = 'test-customer-id';
    process.env.OTP_SECRET = 'test-otp-secret';
  });

  afterEach(() => {
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.SENDGRID_API_KEY;
    delete process.env.MESSAGECENTRAL_AUTH_TOKEN;
    delete process.env.MESSAGECENTRAL_CUSTOMER_ID;
  });

  describe('WhatsApp Service - Real Service Tests', () => {
    describe('sendAppointmentConfirmation', () => {
      it('should send appointment confirmation via Twilio and log to storage', async () => {
        (mockTwilioCreate as any).mockResolvedValue({
          sid: 'SM123456789',
          status: 'queued',
        });

        const result = await WhatsAppService.sendAppointmentConfirmation(
          '9876543210',
          '+91',
          {
            customerName: 'John Doe',
            serviceName: 'Oil Change',
            dateTime: '2024-01-15 10:00 AM',
            location: 'Main Branch',
            carDetails: 'Toyota Camry 2020',
            bookingId: 'booking-123',
          }
        );

        expect(result.success).toBe(true);
        expect(result.service).toBe('whatsapp');
        expect(mockTwilioCreate).toHaveBeenCalled();
        expect(mockStorage.logWhatsAppMessage).toHaveBeenCalled();
      });

      it('should retry on retryable errors and succeed', async () => {
        // First call fails with retryable error (500)
        (mockTwilioCreate as any)
          .mockRejectedValueOnce({ code: 500, status: 500, message: 'Internal Server Error' })
          .mockResolvedValueOnce({ sid: 'SM123456789', status: 'queued' });

        const result = await WhatsAppService.sendAppointmentConfirmation(
          '9876543210',
          '+91',
          {
            customerName: 'John Doe',
            serviceName: 'Oil Change',
            dateTime: '2024-01-15 10:00 AM',
            location: 'Main Branch',
            carDetails: 'Toyota Camry 2020',
            bookingId: 'booking-123',
          }
        );

        expect(result.success).toBe(true);
        expect(mockTwilioCreate).toHaveBeenCalledTimes(2);
        expect(result.retryCount).toBeGreaterThan(0);
      });

      it('should not retry on non-retryable errors', async () => {
        (mockTwilioCreate as any).mockRejectedValue({ 
          code: 21614, 
          status: 400, 
          message: 'Invalid phone number' 
        });

        const result = await WhatsAppService.sendAppointmentConfirmation(
          'invalid',
          '+91',
          {
            customerName: 'John Doe',
            serviceName: 'Oil Change',
            dateTime: '2024-01-15 10:00 AM',
            location: 'Main Branch',
            carDetails: 'Toyota Camry 2020',
            bookingId: 'booking-123',
          }
        );

        expect(result.success).toBe(false);
        expect(mockTwilioCreate).toHaveBeenCalledTimes(1);
        expect(result.errorType).toBe('validation');
      });

      it('should fail after max retries', async () => {
        (mockTwilioCreate as any).mockRejectedValue({ 
          code: 503, 
          status: 503, 
          message: 'Service Unavailable' 
        });

        const result = await WhatsAppService.sendAppointmentConfirmation(
          '9876543210',
          '+91',
          {
            customerName: 'John Doe',
            serviceName: 'Oil Change',
            dateTime: '2024-01-15 10:00 AM',
            location: 'Main Branch',
            carDetails: 'Toyota Camry 2020',
            bookingId: 'booking-123',
          }
        );

        expect(result.success).toBe(false);
        expect(mockTwilioCreate).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
        expect(result.metadata?.finalFailure).toBe(true);
      });
    });

    describe('sendStatusUpdate', () => {
      it('should send status update message successfully', async () => {
        (mockTwilioCreate as any).mockResolvedValue({
          sid: 'SM987654321',
          status: 'sent',
        });

        const result = await WhatsAppService.sendStatusUpdate(
          '9876543210',
          '+91',
          {
            customerName: 'Jane Doe',
            bookingId: 'booking-456',
            status: 'completed',
            serviceName: 'Tire Rotation',
          }
        );

        expect(result.success).toBe(true);
        expect(mockTwilioCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            body: expect.stringContaining('completed'),
            to: 'whatsapp:+919876543210',
          })
        );
      });
    });
  });

  describe('Email Service - Real Service Tests', () => {
    describe('sendEmailV2', () => {
      it('should send email successfully via SendGrid', async () => {
        (mockSendGridSend as any).mockResolvedValue([{ statusCode: 202 }]);

        const result = await sendEmailV2({
          to: 'user@example.com',
          from: 'noreply@example.com',
          subject: 'Test Email',
          text: 'Test content',
          html: '<p>Test content</p>',
        });

        expect(result.success).toBe(true);
        expect(result.service).toBe('email');
        expect(mockSendGridSend).toHaveBeenCalledWith(
          expect.objectContaining({
            to: 'user@example.com',
            subject: 'Test Email',
          })
        );
      });

      it('should validate email format before sending', async () => {
        const result = await sendEmailV2({
          to: 'invalid-email',
          from: 'noreply@example.com',
          subject: 'Test',
          text: 'Test',
        });

        expect(result.success).toBe(false);
        expect(result.errorType).toBe('validation');
        expect(mockSendGridSend).not.toHaveBeenCalled();
      });

      it('should handle missing API key gracefully', async () => {
        delete process.env.SENDGRID_API_KEY;

        const result = await sendEmailV2({
          to: 'user@example.com',
          from: 'noreply@example.com',
          subject: 'Test',
          text: 'Test',
        });

        expect(result.success).toBe(false);
        expect(result.errorType).toBe('service_unavailable');
      });

      it('should categorize SendGrid errors correctly', async () => {
        (mockSendGridSend as any).mockRejectedValue({
          code: 401,
          response: {
            status: 401,
            body: { errors: [{ message: 'Unauthorized' }] },
          },
        });

        const result = await sendEmailV2({
          to: 'user@example.com',
          from: 'noreply@example.com',
          subject: 'Test',
          text: 'Test',
        });

        expect(result.success).toBe(false);
        expect(result.errorType).toBe('authentication');
      });

      it('should handle rate limit errors', async () => {
        (mockSendGridSend as any).mockRejectedValue({
          code: 429,
          response: {
            status: 429,
            body: { errors: [{ message: 'Rate limit exceeded' }] },
          },
        });

        const result = await sendEmailV2({
          to: 'user@example.com',
          from: 'noreply@example.com',
          subject: 'Test',
          text: 'Test',
        });

        expect(result.success).toBe(false);
        expect(result.errorType).toBe('rate_limit');
      });
    });
  });

  describe('OTP Service - Real Service Tests', () => {
    describe('sendOTP', () => {
      it('should send OTP via MessageCentral and store in database', async () => {
        (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
          ok: true,
          json: async () => ({ responseCode: 200 }),
        } as any);

        const result = await OTPService.sendOTP('9876543210', '+91', 'registration');

        expect(result.success).toBe(true);
        expect(result.service).toBe('otp');
        expect(mockStorage.expireAllActiveOtpsForTarget).toHaveBeenCalled();
        expect(mockStorage.storeOTPVerification).toHaveBeenCalledWith(
          expect.objectContaining({
            phone: '9876543210',
            countryCode: '+91',
            purpose: 'registration',
          })
        );
        expect(global.fetch).toHaveBeenCalled();
      });

      it('should enforce rate limiting', async () => {
        mockStorage.getRecentOtpAttempts.mockResolvedValue([
          { id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }, { id: '5' }
        ]);

        const result = await OTPService.sendOTP('9876543210', '+91', 'registration');

        expect(result.success).toBe(false);
        expect(result.errorType).toBe('rate_limit');
        expect(mockStorage.storeOTPVerification).not.toHaveBeenCalled();
      });

      it('should work in development mode without SMS credentials', async () => {
        delete process.env.MESSAGECENTRAL_AUTH_TOKEN;
        delete process.env.MESSAGECENTRAL_CUSTOMER_ID;
        process.env.NODE_ENV = 'development';

        const result = await OTPService.sendOTP('9876543210', '+91', 'registration');

        expect(result.success).toBe(true);
        expect(mockStorage.storeOTPVerification).toHaveBeenCalled();
      });

      it('should handle SMS API failures', async () => {
        (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
          ok: false,
          status: 500,
          text: async () => 'Internal Server Error',
        } as any);

        const result = await OTPService.sendOTP('9876543210', '+91', 'registration');

        expect(result.success).toBe(false);
        expect(result.errorType).toBe('service_unavailable');
      });
    });

    describe('verifyOTP', () => {
      it('should verify valid OTP successfully', async () => {
        const crypto = require('crypto');
        const otpCode = '123456';
        const phone = '9876543210';
        const secret = 'test-otp-secret';
        
        const data = `${otpCode}-${phone}`;
        const hash = crypto.createHmac('sha256', secret).update(data).digest('hex');

        mockStorage.getActiveOtpVerification.mockResolvedValue({
          id: 'otp-123',
          phone: '9876543210',
          countryCode: '+91',
          otpCodeHash: hash,
          purpose: 'registration',
          verified: false,
          attempts: 0,
          maxAttempts: 3,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        });

        const result = await OTPService.verifyOTP('9876543210', '+91', '123456', 'registration');

        expect(result.success).toBe(true);
        expect(mockStorage.markOtpAsVerified).toHaveBeenCalledWith('otp-123');
      });

      it('should reject expired OTP', async () => {
        mockStorage.getActiveOtpVerification.mockResolvedValue({
          id: 'otp-123',
          phone: '9876543210',
          countryCode: '+91',
          otpCodeHash: 'hash',
          purpose: 'registration',
          verified: false,
          attempts: 0,
          maxAttempts: 3,
          expiresAt: new Date(Date.now() - 1000), // Expired
        });

        const result = await OTPService.verifyOTP('9876543210', '+91', '123456', 'registration');

        expect(result.success).toBe(false);
        expect(result.metadata?.expired).toBe(true);
        expect(mockStorage.markOtpAsExpired).toHaveBeenCalled();
      });

      it('should reject after max verification attempts', async () => {
        mockStorage.getActiveOtpVerification.mockResolvedValue({
          id: 'otp-123',
          phone: '9876543210',
          countryCode: '+91',
          otpCodeHash: 'hash',
          purpose: 'registration',
          verified: false,
          attempts: 3,
          maxAttempts: 3,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        });

        const result = await OTPService.verifyOTP('9876543210', '+91', '123456', 'registration');

        expect(result.success).toBe(false);
        expect(result.message).toContain('Maximum');
        expect(mockStorage.markOtpAsExpired).toHaveBeenCalled();
      });

      it('should increment attempts on wrong OTP', async () => {
        // Use a valid 64-character hex hash that won't match the provided OTP
        const validWrongHash = 'a'.repeat(64);
        
        mockStorage.getActiveOtpVerification.mockResolvedValue({
          id: 'otp-123',
          phone: '9876543210',
          countryCode: '+91',
          otpCodeHash: validWrongHash,
          purpose: 'registration',
          verified: false,
          attempts: 0,
          maxAttempts: 3,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        });

        const result = await OTPService.verifyOTP('9876543210', '+91', '999999', 'registration');

        expect(result.success).toBe(false);
        expect(mockStorage.incrementOtpAttempts).toHaveBeenCalledWith('otp-123');
      });

      it('should reject when no active OTP found', async () => {
        mockStorage.getActiveOtpVerification.mockResolvedValue(null);

        const result = await OTPService.verifyOTP('9876543210', '+91', '123456', 'registration');

        expect(result.success).toBe(false);
        expect(result.message).toContain('No active');
      });
    });
  });

  describe('Error Categorization - Real Function Tests', () => {
    it('should categorize authentication errors', () => {
      expect(categorizeError('401', 'Unauthorized')).toBe('authentication');
      expect(categorizeError('20003', 'Auth failed')).toBe('authentication');
      expect(categorizeError('', 'authentication failed')).toBe('authentication');
    });

    it('should categorize rate limit errors', () => {
      expect(categorizeError('429', 'Too many requests')).toBe('rate_limit');
      expect(categorizeError('63021', '')).toBe('rate_limit');
      expect(categorizeError('', 'rate limit exceeded')).toBe('rate_limit');
    });

    it('should categorize validation errors', () => {
      expect(categorizeError('400', 'Bad request')).toBe('validation');
      expect(categorizeError('21614', 'Invalid number')).toBe('validation');
      expect(categorizeError('', 'invalid phone')).toBe('validation');
    });

    it('should categorize service unavailable errors', () => {
      expect(categorizeError('500', 'Internal error')).toBe('service_unavailable');
      expect(categorizeError('503', 'Service down')).toBe('service_unavailable');
    });

    it('should categorize policy violation errors', () => {
      expect(categorizeError('403', 'Forbidden')).toBe('policy_violation');
      expect(categorizeError('63018', 'Policy violation')).toBe('policy_violation');
    });

    it('should categorize network errors', () => {
      expect(categorizeError('', 'network error')).toBe('network');
      expect(categorizeError('', 'connection refused')).toBe('network');
      expect(categorizeError('', 'dns resolution failed')).toBe('network');
    });

    it('should return unknown for unrecognized errors', () => {
      expect(categorizeError('999', 'Unknown error')).toBe('unknown');
      expect(categorizeError('', '')).toBe('unknown');
    });
  });

  describe('Error Retryability - Real Function Tests', () => {
    it('should mark validation errors as non-retryable', () => {
      expect(isErrorRetryable('validation', '400')).toBe(false);
    });

    it('should mark authentication errors as non-retryable', () => {
      expect(isErrorRetryable('authentication', '401')).toBe(false);
    });

    it('should mark policy violations as non-retryable', () => {
      expect(isErrorRetryable('policy_violation', '403')).toBe(false);
    });

    it('should mark rate limit errors as retryable', () => {
      expect(isErrorRetryable('rate_limit', '429')).toBe(true);
    });

    it('should mark service unavailable as retryable', () => {
      expect(isErrorRetryable('service_unavailable', '503')).toBe(true);
    });

    it('should mark network errors as retryable', () => {
      expect(isErrorRetryable('network', '')).toBe(true);
    });

    it('should handle Twilio-specific non-retryable codes', () => {
      expect(isErrorRetryable('unknown', '21614')).toBe(false);
      expect(isErrorRetryable('unknown', '63018')).toBe(false);
    });

    it('should default to retryable for unknown errors', () => {
      expect(isErrorRetryable('unknown', '999')).toBe(true);
    });
  });
});
