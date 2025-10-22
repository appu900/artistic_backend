import { forwardRef, Global, Module } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { RedisModule } from 'src/infrastructure/redis/redis.module';
import { PaymentlogsModule } from 'src/modules/paymentlogs/paymentlogs.module';
import { BookingModule } from 'src/modules/booking/booking.module';




@Global()
@Module({
  imports:[
     RedisModule,
     PaymentlogsModule,
      forwardRef(() => BookingModule)
  ],
  providers: [PaymentService],
  controllers: [PaymentController],
  exports:[PaymentService]
})
export class PaymentModule {}
