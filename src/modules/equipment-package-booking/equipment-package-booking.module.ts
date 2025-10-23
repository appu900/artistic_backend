import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EquipmentPackageBookingController } from './equipment-package-booking.controller';
import { EquipmentPackageBookingService } from './equipment-package-booking.service';
import {
  EquipmentPackageBooking,
  EquipmentPackageBookingSchema,
} from '../../infrastructure/database/schemas/equipment-package-booking.schema';
import {
  EquipmentPackage,
  EquipmentPackageSchema,
} from '../../infrastructure/database/schemas/equipment-package.schema';
import {
  CustomEquipmentPackage,
  CustomEquipmentPackageSchema,
} from '../../infrastructure/database/schemas/custom-equipment-package.schema';
import { User, UserSchema } from '../../infrastructure/database/schemas';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: EquipmentPackageBooking.name, schema: EquipmentPackageBookingSchema },
      { name: EquipmentPackage.name, schema: EquipmentPackageSchema },
      { name: CustomEquipmentPackage.name, schema: CustomEquipmentPackageSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [EquipmentPackageBookingController],
  providers: [EquipmentPackageBookingService],
  exports: [EquipmentPackageBookingService],
})
export class EquipmentPackageBookingModule {}