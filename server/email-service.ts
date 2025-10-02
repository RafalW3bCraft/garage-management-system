import { MailService } from '@sendgrid/mail';
import { 
  createCommunicationResult, 
  categorizeError, 
  type CommunicationResult 
} from '@shared/communication-types';

// SendGrid error types
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

// Referenced from SendGrid integration blueprint
let mailService: MailService | null = null;

function initializeMailService() {
  if (!process.env.SENDGRID_API_KEY) {
    console.warn("[EMAIL] SENDGRID_API_KEY environment variable not set - email notifications disabled");
    return false;
  }

  if (!mailService) {
    mailService = new MailService();
    mailService.setApiKey(process.env.SENDGRID_API_KEY);
    console.log(`[EMAIL] Service initialized with sender: ${process.env.SENDGRID_FROM_EMAIL || 'noreply@ronakmotorgarage.com'}`);
  }
  return true;
}

/**
 * Sanitize SendGrid error response to prevent sensitive data exposure
 */
function sanitizeSendGridError(responseBody: SendGridErrorResponse): Partial<SendGridErrorResponse> {
  if (!responseBody || typeof responseBody !== 'object') {
    return { error_id: 'unknown' };
  }

  // Keep only safe, non-PII error information
  const sanitized: Partial<SendGridErrorResponse> = {};
  
  // Safe fields to include in logs
  const safeFields: (keyof SendGridErrorField)[] = ['message', 'field', 'help', 'error_id'];
  
  // If it's an array of errors (common SendGrid format)
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
  
  // Include top-level safe fields
  if (responseBody.message) sanitized.message = responseBody.message;
  if (responseBody.field) sanitized.field = responseBody.field;
  if (responseBody.help) sanitized.help = responseBody.help;
  if (responseBody.error_id) sanitized.error_id = responseBody.error_id;
  
  // Include error count if available
  if (responseBody.error_count !== undefined) {
    sanitized.error_count = responseBody.error_count;
  }
  
  return sanitized;
}

interface EmailParams {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
}

// Main function returns CommunicationResult
export async function sendEmailV2(params: EmailParams): Promise<CommunicationResult> {
  if (!initializeMailService() || !mailService) {
    console.log("[EMAIL] Service not initialized - skipping email");
    return createCommunicationResult('email', false, 'Email service not initialized', {
      errorType: 'service_unavailable',
      retryable: true
    });
  }

  // Validate email parameters
  if (!params.to || !params.from || !params.subject) {
    console.error(`[EMAIL] Invalid email parameters - to: ${!!params.to}, from: ${!!params.from}, subject: ${!!params.subject}`);
    return createCommunicationResult('email', false, 'Missing required email parameters', {
      errorType: 'validation',
      retryable: false
    });
  }

  // Basic email format validation
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

  try {
    const emailData: EmailData = {
      to: params.to,
      from: params.from,
      subject: params.subject,
      ...(params.text && { text: params.text }),
      ...(params.html && { html: params.html })
    };

    console.log(`[EMAIL] Sending email to ${params.to} with subject: "${params.subject}"`);
    
    // Add timeout to prevent hanging email operations
    const emailPromise = mailService.send(emailData as any);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Email send timeout after 15 seconds')), 15000)
    );

    const result = await Promise.race([emailPromise, timeoutPromise]);
    
    // Log success with more details
    console.log(`[EMAIL] ✅ Successfully sent to ${params.to} - Subject: "${params.subject}" - From: ${params.from}`);
    return createCommunicationResult('email', true, `Email sent successfully to ${params.to}`, {
      metadata: { emailId: Array.isArray(result) && result[0]?.headers?.['x-message-id'] }
    });
  } catch (error) {
    const err = error as SendGridError;
    // Enhanced error logging with SendGrid response details
    const errorMsg = err.message || 'Unknown error';
    const statusCode = err.code || err.response?.status || 'N/A';
    const responseBody = err.response?.body || null;
    
    console.error(`[EMAIL] ❌ Failed to send to ${params.to}`);
    console.error(`[EMAIL] Error: ${errorMsg}`);
    console.error(`[EMAIL] Status Code: ${statusCode}`);
    
    if (responseBody) {
      // Sanitize SendGrid error response to prevent sensitive data exposure
      const sanitizedResponse = sanitizeSendGridError(responseBody);
      console.error(`[EMAIL] SendGrid Response: ${JSON.stringify(sanitizedResponse, null, 2)}`);
    }
    
    // Log common SendGrid issues for debugging
    if (statusCode === 401) {
      console.error(`[EMAIL] 🔑 Authentication failed - check SENDGRID_API_KEY`);
    } else if (statusCode === 403) {
      console.error(`[EMAIL] 🚫 Forbidden - sender email may not be verified in SendGrid`);
    } else if (statusCode === 400) {
      console.error(`[EMAIL] 📝 Bad request - check email format and content`);
    }
    
    // Create standardized error response
    const errorType = categorizeError(String(statusCode), errorMsg);
    return createCommunicationResult('email', false, `Failed to send email: ${errorMsg}`, {
      errorCode: String(statusCode),
      errorType,
      retryable: errorType === 'service_unavailable' || errorType === 'network' || errorType === 'unknown',
      metadata: { statusCode: statusCode !== 'N/A' ? Number(statusCode) : undefined }
    });
  }
}

// Backward compatibility wrapper for sendEmail - returns boolean
export async function sendEmail(params: EmailParams): Promise<boolean> {
  const result = await sendEmailV2(params);
  return result.success;
}

// Email templates for garage notifications
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
  private static FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "noreply@ronakmotorgarage.com"; // Use env var or fallback to default

  // Non-blocking email helper for appointment operations
  static async sendAppointmentConfirmationAsync(to: string, data: AppointmentEmailData): Promise<void> {
    // Send email asynchronously without blocking appointment creation
    setImmediate(async () => {
      try {
        await this.sendAppointmentConfirmation(to, data);
      } catch (error) {
        const err = error as Error;
        console.error(`[EMAIL] Async appointment confirmation failed for ${to}:`, err.message);
      }
    });
  }

  // Appointment confirmation email
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

  // Appointment status update email
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

  // Appointment reminder email (24 hours before)
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

  // Auction bid notification
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
}