import { Module } from '@nestjs/common';
import { SeatBookController } from './seat-book.controller';
import { SeatBookService } from './seat-book.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Seat, SeatSchema } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/seat.schema';
import { TicketBooking, TicketBookingSchema } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/Ticket_booking';
import { RedisModule } from 'src/infrastructure/redis/redis.module';

@Module({
  imports:[
    MongooseModule.forFeature([
      {name:Seat.name,schema:SeatSchema},
      {name:TicketBooking.name,schema:TicketBookingSchema}
    ]),
    RedisModule,
  ],
  
  controllers: [SeatBookController],
  providers: [SeatBookService]
})
export class SeatBookModule {}
