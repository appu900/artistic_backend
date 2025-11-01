import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { BookingStatus } from 'src/modules/booking/dto/booking.dto';
import { BookingStatusQueue } from './payment-status-queue';
import { BookingExpiryQueue } from './booking-expiry-queue';
import { MongooseModule } from '@nestjs/mongoose';
import {
  SeatBooking,
  SeatBookingSchema,
} from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/SeatBooking.schema';
import {
  Seat,
  SeatSchema,
} from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/seat.schema';

export const QUEUE_TOKENS = {
  EMAIL: 'EMAIL_QUEUE',
  OTP: 'OTP_QUEUE',
  NOTIFICATION: 'NOTIFICATION_QUEUE',
  BOOKING_EXPIRY: 'BOOKING_EXPIRY_QUEUE',
};

@Global()
@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: SeatBooking.name, schema: SeatBookingSchema },
      { name: Seat.name, schema: SeatSchema },
    ]),
  ],
  providers: [
    // ✅ Email queue
    {
      provide: QUEUE_TOKENS.EMAIL,
      useFactory: (config: ConfigService) =>
        new Queue('email-queue', {
          connection: {
            host: config.get<string>('REDIS_HOST'),
            port: config.get<number>('REDIS_PORT'),
            username: config.get<string>('REDIS_USERNAME'),
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
            username: config.get<string>('REDIS_USERNAME'),
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
            username: config.get<string>('REDIS_USERNAME'),
            password: config.get<string>('REDIS_PASSWORD') || undefined,
          },
        }),
      inject: [ConfigService],
    },

    {
      provide: QUEUE_TOKENS.BOOKING_EXPIRY,
      useFactory: (config: ConfigService) =>
        new Queue('booking-expiry-queue', {
          prefix: 'bull',
          connection: {
            host: config.get('REDIS_HOST'),
            port: config.get('REDIS_PORT'),
            username: config.get('REDIS_USERNAME'),
            password: config.get('REDIS_PASSWORD') || undefined,
          },
        }),
      inject: [ConfigService],
    },

    BookingStatusQueue,
    BookingExpiryQueue,
  ],
  exports: [
    QUEUE_TOKENS.EMAIL,
    QUEUE_TOKENS.OTP,
    QUEUE_TOKENS.NOTIFICATION,
      QUEUE_TOKENS.BOOKING_EXPIRY,
    BookingStatusQueue,
    BookingExpiryQueue,
  ],
})
export class BullMqModule {}
