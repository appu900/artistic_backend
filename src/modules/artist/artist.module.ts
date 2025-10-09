import { Module } from '@nestjs/common';
import { ArtistController } from './artist.controller';
import { ArtistService } from './artist.service';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ArtistType,
  ArtistTypeSchema,
} from 'src/infrastructure/database/schemas/artist-type.schema';
import {
  ArtistProfile,
  ArtistProfileSchema,
} from 'src/infrastructure/database/schemas/artist-profile.schema';
import { User, UserSchema } from 'src/infrastructure/database/schemas';
import { S3Service } from 'src/infrastructure/s3/s3.service';
import { S3Module } from 'src/infrastructure/s3/s3.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ArtistType.name, schema: ArtistTypeSchema },
      { name: ArtistProfile.name, schema: ArtistProfileSchema },
      { name: User.name, schema: UserSchema },
    ]),
    S3Module,
  ],
  controllers: [ArtistController],
  providers: [ArtistService],
})
export class ArtistModule {}
