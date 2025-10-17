import { Module } from '@nestjs/common';
import { ArtistPricingController } from './artist-pricing.controller';
import { ArtistPricingService } from './artist-pricing.service';
import { MongooseModule } from '@nestjs/mongoose';
import { ArtistPricing, ArtistPricingSchema } from 'src/infrastructure/database/schemas/Artist-pricing.schema';
import { ArtistProfileSchema } from 'src/infrastructure/database/schemas/artist-profile.schema';

@Module({
  imports:[
    MongooseModule.forFeature([
      {name:ArtistPricing.name,schema:ArtistPricingSchema}
    ])
  ],
  controllers: [ArtistPricingController],
  providers: [ArtistPricingService],
  exports:[ArtistPricingService]
})
export class ArtistPricingModule {}
