import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { RedisService } from '../redis.service';
import { BookingType } from 'src/modules/booking/interfaces/bookingType';
import { UpdatePaymentStatus } from 'src/common/enums/Booking.updateStatus';

@Injectable()
export class BookingStatusQueue {
  private queue:Queue;
  constructor(private readonly redisService:RedisService){
    this.queue = new Queue('BOOKING_STATUS',{
      connection:this.redisService.getClient(),
      defaultJobOptions:{
        removeOnComplete:1,
        removeOnFail:5,
        attempts:3
      }
    })
  }

  async enqueueBookingUpdate(bookingId:string,userId:string,type:BookingType,status:UpdatePaymentStatus){
     const job = await this.queue.add('BOOKING_STATUS',{
      bookingId,
      userId,
      type,
      status
     })
     console.log(`Enqueeued job ${job.id} for booking ${bookingId}`)
     return job;
  }
}
