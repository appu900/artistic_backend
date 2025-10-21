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
import { ArtistAvailabilityModule } from '../artist-availability/artist-availability.module';
import { ArtistPricingModule } from '../artist-pricing/artist-pricing.module';
import { CustomEquipmentPackage, CustomEquipmentPackageSchema } from 'src/infrastructure/database/schemas/custom-equipment-package.schema';
import { EquipmentPackage, EquipmentPackageSchema } from 'src/infrastructure/database/schemas/equipment-package.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CombineBooking.name, schema: CombineBookingSchema },
      { name: EquipmentBooking.name, schema: EquipmentBookingSchema },
      { name: ArtistBooking.name, schema: ArtistBookingSchema },
      { name: ArtistUnavailable.name, schema: ArtistUnavailableSchema },
      { name: ArtistProfile.name, schema: ArtistProfileSchema },
      { name: User.name, schema: UserSchema },
      {name:CustomEquipmentPackage.name,schema:CustomEquipmentPackageSchema},
      {name:EquipmentPackage.name,schema:EquipmentPackageSchema}
    ]),
    ArtistAvailabilityModule,
    ArtistPricingModule,
  ],
  controllers: [BookingController],
  providers: [BookingService],
})
export class BookingModule {}
