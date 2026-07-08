import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Event, EventSchema } from 'src/infrastructure/database/schemas/event.schema';
import {
  EventAttendancePortal,
  EventAttendancePortalSchema,
} from 'src/infrastructure/database/schemas/event-attendance-portal.schema';
import { SeatBooking, SeatBookingSchema } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/SeatBooking.schema';
import { TableBooking, TableBookingSchema } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/booth-and-table/table-book-schema';
import { BoothBooking, BoothBookingSchema } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/booth-and-table/booth-booking.schema';
import {
  VenueOwnerProfile,
  VenueOwnerProfileSchema,
} from 'src/infrastructure/database/schemas/venue-owner-profile.schema';
import { RedisModule } from 'src/infrastructure/redis/redis.module';
import { EventAttendanceController } from './event-attendance.controller';
import { EventAttendanceService } from './event-attendance.service';

@Module({
  imports: [
    RedisModule,
    MongooseModule.forFeature([
      { name: Event.name, schema: EventSchema },
      { name: EventAttendancePortal.name, schema: EventAttendancePortalSchema },
      { name: SeatBooking.name, schema: SeatBookingSchema },
      { name: TableBooking.name, schema: TableBookingSchema },
      { name: BoothBooking.name, schema: BoothBookingSchema },
      { name: VenueOwnerProfile.name, schema: VenueOwnerProfileSchema },
    ]),
  ],
  controllers: [EventAttendanceController],
  providers: [EventAttendanceService],
  exports: [EventAttendanceService],
})
export class EventAttendanceModule {}
