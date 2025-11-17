import { MailService } from '@sendgrid/mail';
import { 
  createCommunicationResult, 
  categorizeError, 
  type CommunicationResult 
} from '@shared/communication-types';
import { BaseCommunicationService, type RetryConfig, type CircuitBreakerConfig } from './base-communication-service';

interface SendGridErrorField {
  message?: string;
  field?: string;
  help?: string;
  error_id?: string;
}

interface SendGridErrorResponse {
  errors?: SendGridErrorField[];
  message?: string;
  field?: string;
  help?: string;
  error_id?: string;
  error_count?: number;
  to?: unknown;
  from?: unknown;
  personalizations?: unknown;
  content?: unknown;
  subject?: unknown;
  headers?: unknown;
}

interface SendGridError extends Error {
  code?: string | number;
  response?: {
    status?: number;
    body?: SendGridErrorResponse;
  };
}

interface EmailData {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
}

let mailService: MailService | null = null;

function initializeMailService() {
  if (!process.env.SENDGRID_API_KEY) {
    console.warn("[EMAIL] SENDGRID_API_KEY environment variable not set - email notifications disabled");
    return false;
  }

  if (!mailService) {
    mailService = new MailService();
    mailService.setApiKey(process.env.SENDGRID_API_KEY);
  }
  return true;
}

function sanitizeSendGridError(responseBody: SendGridErrorResponse): Partial<SendGridErrorResponse> {
  if (!responseBody || typeof responseBody !== 'object') {
    return { error_id: 'unknown' };
  }

  const sanitized: Partial<SendGridErrorResponse> = {};

  const safeFields: (keyof SendGridErrorField)[] = ['message', 'field', 'help', 'error_id'];

  if (Array.isArray(responseBody.errors)) {
    sanitized.errors = responseBody.errors.map((error: SendGridErrorField) => {
      const safeError: Partial<SendGridErrorField> = {};
      safeFields.forEach(field => {
        if (error[field] !== undefined) {
          safeError[field] = error[field];
        }
      });
      return safeError as SendGridErrorField;
    });
  }

  if (responseBody.message) sanitized.message = responseBody.message;
  if (responseBody.field) sanitized.field = responseBody.field;
  if (responseBody.help) sanitized.help = responseBody.help;
  if (responseBody.error_id) sanitized.error_id = responseBody.error_id;

  if (responseBody.error_count !== undefined) {
    sanitized.error_count = responseBody.error_count;
  }
  
  return sanitized;
}

function isSenderVerificationError(responseBody: SendGridErrorResponse | null): boolean {
  if (!responseBody) {
    return false;
  }

  const verificationKeywords = [
    'sender identity',
    'verified',
    'verify',
    'from address',
    'sender authentication',
    'single sender verification',
    'domain authentication'
  ];

  if (Array.isArray(responseBody.errors)) {
    for (const error of responseBody.errors) {

      if (error.field === 'from') {
        return true;
      }

      if (error.message) {
        const messageLower = error.message.toLowerCase();
        if (verificationKeywords.some(keyword => messageLower.includes(keyword))) {
          return true;
        }
      }

      if (error.help) {
        const helpLower = error.help.toLowerCase();
        if (verificationKeywords.some(keyword => helpLower.includes(keyword))) {
          return true;
        }
      }
    }
  }

  if (responseBody.message) {
    const messageLower = responseBody.message.toLowerCase();
    if (verificationKeywords.some(keyword => messageLower.includes(keyword))) {
      return true;
    }
  }

  if (responseBody.field === 'from') {
    return true;
  }

  if (responseBody.help) {
    const helpLower = responseBody.help.toLowerCase();
    if (verificationKeywords.some(keyword => helpLower.includes(keyword))) {
      return true;
    }
  }

  return false;
}

interface EmailParams {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
}

class EmailServiceHelper extends BaseCommunicationService {
  constructor(retryConfig: RetryConfig, circuitBreakerConfig: CircuitBreakerConfig) {
    super('EMAIL', retryConfig, circuitBreakerConfig);
  }
}

const EMAIL_RETRY_CONFIG: RetryConfig = {
  initialDelayMs: parseInt(process.env.EMAIL_RETRY_DELAY || '1000'),
  maxDelayMs: parseInt(process.env.EMAIL_MAX_RETRY_DELAY || '30000'),
  maxRetries: parseInt(process.env.EMAIL_MAX_RETRIES || '2'),
  backoffMultiplier: parseFloat(process.env.EMAIL_BACKOFF_MULTIPLIER || '2')
};

const EMAIL_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: parseInt(process.env.EMAIL_CIRCUIT_THRESHOLD || '5'),
  recoveryTimeoutMinutes: parseInt(process.env.EMAIL_CIRCUIT_RECOVERY_MIN || '5')
};

const emailHelper = new EmailServiceHelper(EMAIL_RETRY_CONFIG, EMAIL_CIRCUIT_CONFIG);

async function sendEmailCore(params: EmailParams): Promise<any> {
  const emailData: EmailData = {
    to: params.to,
    from: params.from,
    subject: params.subject,
    ...(params.text && { text: params.text }),
    ...(params.html && { html: params.html })
  };

  const emailPromise = mailService!.send(emailData as any);
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Email send timeout after 15 seconds')), 15000)
  );

  const result = await Promise.race([emailPromise, timeoutPromise]);
  
  return result;
}

export async function sendEmailV2(params: EmailParams): Promise<CommunicationResult> {
  if (!initializeMailService() || !mailService) {
    return createCommunicationResult('email', false, 'Email service not initialized', {
      errorType: 'service_unavailable',
      retryable: true
    });
  }

  if (!params.to || !params.from || !params.subject) {
    console.error(`[EMAIL] Invalid email parameters - to: ${!!params.to}, from: ${!!params.from}, subject: ${!!params.subject}`);
    return createCommunicationResult('email', false, 'Missing required email parameters', {
      errorType: 'validation',
      retryable: false
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(params.to)) {
    console.error(`[EMAIL] Invalid recipient email format: ${params.to}`);
    return createCommunicationResult('email', false, 'Invalid recipient email format', {
      errorType: 'validation',
      retryable: false
    });
  }

  if (!emailRegex.test(params.from)) {
    console.error(`[EMAIL] Invalid sender email format: ${params.from}`);
    return createCommunicationResult('email', false, 'Invalid sender email format', {
      errorType: 'validation',
      retryable: false
    });
  }

  const operationName = `send email to ${params.to}`;
  const { result, success, error, attempts } = await emailHelper['executeWithProtection'](
    () => sendEmailCore(params),
    operationName
  );

  if (success && result) {
    return createCommunicationResult('email', true, `Email sent successfully to ${params.to}`, {
      retryCount: attempts - 1,
      totalAttempts: attempts,
      metadata: { emailId: Array.isArray(result) && result[0]?.headers?.['x-message-id'] }
    });
  }

  const err = error as SendGridError;
  const errorMsg = err?.message || 'Unknown error';
  const statusCode = err?.code || err?.response?.status || 'N/A';
  const responseBody = err?.response?.body || null;
  
  console.error(`[EMAIL] ❌ Failed to send to ${params.to} after ${attempts} attempts`);
  console.error(`[EMAIL] Error: ${errorMsg}`);
  console.error(`[EMAIL] Status Code: ${statusCode}`);
  
  if (responseBody) {
    const sanitizedResponse = sanitizeSendGridError(responseBody);
    console.error(`[EMAIL] SendGrid Response: ${JSON.stringify(sanitizedResponse, null, 2)}`);
  }
  
  let userFacingMessage = `Failed to send email: ${errorMsg}`;
  
  if (statusCode === 401) {
    console.error(`[EMAIL] 🔑 Authentication failed - check SENDGRID_API_KEY`);
    userFacingMessage = 'Email service authentication failed. Please check your SendGrid API key configuration.';
  } else if (statusCode === 403) {
    const isSenderVerification = isSenderVerificationError(responseBody);
    
    if (isSenderVerification) {
      const senderEmail = params.from;
      const sendgridVerificationUrl = 'https://app.sendgrid.com/settings/sender_auth/senders';
      
      console.error(`[EMAIL] 🚫 SENDER VERIFICATION REQUIRED`);
      console.error(`[EMAIL] ============================================`);
      console.error(`[EMAIL] The sender email "${senderEmail}" is not verified in SendGrid.`);
      console.error(`[EMAIL] `);
      console.error(`[EMAIL] 📋 To fix this issue, follow these steps:`);
      console.error(`[EMAIL] 1. Visit SendGrid Sender Authentication: ${sendgridVerificationUrl}`);
      console.error(`[EMAIL] 2. Click "Create New Sender" or verify existing sender`);
      console.error(`[EMAIL] 3. Add and verify the email address: ${senderEmail}`);
      console.error(`[EMAIL] 4. Check your inbox for verification email from SendGrid`);
      console.error(`[EMAIL] 5. Click the verification link in the email`);
      console.error(`[EMAIL] 6. Once verified, emails will send successfully`);
      console.error(`[EMAIL] `);
      console.error(`[EMAIL] ℹ️  Note: You can also set a different verified sender email`);
      console.error(`[EMAIL]    using the SENDGRID_FROM_EMAIL environment variable.`);
      console.error(`[EMAIL] ============================================`);
      
      userFacingMessage = `Email delivery failed: The sender email "${senderEmail}" is not verified in SendGrid. ` +
        `To fix this, verify your sender email at ${sendgridVerificationUrl}. ` +
        `Steps: (1) Visit the SendGrid Sender Authentication page, (2) Create or verify sender "${senderEmail}", ` +
        `(3) Check your inbox for the verification email from SendGrid, (4) Click the verification link. ` +
        `Alternatively, update SENDGRID_FROM_EMAIL to use a different verified email address.`;
    } else {
      console.error(`[EMAIL] 🚫 Forbidden - Access denied by SendGrid`);
      userFacingMessage = 'Email delivery failed: Access forbidden. Please check your SendGrid account permissions and settings.';
    }
  } else if (statusCode === 400) {
    console.error(`[EMAIL] 📝 Bad request - check email format and content`);
    userFacingMessage = 'Email request failed due to invalid format or content. Please check the email parameters.';
  }
  
  const errorType = categorizeError(String(statusCode), errorMsg);
  const circuitBreakerOpen = !emailHelper['circuitBreaker'].canAttempt();
  
  const metadata: Record<string, any> = { 
    statusCode: statusCode !== 'N/A' ? Number(statusCode) : undefined,
    circuitBreakerOpen
  };
  
  if (statusCode === 403 && isSenderVerificationError(responseBody)) {
    metadata.senderEmail = params.from;
    metadata.verificationUrl = 'https://app.sendgrid.com/settings/sender_auth/senders';
  }
  
  return createCommunicationResult('email', false, userFacingMessage, {
    errorCode: String(statusCode),
    errorType,
    retryable: errorType === 'service_unavailable' || errorType === 'network' || errorType === 'unknown',
    retryCount: attempts - 1,
    totalAttempts: attempts,
    metadata
  });
}

export async function sendEmail(params: EmailParams): Promise<boolean> {
  const result = await sendEmailV2(params);
  return result.success;
}

export interface AppointmentEmailData {
  customerName: string;
  serviceName: string;
  dateTime: string;
  location: string;
  carDetails: string;
  price?: number;
  mechanicName?: string;
}

export class EmailNotificationService {
  private static FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "noreply@ronakmotorgarage.com";

  static async sendAppointmentConfirmationAsync(to: string, data: AppointmentEmailData): Promise<void> {

    setImmediate(async () => {
      try {
        await this.sendAppointmentConfirmation(to, data);
      } catch (error) {
        const err = error as Error;
        console.error(`[EMAIL] Async appointment confirmation failed for ${to}:`, err.message);
      }
    });
  }

  static async sendAppointmentConfirmation(to: string, data: AppointmentEmailData): Promise<boolean> {
    const subject = `Appointment Confirmed - ${data.serviceName}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c3e50;">Appointment Confirmed</h2>
        <p>Hello ${data.customerName},</p>
        <p>Your appointment has been confirmed with the following details:</p>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #495057; margin-top: 0;">Appointment Details</h3>
          <p><strong>Service:</strong> ${data.serviceName}</p>
          <p><strong>Date & Time:</strong> ${data.dateTime}</p>
          <p><strong>Location:</strong> ${data.location}</p>
          <p><strong>Vehicle:</strong> ${data.carDetails}</p>
          ${data.mechanicName ? `<p><strong>Mechanic:</strong> ${data.mechanicName}</p>` : ''}
          ${data.price ? `<p><strong>Estimated Price:</strong> ₹${data.price.toLocaleString('en-IN')}</p>` : ''}
        </div>
        
        <p>Please arrive 10 minutes before your scheduled appointment time.</p>
        <p>If you need to reschedule or cancel, please contact us as soon as possible.</p>
        
        <p style="margin-top: 30px;">
          Best regards,<br>
          <strong>Ronak Motor Garage Team</strong>
        </p>
      </div>
    `;

    const text = `
Appointment Confirmed - ${data.serviceName}

Hello ${data.customerName},

Your appointment has been confirmed with the following details:

Service: ${data.serviceName}
Date & Time: ${data.dateTime}
Location: ${data.location}
Vehicle: ${data.carDetails}
${data.mechanicName ? `Mechanic: ${data.mechanicName}\n` : ''}${data.price ? `Estimated Price: ₹${data.price.toLocaleString('en-IN')}\n` : ''}

Please arrive 10 minutes before your scheduled appointment time.
If you need to reschedule or cancel, please contact us as soon as possible.

Best regards,
Ronak Motor Garage Team
    `;

    return sendEmail({
      to,
      from: this.FROM_EMAIL,
      subject,
      html,
      text: text.trim()
    });
  }

  static async sendAppointmentStatusUpdate(to: string, data: AppointmentEmailData & { status: string }): Promise<boolean> {
    const statusMessages = {
      'confirmed': 'Your appointment has been confirmed',
      'in-progress': 'Your vehicle service is now in progress',
      'completed': 'Your vehicle service has been completed',
      'cancelled': 'Your appointment has been cancelled'
    };

    const subject = `Appointment Update - ${data.serviceName}`;
    const statusMessage = statusMessages[data.status as keyof typeof statusMessages] || `Appointment status updated to: ${data.status}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c3e50;">Appointment Status Update</h2>
        <p>Hello ${data.customerName},</p>
        <p>${statusMessage}.</p>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #495057; margin-top: 0;">Appointment Details</h3>
          <p><strong>Service:</strong> ${data.serviceName}</p>
          <p><strong>Date & Time:</strong> ${data.dateTime}</p>
          <p><strong>Status:</strong> <span style="color: #28a745; font-weight: bold;">${data.status.toUpperCase()}</span></p>
          <p><strong>Vehicle:</strong> ${data.carDetails}</p>
          ${data.mechanicName ? `<p><strong>Mechanic:</strong> ${data.mechanicName}</p>` : ''}
        </div>
        
        ${data.status === 'completed' ? `
          <p style="color: #28a745; font-weight: bold;">Thank you for choosing Ronak Motor Garage!</p>
          <p>We hope you're satisfied with our service. Please don't hesitate to book another appointment if needed.</p>
        ` : ''}
        
        <p style="margin-top: 30px;">
          Best regards,<br>
          <strong>Ronak Motor Garage Team</strong>
        </p>
      </div>
    `;

    return sendEmail({
      to,
      from: this.FROM_EMAIL,
      subject,
      html,
      text: `${statusMessage}\n\nService: ${data.serviceName}\nDate & Time: ${data.dateTime}\nStatus: ${data.status.toUpperCase()}\nVehicle: ${data.carDetails}\n\nBest regards,\nRonak Motor Garage Team`
    });
  }

  static async sendAppointmentReminder(to: string, data: AppointmentEmailData): Promise<boolean> {
    const subject = `Reminder: Appointment Tomorrow - ${data.serviceName}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #e67e22;">Appointment Reminder</h2>
        <p>Hello ${data.customerName},</p>
        <p>This is a friendly reminder about your appointment tomorrow:</p>
        
        <div style="background-color: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
          <h3 style="color: #856404; margin-top: 0;">Tomorrow's Appointment</h3>
          <p><strong>Service:</strong> ${data.serviceName}</p>
          <p><strong>Date & Time:</strong> ${data.dateTime}</p>
          <p><strong>Location:</strong> ${data.location}</p>
          <p><strong>Vehicle:</strong> ${data.carDetails}</p>
        </div>
        
        <p><strong>Reminder:</strong> Please arrive 10 minutes before your scheduled time.</p>
        <p>If you need to reschedule or cancel, please contact us immediately.</p>
        
        <p style="margin-top: 30px;">
          Best regards,<br>
          <strong>Ronak Motor Garage Team</strong>
        </p>
      </div>
    `;

    return sendEmail({
      to,
      from: this.FROM_EMAIL,
      subject,
      html,
      text: `Reminder: Appointment Tomorrow - ${data.serviceName}\n\nService: ${data.serviceName}\nDate & Time: ${data.dateTime}\nLocation: ${data.location}\nVehicle: ${data.carDetails}\n\nPlease arrive 10 minutes before your scheduled time.\n\nBest regards,\nRonak Motor Garage Team`
    });
  }

  static async sendBidNotification(to: string, data: { customerName: string; carName: string; bidAmount: number; currentHighestBid: number }): Promise<boolean> {
    const subject = `Bid Update - ${data.carName}`;
    const isHighestBidder = data.bidAmount === data.currentHighestBid;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c3e50;">Auction Bid Update</h2>
        <p>Hello ${data.customerName},</p>
        
        ${isHighestBidder ? `
          <div style="background-color: #d4edda; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
            <h3 style="color: #155724; margin-top: 0;">You're the Highest Bidder!</h3>
            <p>Your bid of <strong>₹${data.bidAmount.toLocaleString('en-IN')}</strong> for <strong>${data.carName}</strong> is now the highest bid.</p>
          </div>
        ` : `
          <div style="background-color: #f8d7da; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc3545;">
            <h3 style="color: #721c24; margin-top: 0;">You've Been Outbid</h3>
            <p>Someone has placed a higher bid on <strong>${data.carName}</strong>.</p>
            <p>Current highest bid: <strong>₹${data.currentHighestBid.toLocaleString('en-IN')}</strong></p>
            <p>Your bid: ₹${data.bidAmount.toLocaleString('en-IN')}</p>
          </div>
        `}
        
        <p>Visit our auction page to place a new bid or monitor the auction progress.</p>
        
        <p style="margin-top: 30px;">
          Best regards,<br>
          <strong>Ronak Motor Garage Team</strong>
        </p>
      </div>
    `;

    return sendEmail({
      to,
      from: this.FROM_EMAIL,
      subject,
      html,
      text: `Auction Bid Update - ${data.carName}\n\n${isHighestBidder ? `You're the highest bidder with ₹${data.bidAmount.toLocaleString('en-IN')}!` : `You've been outbid. Current highest: ₹${data.currentHighestBid.toLocaleString('en-IN')}`}\n\nBest regards,\nRonak Motor Garage Team`
    });
  }

  static async sendVerificationEmail(to: string, token: string, name: string): Promise<boolean> {

    const explicitUrl = process.env.APP_URL || process.env.BASE_URL;
    
    let baseUrl: string;
    
    if (explicitUrl) {

      baseUrl = explicitUrl.replace(/\/$/, '');
    } else {

      const port = process.env.PORT || "5000";
      const isReplit = !!(process.env.REPL_SLUG || process.env.REPL_OWNER || process.env.REPLIT_DB_URL);
      const isProduction = process.env.NODE_ENV === "production";
      
      if (isReplit) {
        if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
          baseUrl = `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.replit.dev`;
        } else {
          baseUrl = process.env.REPLIT_URL || process.env.REPL_URL || `https://localhost:${port}`;
        }
      } else if (isProduction) {
        baseUrl = process.env.PRODUCTION_URL || `https://localhost:${port}`;
      } else {
        baseUrl = `http://localhost:${port}`;
      }
    }

    const verificationLink = `${baseUrl}/verify-email?token=${token}&email=${encodeURIComponent(to)}`;
    
    const subject = "Verify Your Email - Ronak Motor Garage";
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa;">
        <div style="background-color: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2c3e50; margin: 0; font-size: 28px;">Ronak Motor Garage</h1>
          </div>
          
          <h2 style="color: #2c3e50; margin-bottom: 20px;">Welcome, ${name}!</h2>
          
          <p style="color: #495057; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
            Thank you for registering with Ronak Motor Garage. To complete your registration and access all features, please verify your email address.
          </p>
          
          <div style="text-align: center; margin: 40px 0;">
            <a href="${verificationLink}" 
               style="display: inline-block; background-color: #007bff; color: white; padding: 16px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
              Verify Email Address
            </a>
          </div>
          
          <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 30px 0; border-radius: 4px;">
            <p style="margin: 0; color: #856404; font-size: 14px;">
              <strong>Important:</strong> This verification link will expire in 24 hours.
            </p>
          </div>
          
          <p style="color: #6c757d; font-size: 14px; line-height: 1.6; margin-top: 30px;">
            If the button above doesn't work, copy and paste this link into your browser:
          </p>
          <p style="color: #007bff; font-size: 13px; word-break: break-all; background-color: #f8f9fa; padding: 10px; border-radius: 4px;">
            ${verificationLink}
          </p>
          
          <hr style="border: none; border-top: 1px solid #dee2e6; margin: 30px 0;">
          
          <p style="color: #6c757d; font-size: 14px; line-height: 1.6; margin: 0;">
            If you didn't create an account with Ronak Motor Garage, please ignore this email.
          </p>
          
          <p style="color: #6c757d; font-size: 14px; margin-top: 30px;">
            Best regards,<br>
            <strong style="color: #2c3e50;">The Ronak Motor Garage Team</strong>
          </p>
        </div>
        
        <div style="text-align: center; margin-top: 20px; color: #6c757d; font-size: 12px;">
          <p>This is an automated message, please do not reply to this email.</p>
        </div>
      </div>
    `;

    const text = `
Welcome to Ronak Motor Garage, ${name}!

Thank you for registering with us. To complete your registration and access all features, please verify your email address.

Click the link below to verify your email:
${verificationLink}

Important: This verification link will expire in 24 hours.

If you didn't create an account with Ronak Motor Garage, please ignore this email.

Best regards,
The Ronak Motor Garage Team

---
This is an automated message, please do not reply to this email.
    `;

    return sendEmail({
      to,
      from: this.FROM_EMAIL,
      subject,
      html,
      text: text.trim()
    });
  }

  static async sendPasswordResetEmail(to: string, token: string, name: string): Promise<boolean> {

    const explicitUrl = process.env.APP_URL || process.env.BASE_URL;
    
    let baseUrl: string;
    
    if (explicitUrl) {

      baseUrl = explicitUrl.replace(/\/$/, '');
    } else {

      const port = process.env.PORT || "5000";
      const isReplit = !!(process.env.REPL_SLUG || process.env.REPL_OWNER || process.env.REPLIT_DB_URL);
      const isProduction = process.env.NODE_ENV === "production";
      
      if (isReplit) {
        if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
          baseUrl = `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.replit.dev`;
        } else {
          baseUrl = process.env.REPLIT_URL || process.env.REPL_URL || `https://localhost:${port}`;
        }
      } else if (isProduction) {
        baseUrl = process.env.PRODUCTION_URL || `https://localhost:${port}`;
      } else {
        baseUrl = `http://localhost:${port}`;
      }
    }

    const resetLink = `${baseUrl}/reset-password?token=${token}&email=${encodeURIComponent(to)}`;
    
    const subject = "Reset Your Password - Ronak Motor Garage";
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa;">
        <div style="background-color: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2c3e50; margin: 0; font-size: 28px;">Ronak Motor Garage</h1>
          </div>
          
          <h2 style="color: #2c3e50; margin-bottom: 20px;">Password Reset Request</h2>
          
          <p style="color: #495057; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
            Hello ${name},
          </p>
          
          <p style="color: #495057; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
            We received a request to reset your password for your Ronak Motor Garage account. Click the button below to set a new password.
          </p>
          
          <div style="text-align: center; margin: 40px 0;">
            <a href="${resetLink}" 
               style="display: inline-block; background-color: #dc3545; color: white; padding: 16px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
              Reset Password
            </a>
          </div>
          
          <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 30px 0; border-radius: 4px;">
            <p style="margin: 0; color: #856404; font-size: 14px;">
              <strong>Important:</strong> This password reset link will expire in 24 hours.
            </p>
          </div>
          
          <p style="color: #6c757d; font-size: 14px; line-height: 1.6; margin-top: 30px;">
            If the button above doesn't work, copy and paste this link into your browser:
          </p>
          <p style="color: #007bff; font-size: 13px; word-break: break-all; background-color: #f8f9fa; padding: 10px; border-radius: 4px;">
            ${resetLink}
          </p>
          
          <hr style="border: none; border-top: 1px solid #dee2e6; margin: 30px 0;">
          
          <p style="color: #6c757d; font-size: 14px; line-height: 1.6; margin: 0;">
            If you didn't request a password reset, please ignore this email. Your password will remain unchanged.
          </p>
          
          <p style="color: #6c757d; font-size: 14px; margin-top: 30px;">
            Best regards,<br>
            <strong style="color: #2c3e50;">The Ronak Motor Garage Team</strong>
          </p>
        </div>
        
        <div style="text-align: center; margin-top: 20px; color: #6c757d; font-size: 12px;">
          <p>This is an automated message, please do not reply to this email.</p>
        </div>
      </div>
    `;

    const text = `
Password Reset Request - Ronak Motor Garage

Hello ${name},

We received a request to reset your password for your Ronak Motor Garage account. Click the link below to set a new password.

${resetLink}

Important: This password reset link will expire in 24 hours.

If you didn't request a password reset, please ignore this email. Your password will remain unchanged.

Best regards,
The Ronak Motor Garage Team

---
This is an automated message, please do not reply to this email.
    `;

    return sendEmail({
      to,
      from: this.FROM_EMAIL,
      subject,
      html,
      text: text.trim()
    });
  }
}
