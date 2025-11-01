import { Module } from '@nestjs/common';
import { SeatBookController } from './seat-book.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Seat, SeatSchema } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/seat.schema';
import { RedisModule } from 'src/infrastructure/redis/redis.module';
import { seatBookingService } from './seat-book.service';
import { SeatBooking, SeatBookingSchema } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/SeatBooking.schema';
import { PaymentService } from 'src/payment/payment.service';
import { PaymentModule } from 'src/payment/payment.module';
import { BullMqModule } from 'src/infrastructure/redis/queue/bullmq.module';

@Module({
  imports:[
    MongooseModule.forFeature([
      {name:Seat.name,schema:SeatSchema},
      {name:SeatBooking.name,schema:SeatBookingSchema}
    ]),
    RedisModule,
    PaymentModule,
    BullMqModule

  ],
  
  controllers: [SeatBookController],
  providers: [seatBookingService],
  exports:[seatBookingService]
})
export class SeatBookModule {}
