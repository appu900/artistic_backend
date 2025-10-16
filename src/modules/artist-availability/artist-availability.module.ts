import { Module } from '@nestjs/common';
import { ArtistAvailabilityService } from './artist-availability.service';
import { ArtistAvailabilityController } from './artist-availability.controller';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ArtistProfile,
  ArtistProfileSchema,
} from 'src/infrastructure/database/schemas/artist-profile.schema';
import {
  ArtistBooking,
  ArtistBookingSchema,
} from 'src/infrastructure/database/schemas/artist-booking.schema';
import {
  ArtistUnavailable,
  ArtistUnavailableSchema,
} from 'src/infrastructure/database/schemas/Artist-Unavailable.schema';
import { User, UserSchema } from 'src/infrastructure/database/schemas';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ArtistProfile.name, schema: ArtistProfileSchema },
      { name: ArtistBooking.name, schema: ArtistBookingSchema },
      { name: ArtistUnavailable.name, schema: ArtistUnavailableSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  providers: [ArtistAvailabilityService],
  controllers: [ArtistAvailabilityController],
  exports: [ArtistAvailabilityService],
})
export class ArtistAvailabilityModule {}
