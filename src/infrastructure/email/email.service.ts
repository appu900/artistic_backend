import { Injectable, Inject, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import * as fs from 'fs';
import * as path from 'path';
import * as Handlebars from 'handlebars';
import { EmailTemplate } from 'src/common/enums/mail-templates.enum';
import { EmailTemplateResolver } from './templates/emai-templates-resolver';

@Injectable()
export class EmailService {
  sendMailDirect(template: any, to: any, subject: any, context: any) {
      throw new Error('Method not implemented.');
  }
  private readonly transporter: nodemailer.Transporter;
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly configService: ConfigService,
    @Inject('EMAIL_QUEUE') private readonly emailQueue: Queue,
  ) {
    this.transporter = nodemailer.createTransport({
      host: configService.get<string>('MAIL_HOST'),
      port: configService.get<number>('MAIL_PORT'),
      auth: {
        user: configService.get<string>('MAIL_USER'),
        pass: configService.get<string>('MAIL_PASS'),
      },
    });
  }

async sendMail(
  template: EmailTemplate,
  to: string,
  subject: string,
  context: Record<string, any>,
) {
  try {
    // 🔥 No file reads — template resolved from code
    const html = EmailTemplateResolver.resolve(template, context);

    const mailOptions = {
      from: this.configService.get<string>('MAIL_FROM'),
      to,
      subject,
      html,
    };

    // 🚀 Send mail using pre-pooled transporter
    const info = await this.transporter.sendMail(mailOptions);

    this.logger.log(`✅ Email sent to ${to} (${template}) | MessageID: ${info.messageId}`);
    return info;
  } catch (error) {
    this.logger.error(`❌ Failed to send email (${template}) → ${error.message}`);
    throw error;
  }
}

  // enqueue mail job
  async queueMail(template: string, to: string, subject: string, context: any) {
    try {
      await this.emailQueue.add('sendMail', { template, to, subject, context });
      this.logger.log(`📬 Queued email to ${to}`);
    } catch (error) {
      this.logger.error(`❌ Failed to queue email: ${error.message}`);
      // Rethrow to allow fallback mechanism in calling code
      throw error;
    }
  }

  async sendPasswordChangeOtp(to: string, otp: string, firstName: string) {
    const subject = 'Password Change OTP - Artistic Platform';
    const context = {
      firstName,
      otp,
      validMinutes: '10',
    };

    try {
      await this.sendMail(EmailTemplate.PASSWORD_CHANGE_OTP, to, subject, context);
    } catch (error) {
      this.logger.error(`Failed to send password change OTP to ${to}: ${error.message}`);
      throw error;
    }
  }

  async sendPasswordChangeConfirmation(to: string, firstName: string) {
    const subject = 'Password Changed Successfully - Artistic Platform';
    const context = {
      firstName,
    };

    try {
      await this.sendMail(EmailTemplate.PASSWORD_CHANGE_CONFIRMATION, to, subject, context);
    } catch (error) {
      this.logger.error(`Failed to send password change confirmation to ${to}: ${error.message}`);
      throw error;
    }
  }

  async sendVenueProviderOnboardEmail(
    to: string,
    firstName: string,
    lastName: string,
    password: string,
    category?: string,
    address?: string
  ) {
    const subject = 'Welcome to Artistic Platform - Venue Provider Account Created';
    const context = {
      firstName,
      fullName: `${firstName} ${lastName}`,
      email: to,
      password,
      category,
      address,
      loginUrl: process.env.FRONTEND_URL 
        ? `${process.env.FRONTEND_URL}/auth/signin`
        : 'https://artistic.global/auth/signin',
    };

    try {
      await this.sendMail(EmailTemplate.VENUE_PROVIDER_ONBOARD, to, subject, context);
      this.logger.log(`✅ Venue provider onboard email sent to ${to}`);
    } catch (error) {
      this.logger.error(`Failed to send venue provider onboard email to ${to}: ${error.message}`);
      throw error;
    }
  }

  // 🎭 Booking Confirmation Email Methods

  async sendArtistBookingConfirmation(artistEmail: string, bookingData: any) {
    const subject = 'New Booking Confirmed! 🎭 - Artistic Platform';
    const context = {
      artistName: bookingData.artistName,
      bookingId: bookingData.bookingId,
      eventType: bookingData.eventType || 'Performance',
      eventDate: bookingData.eventDate,
      startTime: bookingData.startTime,
      endTime: bookingData.endTime,
      duration: bookingData.duration,
      artistFee: bookingData.artistFee,
      venueAddress: bookingData.venueAddress,
      customerName: bookingData.customerName,
      customerEmail: bookingData.customerEmail,
      customerPhone: bookingData.customerPhone,
      eventDescription: bookingData.eventDescription,
      dashboardUrl: process.env.FRONTEND_URL 
        ? `${process.env.FRONTEND_URL}/artist/dashboard`
        : 'https://artistic.global/artist/dashboard',
    };

    try {
      await this.sendMail(EmailTemplate.ARTIST_BOOKING_CONFIRMATION, artistEmail, subject, context);
      this.logger.log(`✅ Artist booking confirmation sent to ${artistEmail} for booking ${bookingData.bookingId}`);
    } catch (error) {
      this.logger.error(`Failed to send artist booking confirmation to ${artistEmail}: ${error.message}`);
      throw error;
    }
  }

  async sendEquipmentProviderNotification(providerEmail: string, bookingData: any) {
    const subject = 'Equipment Booking Confirmed! 🎬 - Artistic Platform';
    const context = {
      providerName: bookingData.providerName,
      bookingId: bookingData.bookingId,
      equipmentName: bookingData.equipmentName,
      startDate: bookingData.startDate,
      endDate: bookingData.endDate,
      startTime: bookingData.startTime,
      endTime: bookingData.endTime,
      duration: bookingData.duration,
      equipmentFee: bookingData.equipmentFee,
      venueAddress: bookingData.venueAddress,
      customerName: bookingData.customerName,
      customerEmail: bookingData.customerEmail,
      customerPhone: bookingData.customerPhone,
      eventDescription: bookingData.eventDescription,
      equipmentItems: bookingData.equipmentItems,
      dashboardUrl: process.env.FRONTEND_URL 
        ? `${process.env.FRONTEND_URL}/equipment-provider/dashboard`
        : 'https://artistic.global/equipment-provider/dashboard',
    };

    try {
      await this.sendMail(EmailTemplate.EQUIPMENT_PROVIDER_NOTIFICATION, providerEmail, subject, context);
      this.logger.log(`✅ Equipment provider notification sent to ${providerEmail} for booking ${bookingData.bookingId}`);
    } catch (error) {
      this.logger.error(`Failed to send equipment provider notification to ${providerEmail}: ${error.message}`);
      throw error;
    }
  }

  async sendCustomerBookingReceipt(customerEmail: string, bookingData: any) {
    const subject = 'Booking Receipt & Confirmation 🧾 - Artistic Platform';
    const context = {
      customerName: bookingData.customerName,
      bookingId: bookingData.bookingId,
      bookingType: bookingData.bookingType,
      eventDate: bookingData.eventDate,
      startTime: bookingData.startTime,
      endTime: bookingData.endTime,
      venueAddress: bookingData.venueAddress,
      artistName: bookingData.artistName,
      artistType: bookingData.artistType,
      artistFee: bookingData.artistFee,
      equipmentDetails: bookingData.equipmentDetails,
      equipmentFee: bookingData.equipmentFee,
      totalAmount: bookingData.totalAmount,
      transactionId: bookingData.transactionId,
      paymentMethod: bookingData.paymentMethod,
      paymentDate: bookingData.paymentDate,
      eventDescription: bookingData.eventDescription,
      bookingUrl: bookingData.bookingUrl || (process.env.FRONTEND_URL 
        ? `${process.env.FRONTEND_URL}/dashboard/bookings`
        : 'https://artistic.global/dashboard/bookings'),
    };

    try {
      await this.sendMail(EmailTemplate.CUSTOMER_BOOKING_RECEIPT, customerEmail, subject, context);
      this.logger.log(`✅ Customer booking receipt sent to ${customerEmail} for booking ${bookingData.bookingId}`);
    } catch (error) {
      this.logger.error(`Failed to send customer booking receipt to ${customerEmail}: ${error.message}`);
      throw error;
    }
  }
}
