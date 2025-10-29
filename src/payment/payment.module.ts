import { forwardRef, Global, Module } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { RedisModule } from 'src/infrastructure/redis/redis.module';
import { PaymentlogsModule } from 'src/modules/paymentlogs/paymentlogs.module';
import { BookingModule } from 'src/modules/booking/booking.module';
import { BullMqModule } from 'src/infrastructure/redis/queue/bullmq.module';
import { EquipmentPackageBookingModule } from 'src/modules/equipment-package-booking/equipment-package-booking.module';


@Global()
@Module({
  imports:[
    RedisModule,
    PaymentlogsModule,
    BullMqModule,
    forwardRef(() => BookingModule),
    EquipmentPackageBookingModule,
  ],
  providers: [PaymentService],
  controllers: [PaymentController],
  exports:[PaymentService]
})
export class PaymentModule {}
