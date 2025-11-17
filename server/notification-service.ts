import { getStorage } from './storage';
import { WhatsAppService } from './whatsapp-service';
import { EmailNotificationService, sendEmail, type AppointmentEmailData } from './email-service';
import { 
  createCommunicationResult, 
  type CommunicationResult 
} from '@shared/communication-types';
import type { 
  AppointmentConfirmationData, 
  StatusUpdateData 
} from './whatsapp-service';

interface UserContactInfo {
  email: string | null;
  phone: string | null;
  countryCode: string | null;
  preferredChannel: 'whatsapp' | 'email';
  name: string;
}

interface NotificationAppointmentData {
  customerName: string;
  serviceName: string;
  dateTime: string;
  location: string;
  carDetails: string;
  bookingId: string;
  mechanicName?: string;
  price?: number;
}

interface NotificationStatusData {
  customerName: string;
  bookingId: string;
  status: string;
  serviceName: string;
  dateTime: string;
  carDetails: string;
  mechanicName?: string;
  additionalInfo?: string;
}

interface NotificationResult {
  success: boolean;
  message: string;
  channelUsed?: 'whatsapp' | 'email';
  fallbackUsed?: 'whatsapp' | 'email';
  errorCode?: string;
  errorType?: 'validation' | 'authentication' | 'rate_limit' | 'service_unavailable' | 'policy_violation' | 'network' | 'unknown';
  retryable?: boolean;
  service: 'whatsapp' | 'email';
  metadata?: CommunicationResult['metadata'];
}

class NotificationServiceClass {
  

  private async getUserContactInfo(userId: string): Promise<UserContactInfo | null> {
    try {
      const storage = await getStorage();
      const user = await storage.getUser(userId);
      
      if (!user) {
        console.error(`[NOTIFICATION] User not found: ${userId}`);
        return null;
      }

      return {
        email: user.email,
        phone: user.phone,
        countryCode: user.countryCode || '+91',
        preferredChannel: (user.preferredNotificationChannel as 'whatsapp' | 'email') || 'whatsapp',
        name: user.name
      };
    } catch (error) {
      console.error(`[NOTIFICATION] Error fetching user contact info:`, error);
      return null;
    }
  }

  

  private validateContactInfo(userInfo: UserContactInfo, channel: 'whatsapp' | 'email'): boolean {
    if (channel === 'whatsapp') {
      return !!(userInfo.phone && userInfo.countryCode);
    } else {
      return !!userInfo.email;
    }
  }

  

  async sendAppointmentConfirmation(
    userId: string, 
    appointmentData: NotificationAppointmentData
  ): Promise<NotificationResult> {
    
    const userInfo = await this.getUserContactInfo(userId);
    
    if (!userInfo) {
      return createCommunicationResult('email', false, 'User not found', {
        errorType: 'validation'
      }) as NotificationResult;
    }

    const preferredChannel = userInfo.preferredChannel;
    const alternateChannel = preferredChannel === 'whatsapp' ? 'email' : 'whatsapp';

    const preferredResult = await this.sendAppointmentViaChannel(
      userInfo, 
      appointmentData, 
      preferredChannel
    );

    if (preferredResult.success) {
      return {
        ...preferredResult,
        channelUsed: preferredChannel,
        fallbackUsed: undefined
      };
    }

    console.warn(`[NOTIFICATION] ⚠️ Preferred channel ${preferredChannel} failed, trying ${alternateChannel}`);

    const fallbackResult = await this.sendAppointmentViaChannel(
      userInfo, 
      appointmentData, 
      alternateChannel
    );

    if (fallbackResult.success) {
      return {
        ...fallbackResult,
        channelUsed: alternateChannel,
        fallbackUsed: preferredChannel,
        metadata: {
          ...fallbackResult.metadata,
          originalError: preferredResult.message
        }
      };
    }

    console.error(`[NOTIFICATION] ❌ Both channels failed for appointment confirmation`);
    return {
      ...fallbackResult,
      message: `Failed to send via both ${preferredChannel} and ${alternateChannel}`,
      metadata: {
        ...fallbackResult.metadata,
        originalError: preferredResult.message
      }
    };
  }

  

  private async sendAppointmentViaChannel(
    userInfo: UserContactInfo,
    appointmentData: NotificationAppointmentData,
    channel: 'whatsapp' | 'email'
  ): Promise<CommunicationResult> {
    if (!this.validateContactInfo(userInfo, channel)) {
      console.warn(`[NOTIFICATION] User missing contact info for ${channel}`);
      return createCommunicationResult(
        channel, 
        false, 
        `User missing ${channel === 'whatsapp' ? 'phone number' : 'email address'}`,
        { errorType: 'validation' }
      );
    }

    if (channel === 'whatsapp' && userInfo.phone && userInfo.countryCode) {
      const whatsappData: AppointmentConfirmationData = {
        ...appointmentData,
        customerName: userInfo.name
      };

      return await WhatsAppService.sendAppointmentConfirmation(
        userInfo.phone,
        userInfo.countryCode,
        whatsappData
      );
    } else if (channel === 'email' && userInfo.email) {
      const emailData: AppointmentEmailData = {
        customerName: userInfo.name,
        serviceName: appointmentData.serviceName,
        dateTime: appointmentData.dateTime,
        location: appointmentData.location,
        carDetails: appointmentData.carDetails,
        mechanicName: appointmentData.mechanicName,
        price: appointmentData.price
      };

      const success = await EmailNotificationService.sendAppointmentConfirmation(
        userInfo.email,
        emailData
      );

      return createCommunicationResult(
        'email',
        success,
        success ? 'Email sent successfully' : 'Email send failed'
      );
    }

    return createCommunicationResult(
      channel,
      false,
      'Invalid channel or missing contact info',
      { errorType: 'validation' }
    );
  }

  

  async sendStatusUpdate(
    userId: string,
    statusData: NotificationStatusData
  ): Promise<NotificationResult> {
    
    const userInfo = await this.getUserContactInfo(userId);
    
    if (!userInfo) {
      return createCommunicationResult('email', false, 'User not found', {
        errorType: 'validation'
      }) as NotificationResult;
    }

    const preferredChannel = userInfo.preferredChannel;
    const alternateChannel = preferredChannel === 'whatsapp' ? 'email' : 'whatsapp';

    const preferredResult = await this.sendStatusViaChannel(
      userInfo,
      statusData,
      preferredChannel
    );

    if (preferredResult.success) {
      return {
        ...preferredResult,
        channelUsed: preferredChannel,
        fallbackUsed: undefined
      };
    }

    console.warn(`[NOTIFICATION] ⚠️ Preferred channel ${preferredChannel} failed, trying ${alternateChannel}`);

    const fallbackResult = await this.sendStatusViaChannel(
      userInfo,
      statusData,
      alternateChannel
    );

    if (fallbackResult.success) {
      return {
        ...fallbackResult,
        channelUsed: alternateChannel,
        fallbackUsed: preferredChannel,
        metadata: {
          ...fallbackResult.metadata,
          originalError: preferredResult.message
        }
      };
    }

    console.error(`[NOTIFICATION] ❌ Both channels failed for status update`);
    return {
      ...fallbackResult,
      message: `Failed to send via both ${preferredChannel} and ${alternateChannel}`,
      metadata: {
        ...fallbackResult.metadata,
        originalError: preferredResult.message
      }
    };
  }

  

  private async sendStatusViaChannel(
    userInfo: UserContactInfo,
    statusData: NotificationStatusData,
    channel: 'whatsapp' | 'email'
  ): Promise<CommunicationResult> {
    if (!this.validateContactInfo(userInfo, channel)) {
      console.warn(`[NOTIFICATION] User missing contact info for ${channel}`);
      return createCommunicationResult(
        channel,
        false,
        `User missing ${channel === 'whatsapp' ? 'phone number' : 'email address'}`,
        { errorType: 'validation' }
      );
    }

    if (channel === 'whatsapp' && userInfo.phone && userInfo.countryCode) {
      const whatsappData: StatusUpdateData = {
        customerName: userInfo.name,
        bookingId: statusData.bookingId,
        status: statusData.status,
        serviceName: statusData.serviceName,
        additionalInfo: statusData.additionalInfo
      };

      return await WhatsAppService.sendStatusUpdate(
        userInfo.phone,
        userInfo.countryCode,
        whatsappData
      );
    } else if (channel === 'email' && userInfo.email) {
      const emailData: AppointmentEmailData & { status: string } = {
        customerName: userInfo.name,
        serviceName: statusData.serviceName,
        dateTime: statusData.dateTime,
        location: '',
        carDetails: statusData.carDetails,
        mechanicName: statusData.mechanicName,
        status: statusData.status
      };

      const success = await EmailNotificationService.sendAppointmentStatusUpdate(
        userInfo.email,
        emailData
      );

      return createCommunicationResult(
        'email',
        success,
        success ? 'Email sent successfully' : 'Email send failed'
      );
    }

    return createCommunicationResult(
      channel,
      false,
      'Invalid channel or missing contact info',
      { errorType: 'validation' }
    );
  }

  

  async sendPromotionalMessage(
    userId: string,
    message: string,
    subject?: string
  ): Promise<NotificationResult> {
    
    const userInfo = await this.getUserContactInfo(userId);
    
    if (!userInfo) {
      return createCommunicationResult('email', false, 'User not found', {
        errorType: 'validation'
      }) as NotificationResult;
    }

    const preferredChannel = userInfo.preferredChannel;
    const alternateChannel = preferredChannel === 'whatsapp' ? 'email' : 'whatsapp';

    let preferredResult: CommunicationResult;

    if (preferredChannel === 'whatsapp' && userInfo.phone && userInfo.countryCode) {
      const whatsappNumber = `whatsapp:+${userInfo.countryCode.replace('+', '')}${userInfo.phone}`;
      preferredResult = await WhatsAppService.sendMessage(
        whatsappNumber,
        message,
        'welcome_message' as any,
        undefined
      );
    } else if (preferredChannel === 'email' && userInfo.email) {
      const success = await sendEmail({
        to: userInfo.email,
        from: process.env.SENDGRID_FROM_EMAIL || 'noreply@ronakmotorgarage.com',
        subject: subject || 'Special Offer from Ronak Motor Garage',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2c3e50;">${subject || 'Special Offer'}</h2>
            <p>Hello ${userInfo.name},</p>
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
              ${message}
            </div>
            <p style="margin-top: 30px;">
              Best regards,<br>
              <strong>Ronak Motor Garage Team</strong>
            </p>
          </div>
        `,
        text: message
      });

      preferredResult = createCommunicationResult(
        'email',
        success,
        success ? 'Promotional email sent' : 'Promotional email failed'
      );
    } else {
      preferredResult = createCommunicationResult(
        preferredChannel,
        false,
        `Missing ${preferredChannel === 'whatsapp' ? 'phone number' : 'email'}`,
        { errorType: 'validation' }
      );
    }

    if (preferredResult.success) {
      return {
        ...preferredResult,
        channelUsed: preferredChannel,
        fallbackUsed: undefined
      };
    }

    console.warn(`[NOTIFICATION] ⚠️ Preferred channel ${preferredChannel} failed, trying ${alternateChannel}`);

    let fallbackResult: CommunicationResult;

    if (alternateChannel === 'whatsapp' && userInfo.phone && userInfo.countryCode) {
      const whatsappNumber = `whatsapp:+${userInfo.countryCode.replace('+', '')}${userInfo.phone}`;
      fallbackResult = await WhatsAppService.sendMessage(
        whatsappNumber,
        message,
        'welcome_message' as any,
        undefined
      );
    } else if (alternateChannel === 'email' && userInfo.email) {
      const success = await sendEmail({
        to: userInfo.email,
        from: process.env.SENDGRID_FROM_EMAIL || 'noreply@ronakmotorgarage.com',
        subject: subject || 'Special Offer from Ronak Motor Garage',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2c3e50;">${subject || 'Special Offer'}</h2>
            <p>Hello ${userInfo.name},</p>
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
              ${message}
            </div>
            <p style="margin-top: 30px;">
              Best regards,<br>
              <strong>Ronak Motor Garage Team</strong>
            </p>
          </div>
        `,
        text: message
      });

      fallbackResult = createCommunicationResult(
        'email',
        success,
        success ? 'Promotional email sent' : 'Promotional email failed'
      );
    } else {
      fallbackResult = createCommunicationResult(
        alternateChannel,
        false,
        `Missing ${alternateChannel === 'whatsapp' ? 'phone number' : 'email'}`,
        { errorType: 'validation' }
      );
    }

    if (fallbackResult.success) {
      return {
        ...fallbackResult,
        channelUsed: alternateChannel,
        fallbackUsed: preferredChannel,
        metadata: {
          ...fallbackResult.metadata,
          originalError: preferredResult.message
        }
      };
    }

    console.error(`[NOTIFICATION] ❌ Both channels failed for promotional message`);
    return {
      ...fallbackResult,
      message: `Failed to send via both ${preferredChannel} and ${alternateChannel}`,
      metadata: {
        ...fallbackResult.metadata,
        originalError: preferredResult.message
      }
    };
  }

  

  async sendBidStatusUpdate(
    userId: string,
    bidData: {
      bidId: string;
      carDetails: string;
      bidAmount: number;
      status: 'accepted' | 'rejected';
    }
  ): Promise<NotificationResult> {
    const userInfo = await this.getUserContactInfo(userId);
    
    if (!userInfo) {
      return createCommunicationResult('email', false, 'User not found', {
        errorType: 'validation'
      }) as NotificationResult;
    }

    const message = bidData.status === 'accepted' 
      ? `Good news! Your bid of ₹${bidData.bidAmount.toLocaleString()} on ${bidData.carDetails} has been accepted. We will contact you soon with next steps.`
      : `Your bid of ₹${bidData.bidAmount.toLocaleString()} on ${bidData.carDetails} was not accepted. Thank you for your interest.`;

    const preferredChannel = userInfo.preferredChannel;
    const alternateChannel = preferredChannel === 'whatsapp' ? 'email' : 'whatsapp';

    
    let result: CommunicationResult;
    if (preferredChannel === 'whatsapp' && userInfo.phone && userInfo.countryCode) {
      result = await WhatsAppService.sendMessage(
        `whatsapp:+${userInfo.countryCode}${userInfo.phone}`,
        message,
        'bid_notification'
      );
    } else if (preferredChannel === 'email' && userInfo.email) {
      const success = await sendEmail({
        to: userInfo.email,
        from: process.env.SENDGRID_FROM_EMAIL || 'noreply@ronakmotorgarage.com',
        subject: `Bid ${bidData.status === 'accepted' ? 'Accepted' : 'Update'} - ${bidData.carDetails}`,
        text: message,
        html: `
          <h2>Bid ${bidData.status === 'accepted' ? 'Accepted' : 'Update'}</h2>
          <p>${message}</p>
          <p><strong>Vehicle:</strong> ${bidData.carDetails}</p>
          <p><strong>Your Bid:</strong> ₹${bidData.bidAmount.toLocaleString()}</p>
          <p><strong>Status:</strong> ${bidData.status}</p>
        `
      });
      result = createCommunicationResult('email', success, success ? 'Email sent successfully' : 'Email send failed');
    } else {
      result = createCommunicationResult(preferredChannel, false, 'Invalid channel or missing contact info', { errorType: 'validation' });
    }

    if (result.success) {
      return {
        ...result,
        channelUsed: preferredChannel,
        fallbackUsed: undefined
      };
    }

    
    console.warn(`[BID_NOTIFICATION] ⚠️ Preferred channel ${preferredChannel} failed, trying ${alternateChannel}`);
    
    if (alternateChannel === 'whatsapp' && userInfo.phone && userInfo.countryCode) {
      result = await WhatsAppService.sendMessage(
        `whatsapp:+${userInfo.countryCode}${userInfo.phone}`,
        message,
        'bid_notification'
      );
    } else if (alternateChannel === 'email' && userInfo.email) {
      const success = await sendEmail({
        to: userInfo.email,
        from: process.env.SENDGRID_FROM_EMAIL || 'noreply@ronakmotorgarage.com',
        subject: `Bid ${bidData.status === 'accepted' ? 'Accepted' : 'Update'} - ${bidData.carDetails}`,
        text: message,
        html: `
          <h2>Bid ${bidData.status === 'accepted' ? 'Accepted' : 'Update'}</h2>
          <p>${message}</p>
        `
      });
      result = createCommunicationResult('email', success, success ? 'Email sent successfully' : 'Email send failed');
    } else {
      return {
        ...result,
        channelUsed: preferredChannel,
        fallbackUsed: alternateChannel as any
      };
    }

    if (result.success) {
      return {
        ...result,
        channelUsed: alternateChannel,
        fallbackUsed: preferredChannel
      };
    }

    return {
      ...result,
      channelUsed: preferredChannel,
      fallbackUsed: alternateChannel
    };
  }
}

export const NotificationService = new NotificationServiceClass();
export type { NotificationAppointmentData, NotificationStatusData, NotificationResult };
