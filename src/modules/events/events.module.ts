import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { MongooseModule } from '@nestjs/mongoose';
import {
  SeatLayout,
  SeatLayoutSchema,
} from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/SeatLayout.schema';
import {
  OpenBookingLayout,
  OpenBookingLayoutSchema,
} from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/Open-seat-booking.schema';
import {
  Seat,
  SeatSchema,
} from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/seat.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SeatLayout.name, schema: SeatLayoutSchema },
      { name: OpenBookingLayout.name, schema: OpenBookingLayoutSchema },
      { name: Seat.name, schema: SeatSchema },
    ]),
  ],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
