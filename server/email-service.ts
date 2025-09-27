import { MailService } from '@sendgrid/mail';

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

interface EmailParams {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
}

export async function sendEmail(params: EmailParams): Promise<boolean> {
  if (!initializeMailService() || !mailService) {
    console.log("[EMAIL] Service not initialized - skipping email");
    return false;
  }

  // Validate email parameters
  if (!params.to || !params.from || !params.subject) {
    console.error(`[EMAIL] Invalid email parameters - to: ${!!params.to}, from: ${!!params.from}, subject: ${!!params.subject}`);
    return false;
  }

  // Basic email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(params.to)) {
    console.error(`[EMAIL] Invalid recipient email format: ${params.to}`);
    return false;
  }

  if (!emailRegex.test(params.from)) {
    console.error(`[EMAIL] Invalid sender email format: ${params.from}`);
    return false;
  }

  try {
    const emailData: any = {
      to: params.to,
      from: params.from,
      subject: params.subject,
    };

    if (params.text) {
      emailData.text = params.text;
    }
    if (params.html) {
      emailData.html = params.html;
    }

    console.log(`[EMAIL] Sending email to ${params.to} with subject: "${params.subject}"`);
    
    // Add timeout to prevent hanging email operations
    const emailPromise = mailService.send(emailData);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Email send timeout after 15 seconds')), 15000)
    );

    const result = await Promise.race([emailPromise, timeoutPromise]);
    
    // Log success with more details
    console.log(`[EMAIL] ✅ Successfully sent to ${params.to} - Subject: "${params.subject}" - From: ${params.from}`);
    return true;
  } catch (error: any) {
    // Enhanced error logging with SendGrid response details
    const errorMsg = error?.message || 'Unknown error';
    const statusCode = error?.code || error?.response?.status || 'N/A';
    const responseBody = error?.response?.body || null;
    
    console.error(`[EMAIL] ❌ Failed to send to ${params.to}`);
    console.error(`[EMAIL] Error: ${errorMsg}`);
    console.error(`[EMAIL] Status Code: ${statusCode}`);
    
    if (responseBody) {
      // Log SendGrid specific error details (but safely to avoid PII leaks)
      console.error(`[EMAIL] SendGrid Response: ${JSON.stringify(responseBody, null, 2)}`);
    }
    
    // Log common SendGrid issues for debugging
    if (statusCode === 401) {
      console.error(`[EMAIL] 🔑 Authentication failed - check SENDGRID_API_KEY`);
    } else if (statusCode === 403) {
      console.error(`[EMAIL] 🚫 Forbidden - sender email may not be verified in SendGrid`);
    } else if (statusCode === 400) {
      console.error(`[EMAIL] 📝 Bad request - check email format and content`);
    }
    
    return false;
  }
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
      } catch (error: any) {
        console.error(`[EMAIL] Async appointment confirmation failed for ${to}:`, error?.message);
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