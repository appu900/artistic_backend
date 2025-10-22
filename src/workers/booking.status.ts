import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { RedisService } from 'src/infrastructure/redis/redis.service';
import { BookingService } from 'src/modules/booking/booking.service';



@Injectable()
export class BookingStatusWorker implements OnModuleInit {
  private readonly logger = new Logger(BookingStatusWorker.name);
  constructor(
    private readonly redisService: RedisService,
    private readonly bookingService: BookingService,
  ) {}
  onModuleInit() {
    const worker = new Worker('booking-status-update', async (job) => {
      const { bookingId, status, type } = job.data;
      this.logger.log(
        `Processing job ${job.id} for booking ${bookingId} | ${status} | ${type}`,
      );
      try {
        await this.bookingService.updateBookingStatus(bookingId, type, status);
        this.logger.log(
          `Successfully updated booking ${bookingId} to status ${status}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to update booking ${bookingId} to status ${status}: ${error.message}`,
        );
        throw error;
      }
    },{
        connection: this.redisService.getClient(),
        concurrency: 5,
    });
     worker.on('completed', (job) => {
      this.logger.log(`Job #${job.id} completed successfully.`);
    });

    worker.on('failed', (job, err) => {
      const jobId = job?.id ?? 'unknown';
      const errMessage = (err && (err as Error).message) ?? String(err);
      this.logger.error(`Job #${jobId} failed with error: ${errMessage}`);
    });

    this.logger.log('📦 BookingStatusWorker initialized and listening...');
    
  }
}
