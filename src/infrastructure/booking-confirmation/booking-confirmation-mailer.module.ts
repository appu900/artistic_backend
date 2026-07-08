import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EmailModule } from '../email/email.module';
import { TicketModule } from '../ticket/ticket.module';
import { PaymentlogsModule } from 'src/modules/paymentlogs/paymentlogs.module';
import { BookingConfirmationMailerService } from './booking-confirmation-mailer.service';
import { ArtistBooking, ArtistBookingSchema } from 'src/infrastructure/database/schemas/artist-booking.schema';
import { EquipmentBooking, EquipmentBookingSchema } from 'src/infrastructure/database/schemas/Equipment-booking.schema';
import { EquipmentPackageBooking, EquipmentPackageBookingSchema } from 'src/infrastructure/database/schemas/equipment-package-booking.schema';
import { CombineBooking, CombineBookingSchema } from 'src/infrastructure/database/schemas/Booking.schema';
import { SeatBooking, SeatBookingSchema } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/SeatBooking.schema';
import { TableBooking, TableBookingSchema } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/booth-and-table/table-book-schema';
import { BoothBooking, BoothBookingSchema } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/booth-and-table/booth-booking.schema';

@Module({
  imports: [
    EmailModule,
    TicketModule,
    PaymentlogsModule,
    MongooseModule.forFeature([
      { name: ArtistBooking.name, schema: ArtistBookingSchema },
      { name: EquipmentBooking.name, schema: EquipmentBookingSchema },
      { name: EquipmentPackageBooking.name, schema: EquipmentPackageBookingSchema },
      { name: CombineBooking.name, schema: CombineBookingSchema },
      { name: SeatBooking.name, schema: SeatBookingSchema },
      { name: TableBooking.name, schema: TableBookingSchema },
      { name: BoothBooking.name, schema: BoothBookingSchema },
    ]),
  ],
  providers: [BookingConfirmationMailerService],
  exports: [BookingConfirmationMailerService],
})
export class BookingConfirmationMailerModule {}
