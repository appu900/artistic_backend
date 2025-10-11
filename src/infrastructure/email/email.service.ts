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
    await this.emailQueue.add('sendMail', { template, to, subject, context });
    this.logger.log(`📬 Queued email to ${to}`);
  }
}
