import { Module } from '@nestjs/common';
import { ArtistController } from './artist.controller';
import { ArtistService } from './artist.service';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ArtistProfile,
  ArtistProfileSchema,
} from 'src/infrastructure/database/schemas/artist-profile.schema';
import { User, UserSchema } from 'src/infrastructure/database/schemas';
import { S3Service } from 'src/infrastructure/s3/s3.service';
import { S3Module } from 'src/infrastructure/s3/s3.module';
import { ArtistProfileUpdateRequestSchema, ArtistProfleUpdateRequest } from 'src/infrastructure/database/schemas/artistProfile-Update-Request.schema';
import { ArtistApplication, ArtistApplicationSchema } from 'src/infrastructure/database/schemas/artist-application.schema';
import { PortfolioItem, PortfolioItemSchema } from 'src/infrastructure/database/schemas/portfolio-item.schema';
import { EmailModule } from 'src/infrastructure/email/email.module';
import { ArtistPricingModule } from '../artist-pricing/artist-pricing.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ArtistProfile.name, schema: ArtistProfileSchema },
      { name: User.name, schema: UserSchema },
      {name:ArtistProfleUpdateRequest.name,schema:ArtistProfileUpdateRequestSchema},
      {name:ArtistApplication.name,schema:ArtistApplicationSchema},
      {name:PortfolioItem.name,schema:PortfolioItemSchema}
    ]),
    S3Module,
    EmailModule,
    ArtistPricingModule
  ],
  controllers: [ArtistController],
  providers: [ArtistService],
  exports: [ArtistService], // Export ArtistService so other modules can use it
})
export class ArtistModule {}
