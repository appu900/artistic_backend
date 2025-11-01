import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { MongooseModule } from '@nestjs/mongoose';
import { S3Module } from 'src/infrastructure/s3/s3.module';
import { RedisModule } from 'src/infrastructure/redis/redis.module';
import { PaymentModule } from 'src/payment/payment.module';
import {
  Event,
  EventSchema,
} from 'src/infrastructure/database/schemas/event.schema';
import {
  EventTicketBooking,
  EventTicketBookingSchema,
} from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/EventTicketBooking.schema';
import {
  ArtistProfile,
  ArtistProfileSchema,
} from 'src/infrastructure/database/schemas/artist-profile.schema';
import {
  Equipment,
  EquipmentSchema,
} from 'src/infrastructure/database/schemas/equipment.schema';
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
import {
  Table,
  TableSchema,
} from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/table.schema';
import {
  Booth,
  BoothSchema,
} from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/Booth.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Event.name, schema: EventSchema },
      { name: EventTicketBooking.name, schema: EventTicketBookingSchema },
      { name: ArtistProfile.name, schema: ArtistProfileSchema },
      { name: Equipment.name, schema: EquipmentSchema },
      { name: SeatLayout.name, schema: SeatLayoutSchema },
      { name: OpenBookingLayout.name, schema: OpenBookingLayoutSchema },
      { name: Seat.name, schema: SeatSchema },
      { name: Table.name, schema: TableSchema },
      { name: Booth.name, schema: BoothSchema },
    ]),
    S3Module,
    RedisModule,
    PaymentModule,
  ],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
