import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CustomEquipmentPackagesController } from './custom-equipment-packages.controller';
import { CustomEquipmentPackagesService } from './custom-equipment-packages.service';
import { 
  CustomEquipmentPackage, 
  CustomEquipmentPackageSchema 
} from '../../infrastructure/database/schemas/custom-equipment-package.schema';
import { 
  Equipment, 
  EquipmentSchema 
} from '../../infrastructure/database/schemas/equipment.schema';
import { 
  User, 
  UserSchema 
} from '../../infrastructure/database/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CustomEquipmentPackage.name, schema: CustomEquipmentPackageSchema },
      { name: Equipment.name, schema: EquipmentSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [CustomEquipmentPackagesController],
  providers: [CustomEquipmentPackagesService],
  exports: [CustomEquipmentPackagesService],
})
export class CustomEquipmentPackagesModule {}