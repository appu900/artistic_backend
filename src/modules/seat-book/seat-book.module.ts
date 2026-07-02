import { Module } from '@nestjs/common';
import { SeatBookController } from './seat-book.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Seat, SeatSchema } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/seat.schema';
import { RedisModule } from 'src/infrastructure/redis/redis.module';
import { seatBookingService } from './seat-book.service';
import { SeatBooking, SeatBookingSchema } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/SeatBooking.schema';
import { PaymentModule } from 'src/payment/payment.module';
import { BullMqModule } from 'src/infrastructure/redis/queue/bullmq.module';
import { Table, TableSchema } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/table.schema';
import { TableBooking, TableBookingSchema } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/booth-and-table/table-book-schema';
import { TableBookSearvice } from './table-book.service';
import { BoothBookService } from './booth-book.service';
import { Booth, BoothSchema } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/Booth.schema';
import { BoothBooking, BoothBookingSchema } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/booth-and-table/booth-booking.schema';
import { Event, EventSchema } from 'src/infrastructure/database/schemas/event.schema';
import { EventBookingGuardService } from './event-booking-guard.service';
import { BookingIdempotencyService } from './booking-idempotency.service';

@Module({
  imports:[
    MongooseModule.forFeature([
      {name:Seat.name,schema:SeatSchema},
      {name:SeatBooking.name,schema:SeatBookingSchema},
      {name:Table.name,schema:TableSchema},
      {name:TableBooking.name,schema:TableBookingSchema},
      {name:Booth.name,schema:BoothSchema},
      {name:BoothBooking.name,schema:BoothBookingSchema},
      {name:Event.name,schema:EventSchema},
    ]),
    RedisModule,
    PaymentModule,
    BullMqModule
  ],
  controllers: [SeatBookController],
  providers: [
    seatBookingService,
    TableBookSearvice,
    BoothBookService,
    EventBookingGuardService,
    BookingIdempotencyService,
  ],
  exports:[seatBookingService,TableBookSearvice,BoothBookService]
})
export class SeatBookModule {}
