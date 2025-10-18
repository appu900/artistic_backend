import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { MongooseModule } from '@nestjs/mongoose';
import {
  CombineBooking,
  CombineBookingSchema,
} from 'src/infrastructure/database/schemas/Booking.schema';
import {
  EquipmentPackageBooking,
  EquipmentPackageBookingSchema,
} from 'src/infrastructure/database/schemas/equipment-package-booking.schema';
import {
  ArtistBooking,
  ArtistBookingSchema,
} from 'src/infrastructure/database/schemas/artist-booking.schema';
import {
  ArtistProfile,
  ArtistProfileSchema,
} from 'src/infrastructure/database/schemas/artist-profile.schema';
import { EquipmentProviderModule } from '../equipment-provider/equipment-provider.module';
import { ArtistModule } from '../artist/artist.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CombineBooking.name, schema: CombineBookingSchema },
      { name: EquipmentPackageBooking.name, schema: EquipmentPackageBookingSchema },
      { name: ArtistBooking.name, schema: ArtistBookingSchema },
      { name: ArtistProfile.name, schema: ArtistProfileSchema },
    ]),
    EquipmentProviderModule,
    ArtistModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
