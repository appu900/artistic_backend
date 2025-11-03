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
import { EventTicketBooking, EventTicketBookingSchema } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/EventTicketBooking.schema';
import { Event, EventSchema } from 'src/infrastructure/database/schemas/event.schema';
import { Seat, SeatSchema } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/seat.schema';
import { Table, TableSchema } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/table.schema';
import { Booth, BoothSchema } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/Booth.schema';


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
      { name: EventTicketBooking.name, schema: EventTicketBookingSchema },
      { name: Event.name, schema: EventSchema },
      { name: Seat.name, schema: SeatSchema },
      { name: Table.name, schema: TableSchema },
      { name: Booth.name, schema: BoothSchema },
    ]),
  ],
  providers: [PaymentService],
  controllers: [PaymentController],
  exports:[PaymentService]
})
export class PaymentModule {}
