import { Module } from '@nestjs/common';
import { ArtistPricingController } from './artist-pricing.controller';
import { ArtistPricingService } from './artist-pricing.service';
import { TimeSlotService } from './time-slot.service';
import { MongooseModule } from '@nestjs/mongoose';
import { 
  ArtistPricing, 
  ArtistPricingSchema 
} from 'src/infrastructure/database/schemas/Artist-pricing.schema';
import { 
  ArtistProfile, 
  ArtistProfileSchema 
} from 'src/infrastructure/database/schemas/artist-profile.schema';
import { 
  ArtistUnavailable, 
  ArtistUnavailableSchema 
} from 'src/infrastructure/database/schemas/Artist-Unavailable.schema';
import { 
  ArtistBooking, 
  ArtistBookingSchema 
} from 'src/infrastructure/database/schemas/artist-booking.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ArtistPricing.name, schema: ArtistPricingSchema },
      { name: ArtistProfile.name, schema: ArtistProfileSchema },
      { name: ArtistUnavailable.name, schema: ArtistUnavailableSchema },
      { name: ArtistBooking.name, schema: ArtistBookingSchema },
    ]),
  ],
  controllers: [ArtistPricingController],
  providers: [ArtistPricingService, TimeSlotService],
  exports: [ArtistPricingService, TimeSlotService],
})
export class ArtistPricingModule {}

