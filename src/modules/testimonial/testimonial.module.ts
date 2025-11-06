import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TestimonialController } from './testimonial.controller';
import { TestimonialService } from './testimonial.service';
import {
  Testimonial,
  TestimonialSchema,
} from '../../infrastructure/database/schemas/testimonial.schema';
import { User, UserSchema } from '../../infrastructure/database/schemas';
import { S3Module } from '../../infrastructure/s3/s3.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Testimonial.name, schema: TestimonialSchema },
      { name: User.name, schema: UserSchema },
    ]),
    S3Module,
  ],
  controllers: [TestimonialController],
  providers: [TestimonialService],
  exports: [TestimonialService],
})
export class TestimonialModule {}
