import { Module } from '@nestjs/common';
import { AdminController, AdminPaymentsController } from './admin.controller';
import { AdminService } from './admin.service';
import { MongooseModule } from '@nestjs/mongoose';
import {
  CombineBooking,
  CombineBookingSchema,
} from 'src/infrastructure/database/schemas/Booking.schema';
import {
  EquipmentPackageBooking,
  EquipmentPackageBookingSchema,
} from 'src/infrastructure/database/schemas/equipment-package-booking.schema';
import {
  ArtistBooking,
  ArtistBookingSchema,
} from 'src/infrastructure/database/schemas/artist-booking.schema';
import {
  ArtistProfile,
  ArtistProfileSchema,
} from 'src/infrastructure/database/schemas/artist-profile.schema';
import { User, UserSchema } from 'src/infrastructure/database/schemas/user.schema';
import { EquipmentProviderModule } from '../equipment-provider/equipment-provider.module';
import { ArtistModule } from '../artist/artist.module';
import { CommissionSetting, CommissionSettingSchema } from 'src/infrastructure/database/schemas/commission-setting.schema';
import { Payout, PayoutSchema } from 'src/infrastructure/database/schemas/payout.schema';
import { PaymentAudit, PaymentAuditSchema } from 'src/infrastructure/database/schemas/payment-audit.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CombineBooking.name, schema: CombineBookingSchema },
      { name: EquipmentPackageBooking.name, schema: EquipmentPackageBookingSchema },
      { name: ArtistBooking.name, schema: ArtistBookingSchema },
      { name: ArtistProfile.name, schema: ArtistProfileSchema },
      { name: User.name, schema: UserSchema },
      { name: CommissionSetting.name, schema: CommissionSettingSchema },
      { name: Payout.name, schema: PayoutSchema },
      { name: PaymentAudit.name, schema: PaymentAuditSchema },
    ]),
    EquipmentProviderModule,
    ArtistModule,
  ],
  controllers: [AdminController, AdminPaymentsController],
  providers: [AdminService],
})
export class AdminModule {}
