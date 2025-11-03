import { Module, forwardRef } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { MongooseModule } from '@nestjs/mongoose';
import { S3Module } from 'src/infrastructure/s3/s3.module';
import { RedisModule } from 'src/infrastructure/redis/redis.module';
import { PaymentModule } from 'src/payment/payment.module';
import { EmailModule } from 'src/infrastructure/email/email.module';
import { User, UserSchema } from 'src/infrastructure/database/schemas';
import {
  Event,
  EventSchema,
} from 'src/infrastructure/database/schemas/event.schema';
// Removed unified EventTicketBooking schema in favor of separate seat/table/booth booking schemas
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
import { SeatBooking, SeatBookingSchema } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/SeatBooking.schema';
import { TableBooking, TableBookingSchema } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/booth-and-table/table-book-schema';
import { BoothBooking, BoothBookingSchema } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/booth-and-table/booth-booking.schema';
import {
  ArtistBooking,
  ArtistBookingSchema,
} from 'src/infrastructure/database/schemas/artist-booking.schema';
import {
  EquipmentBooking,
  EquipmentBookingSchema,
} from 'src/infrastructure/database/schemas/Equipment-booking.schema';
import {
  ArtistUnavailable,
  ArtistUnavailableSchema,
} from 'src/infrastructure/database/schemas/Artist-Unavailable.schema';
import {
  PendingEventData,
  PendingEventDataSchema,
} from 'src/infrastructure/database/schemas/pending-event-data.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Event.name, schema: EventSchema },
      { name: ArtistProfile.name, schema: ArtistProfileSchema },
      { name: Equipment.name, schema: EquipmentSchema },
      { name: SeatLayout.name, schema: SeatLayoutSchema },
      { name: OpenBookingLayout.name, schema: OpenBookingLayoutSchema },
      { name: Seat.name, schema: SeatSchema },
      { name: Table.name, schema: TableSchema },
      { name: Booth.name, schema: BoothSchema },
      { name: SeatBooking.name, schema: SeatBookingSchema },
      { name: TableBooking.name, schema: TableBookingSchema },
      { name: BoothBooking.name, schema: BoothBookingSchema },
      { name: ArtistBooking.name, schema: ArtistBookingSchema },
      { name: EquipmentBooking.name, schema: EquipmentBookingSchema },
      { name: ArtistUnavailable.name, schema: ArtistUnavailableSchema },
      { name: PendingEventData.name, schema: PendingEventDataSchema },
    ]),
    S3Module,
    RedisModule,
  forwardRef(() => PaymentModule),
    EmailModule,
  ],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
