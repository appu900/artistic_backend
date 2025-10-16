import { Module } from '@nestjs/common';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { MongooseModule } from '@nestjs/mongoose';
import {
  CombineBooking,
  CombineBookingSchema,
} from 'src/infrastructure/database/schemas/Booking.schema';
 
import {
  ArtistBooking,
  ArtistBookingSchema,
} from 'src/infrastructure/database/schemas/artist-booking.schema';
import {
  ArtistUnavailable,
  ArtistUnavailableSchema,
} from 'src/infrastructure/database/schemas/Artist-Unavailable.schema';
import {
  ArtistProfile,
  ArtistProfileSchema,
} from 'src/infrastructure/database/schemas/artist-profile.schema';
import { User, UserSchema } from 'src/infrastructure/database/schemas';
import { EquipmentBooking, EquipmentBookingDocument,EquipmentBookingSchema } from 'src/infrastructure/database/schemas/Equipment-booking.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CombineBooking.name, schema: CombineBookingSchema },
      { name: EquipmentBooking.name, schema: EquipmentBookingSchema },
      { name: ArtistBooking.name, schema: ArtistBookingSchema },
      { name: ArtistUnavailable.name, schema: ArtistUnavailableSchema },
      { name: ArtistProfile.name, schema: ArtistProfileSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [BookingController],
  providers: [BookingService],
})
export class BookingModule {}
