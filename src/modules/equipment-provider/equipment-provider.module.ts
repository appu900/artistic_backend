import { Module } from '@nestjs/common';
import { EquipmentProviderService } from './equipment-provider.service';
import { EquipmentProviderController } from './equipment-provider.controller';
import { MongooseModule } from '@nestjs/mongoose';
import {
  EquipmentProvider,
  EquipmentProviderSchema,
} from 'src/infrastructure/database/schemas/equipment-Provider.schema';
import { S3Module } from 'src/infrastructure/s3/s3.module';
import { AuthModule } from '../auth/auth.module';
import { Equipment, EquipmentSchema } from 'src/infrastructure/database/schemas/equipment.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: EquipmentProvider.name, schema: EquipmentProviderSchema },
      { name: Equipment.name, schema: EquipmentSchema },
    ]),
    S3Module,
    AuthModule,
  ],
  providers: [EquipmentProviderService],
  controllers: [EquipmentProviderController],
})
export class EquipmentProviderModule {}
