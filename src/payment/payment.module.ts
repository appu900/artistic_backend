import { forwardRef, Global, Module } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { RedisModule } from 'src/infrastructure/redis/redis.module';
import { PaymentlogsModule } from 'src/modules/paymentlogs/paymentlogs.module';
import { BookingModule } from 'src/modules/booking/booking.module';
import { BullMqModule } from 'src/infrastructure/redis/queue/bullmq.module';
import { EquipmentPackageBookingModule } from 'src/modules/equipment-package-booking/equipment-package-booking.module';
import { EmailModule } from 'src/infrastructure/email/email.module';
import { MongooseModule } from '@nestjs/mongoose';
import { ArtistBooking, ArtistBookingSchema } from 'src/infrastructure/database/schemas/artist-booking.schema';
import { EquipmentBooking, EquipmentBookingSchema } from 'src/infrastructure/database/schemas/Equipment-booking.schema';
import { CombineBooking, CombineBookingSchema } from 'src/infrastructure/database/schemas/Booking.schema';
// Removed deprecated EventTicketBooking schema usage
import { Event, EventSchema } from 'src/infrastructure/database/schemas/event.schema';
import { Seat, SeatSchema } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/seat.schema';
import { Table, TableSchema } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/table.schema';
import { Booth, BoothSchema } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/Booth.schema';
import { SeatBooking, SeatBookingSchema } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/SeatBooking.schema';
import { TableBooking, TableBookingSchema } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/booth-and-table/table-book-schema';
import { BoothBooking, BoothBookingSchema } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/booth-and-table/booth-booking.schema';


@Global()
@Module({
  imports:[
    RedisModule,
    PaymentlogsModule,
    BullMqModule,
    forwardRef(() => BookingModule),
    EquipmentPackageBookingModule,
    EmailModule,
    MongooseModule.forFeature([
      { name: ArtistBooking.name, schema: ArtistBookingSchema },
      { name: EquipmentBooking.name, schema: EquipmentBookingSchema },
      { name: CombineBooking.name, schema: CombineBookingSchema },
  // EventTicketBooking removed: using per-type seat/table/booth bookings only
      { name: Event.name, schema: EventSchema },
      { name: Seat.name, schema: SeatSchema },
      { name: Table.name, schema: TableSchema },
      { name: Booth.name, schema: BoothSchema },
      { name: SeatBooking.name, schema: SeatBookingSchema },
      { name: TableBooking.name, schema: TableBookingSchema },
      { name: BoothBooking.name, schema: BoothBookingSchema },
    ]),
  ],
  providers: [PaymentService],
  controllers: [PaymentController],
  exports:[PaymentService]
})
export class PaymentModule {}
