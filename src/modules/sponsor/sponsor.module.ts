import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SponsorController } from './sponsor.controller';
import { SponsorService } from './sponsor.service';
import {
  Sponsor,
  SponsorSchema,
} from '../../infrastructure/database/schemas/sponsor.schema';
import { User, UserSchema } from '../../infrastructure/database/schemas';
import { S3Module } from '../../infrastructure/s3/s3.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Sponsor.name, schema: SponsorSchema },
      { name: User.name, schema: UserSchema },
    ]),
    S3Module,
  ],
  controllers: [SponsorController],
  providers: [SponsorService],
  exports: [SponsorService],
})
export class SponsorModule {}
