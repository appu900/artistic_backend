import { Module } from '@nestjs/common';
import { BookingAnalyticsController } from './booking-analytics.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { ArtistBooking, ArtistBookingSchema } from 'src/infrastructure/database/schemas/artist-booking.schema';
import { EquipmentBooking, EquipmentBookingSchema } from 'src/infrastructure/database/schemas/Equipment-booking.schema';
import { CombineBooking, CombineBookingSchema } from 'src/infrastructure/database/schemas/Booking.schema';
import { EquipmentPackage, EquipmentPackageSchema } from 'src/infrastructure/database/schemas/equipment-package.schema';
import { Equipment, EquipmentSchema } from 'src/infrastructure/database/schemas/equipment.schema';
import { ArtistProfile, ArtistProfileSchema } from 'src/infrastructure/database/schemas/artist-profile.schema';
import { User, UserSchema } from 'src/infrastructure/database/schemas';
import { UserBookingAnalyticsService } from './services/user-booking.service';


@Module({
  imports:[
    MongooseModule.forFeature([
      {name:ArtistBooking.name,schema:ArtistBookingSchema},
      {name:EquipmentBooking.name,schema:EquipmentBookingSchema},
      {name:CombineBooking.name,schema:CombineBookingSchema},
      {name:EquipmentPackage.name,schema:EquipmentPackageSchema},
      {name:Equipment.name,schema:EquipmentSchema},
      {name:ArtistProfile.name,schema:ArtistProfileSchema},
      {name:User.name,schema:UserSchema}
    ])
  ],
  controllers: [BookingAnalyticsController],
  providers: [UserBookingAnalyticsService]
})
export class BookingAnalyticsModule {}
