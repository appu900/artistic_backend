import { Module } from '@nestjs/common';
import { EquipmentPackagesService } from './equipment-packages.service';
import { EquipmentPackagesController } from './equipment-packages.controller';
import { MongooseModule } from '@nestjs/mongoose';
import {
  EquipmentPackage,
  EquipmentPackageSchema,
} from 'src/infrastructure/database/schemas/equipment-package.schema';
import {
  CustomEquipmentPackage,
  CustomEquipmentPackageSchema,
} from 'src/infrastructure/database/schemas/custom-equipment-package.schema';
import { User, UserSchema } from 'src/infrastructure/database/schemas';
import {
  Equipment,
  EquipmentSchema,
} from 'src/infrastructure/database/schemas/equipment.schema';
import { S3Module } from 'src/infrastructure/s3/s3.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: EquipmentPackage.name, schema: EquipmentPackageSchema },
      { name: CustomEquipmentPackage.name, schema: CustomEquipmentPackageSchema },
      { name: User.name, schema: UserSchema },
      { name: Equipment.name, schema: EquipmentSchema },
    ]),
    S3Module,
  ],
  providers: [EquipmentPackagesService],
  controllers: [EquipmentPackagesController],
})
export class EquipmentPackagesModule {}
