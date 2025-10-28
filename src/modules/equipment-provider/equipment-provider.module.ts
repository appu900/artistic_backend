import { Module, forwardRef } from '@nestjs/common';
import { EquipmentProviderService } from './equipment-provider.service';
import { EquipmentProviderController } from './equipment-provider.controller';
import { MongooseModule } from '@nestjs/mongoose';
import {
  EquipmentProviderProfile,
  EquipmentProviderProfileSchema,
} from 'src/infrastructure/database/schemas/equipment-provider-profile.schema';
import { User, UserSchema } from 'src/infrastructure/database/schemas/user.schema';
import { Equipment, EquipmentSchema } from 'src/infrastructure/database/schemas/equipment.schema';
import { 
  EquipmentBooking, 
  EquipmentBookingSchema 
} from 'src/infrastructure/database/schemas/Equipment-booking.schema';
import { 
  EquipmentPackageBooking, 
  EquipmentPackageBookingSchema 
} from 'src/infrastructure/database/schemas/equipment-package-booking.schema';
import { 
  EquipmentPackage, 
  EquipmentPackageSchema 
} from 'src/infrastructure/database/schemas/equipment-package.schema';
import { 
  CustomEquipmentPackage, 
  CustomEquipmentPackageSchema 
} from 'src/infrastructure/database/schemas/custom-equipment-package.schema';
import { S3Module } from 'src/infrastructure/s3/s3.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: EquipmentProviderProfile.name, schema: EquipmentProviderProfileSchema },
      { name: Equipment.name, schema: EquipmentSchema },
      { name: EquipmentBooking.name, schema: EquipmentBookingSchema },
      { name: EquipmentPackageBooking.name, schema: EquipmentPackageBookingSchema },
      { name: EquipmentPackage.name, schema: EquipmentPackageSchema },
      { name: CustomEquipmentPackage.name, schema: CustomEquipmentPackageSchema },
      { name: User.name, schema: UserSchema },
    ]),
    S3Module,
    forwardRef(() => AuthModule),
  ],
  providers: [EquipmentProviderService],
  controllers: [EquipmentProviderController],
  exports: [EquipmentProviderService],
})
export class EquipmentProviderModule {}