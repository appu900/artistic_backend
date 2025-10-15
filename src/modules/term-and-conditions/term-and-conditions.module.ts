import { Module } from '@nestjs/common';
import { TermAndConditionsService } from './term-and-conditions.service';
import { TermAndConditionsController } from './term-and-conditions.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Terms, TermsSchema } from 'src/infrastructure/database/schemas/terms-and-conditions.schema';

@Module({
  imports:[
    MongooseModule.forFeature([
      {name:Terms.name,schema:TermsSchema}
    ])
  ],
  providers: [TermAndConditionsService],
  controllers: [TermAndConditionsController]
})
export class TermAndConditionsModule {}
