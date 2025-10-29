import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CarouselController } from './carousel.controller';
import { CarouselService } from './carousel.service';
import { CarouselSlide, CarouselSlideSchema } from '../../infrastructure/database/schemas/carousel-slide.schema';
import { User, UserSchema } from '../../infrastructure/database/schemas';
import { S3Module } from '../../infrastructure/s3/s3.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CarouselSlide.name, schema: CarouselSlideSchema },
      { name: User.name, schema: UserSchema },
    ]),
    S3Module,
  ],
  controllers: [CarouselController],
  providers: [CarouselService],
  exports: [CarouselService],
})
export class CarouselModule {}