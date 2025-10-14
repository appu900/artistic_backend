import { Module } from '@nestjs/common';
import { EquipmentPackagesService } from './equipment-packages.service';
import { EquipmentPackagesController } from './equipment-packages.controller';
import { MongooseModule } from '@nestjs/mongoose';
import {
  EquipmentPackage,
  EquipmentPackageSchema,
} from 'src/infrastructure/database/schemas/equipment-package.schema';
import { User, UserSchema } from 'src/infrastructure/database/schemas';
import {
  Equipment,
  EquipmentSchema,
} from 'src/infrastructure/database/schemas/equipment.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: EquipmentPackage.name, schema: EquipmentPackageSchema },
      { name: User.name, schema: UserSchema },
      { name: Equipment.name, schema: EquipmentSchema },
    ]),
  ],
  providers: [EquipmentPackagesService],
  controllers: [EquipmentPackagesController],
})
export class EquipmentPackagesModule {}
