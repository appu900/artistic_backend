import { Module } from '@nestjs/common';
import { ArtistPricingController } from './artist-pricing.controller';
import { ArtistPricingService } from './artist-pricing.service';

@Module({
  controllers: [ArtistPricingController],
  providers: [ArtistPricingService],
  exports:[ArtistPricingService]
})
export class ArtistPricingModule {}
