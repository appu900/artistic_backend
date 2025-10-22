import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { RedisService } from '../redis.service';




@Injectable()
export class BookingStatusQueue {
  private queue: Queue;
  constructor(private readonly redisService: RedisService) {
    this.queue = new Queue('booking-status-update', {
      connection: this.redisService.getClient(),
    });
  }

   async enqueueBookingUpdate(bookingId: string, type: string, status: string) {
    await this.queue.add('update-booking-status', { bookingId, type, status });
  }
}
