import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  DiscoveryCard,
  DiscoveryCardSchema,
} from '../../infrastructure/database/schemas/discovery-card.schema';
import {
  DiscoverySettings,
  DiscoverySettingsSchema,
} from '../../infrastructure/database/schemas/discovery-settings.schema';
import { S3Module } from '../../infrastructure/s3/s3.module';
import { DiscoveryCarouselController } from './discovery-carousel.controller';
import { DiscoveryCarouselService } from './discovery-carousel.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DiscoveryCard.name, schema: DiscoveryCardSchema },
      { name: DiscoverySettings.name, schema: DiscoverySettingsSchema },
    ]),
    S3Module,
  ],
  controllers: [DiscoveryCarouselController],
  providers: [DiscoveryCarouselService],
  exports: [DiscoveryCarouselService],
})
export class DiscoveryCarouselModule {}
