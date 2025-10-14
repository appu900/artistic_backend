import { Module } from '@nestjs/common';
import { EquipmentController } from './equipment.controller';
import { EquipmentService } from './equipment.service';
import { Mongoose } from 'mongoose';
import { MongooseModule } from '@nestjs/mongoose';
import { Equipment, EquipmentSchema } from 'src/infrastructure/database/schemas/equipment.schema';
import { EquipmentProviderProfile, EquipmentProviderProfileSchema } from 'src/infrastructure/database/schemas/equipment-provider-profile.schema';
import { S3Module } from 'src/infrastructure/s3/s3.module';

@Module({
  imports:[
    MongooseModule.forFeature([
      {name:Equipment.name,schema:EquipmentSchema},
      {name:EquipmentProviderProfile.name,schema:EquipmentProviderProfileSchema},
    ]),
    S3Module
  ],
  controllers: [EquipmentController],
  providers: [EquipmentService]
})
export class EquipmentModule {}
