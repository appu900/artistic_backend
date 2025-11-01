import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  SeatBooking,
  SeatBookingDocument,
} from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/SeatBooking.schema';
import {
  Seat,
  SeatDocument,
} from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/seat.schema';
import { SeatBookModule } from 'src/modules/seat-book/seat-book.module';
import { RedisService } from '../redis.service';

@Processor('booking-expiry-queue', {
  connection: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379'),
    username: process.env.REDIS_USERNAME,
    password: process.env.REDIS_PASSWORD,
  },
  prefix: 'bull',
})
@Injectable()
export class BookingExpiryQueue extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(BookingExpiryQueue.name);
  constructor(
    @InjectModel(SeatBooking.name)
    private readonly seatBookingModel: Model<SeatBookingDocument>,
    @InjectModel(Seat.name) private readonly seatModel: Model<SeatDocument>,
    private readonly redisService: RedisService,
  ) {
    super();
  }

  onModuleInit() {
    this.logger.log(
      '🚀 BookingExpiryQueue worker initialized and listening for jobs...',
    );
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`✅ Job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`❌ Job ${job.id} failed:`, error);
  }

  @OnWorkerEvent('ready')
  onReady() {
    this.logger.log('🚀 Worker is READY and listening for jobs!');
  }

  @OnWorkerEvent('error')
  onError(error: Error) {
    this.logger.error('❌ Worker error:', error);
  }

  async process(job: Job<{ bookingId: string }>): Promise<void> {
    const { bookingId } = job.data;
    this.logger.warn(`Expiry job triggered for booking ${bookingId}`);
    const booking = await this.seatBookingModel.findById(bookingId);
    if (!booking) {
      this.logger.warn(`Booking ${bookingId} not found — skipping`);
      return;
    }
    if (booking.status !== 'pending') {
      this.logger.log(`Booking ${bookingId} already ${booking.status}`);
      return;
    }

    // ** mark booking as expired
    booking.status = 'expired';
    booking.paymentStatus = 'cancelled';
    booking.cancelledAt = new Date();
    await booking.save();

    // relese all the seats
    await this.seatModel.updateMany(
      { _id: { $in: booking.seatIds } },
      { $set: { bookingStatus: 'available', userId: null } },
    );

    for (const id of booking.seatIds) {
      await this.redisService.del(`seat_lock:${id.toString()}`);
    }

    this.logger.log(`✅ Booking ${bookingId} expired and seats released`);
  }
}
