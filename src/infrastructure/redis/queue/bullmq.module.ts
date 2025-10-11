import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

export const QUEUE_TOKENS = {
  EMAIL: 'EMAIL_QUEUE',
  OTP: 'OTP_QUEUE',
  NOTIFICATION: 'NOTIFICATION_QUEUE',
};

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    // ✅ Email queue
    {
      provide: QUEUE_TOKENS.EMAIL,
      useFactory: (config: ConfigService) =>
        new Queue('email-queue', {
          connection: {
            host: config.get<string>('REDIS_HOST'),
            port: config.get<number>('REDIS_PORT'),
            password: config.get<string>('REDIS_PASSWORD') || undefined,
          },
        }),
      inject: [ConfigService],
    },

    // ✅ OTP queue (for SMS/WhatsApp OTP sending)
    {
      provide: QUEUE_TOKENS.OTP,
      useFactory: (config: ConfigService) =>
        new Queue('otp-queue', {
          connection: {
            host: config.get<string>('REDIS_HOST'),
            port: config.get<number>('REDIS_PORT'),
            password: config.get<string>('REDIS_PASSWORD') || undefined,
          },
        }),
      inject: [ConfigService],
    },

    // ✅ Notification queue (future use)
    {
      provide: QUEUE_TOKENS.NOTIFICATION,
      useFactory: (config: ConfigService) =>
        new Queue('notification-queue', {
          connection: {
            host: config.get<string>('REDIS_HOST'),
            port: config.get<number>('REDIS_PORT'),
            password: config.get<string>('REDIS_PASSWORD') || undefined,
          },
        }),
      inject: [ConfigService],
    },
  ],
  exports: [
    QUEUE_TOKENS.EMAIL,
    QUEUE_TOKENS.OTP,
    QUEUE_TOKENS.NOTIFICATION,
  ],
})
export class BullMqModule {}
