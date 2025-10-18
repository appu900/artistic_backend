import { Module } from '@nestjs/common';
import { VenueOwnerController } from './venue-owner.controller';
import { VenueOwnerService } from './venue-owner.service';
import { MongooseModule } from '@nestjs/mongoose';
import { ArtistProfile } from 'src/infrastructure/database/schemas/artist-profile.schema';
import {
  VenueOwnerProfile,
  VenueOwnerProfileSchema,
} from 'src/infrastructure/database/schemas/venue-owner-profile.schema';
import { User, UserSchema } from 'src/infrastructure/database/schemas';
import { S3Module } from 'src/infrastructure/s3/s3.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: VenueOwnerProfile.name, schema: VenueOwnerProfileSchema },
      { name: User.name, schema: UserSchema },
    ]),
    S3Module,
  ],
  controllers: [VenueOwnerController],
  providers: [VenueOwnerService],
})
export class VenueOwnerModule {}
