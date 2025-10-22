import { Module } from '@nestjs/common';
import { PaymentlogsController } from './paymentlogs.controller';
import { PaymentlogsService } from './paymentlogs.service';
import { MongooseModule } from '@nestjs/mongoose';
import { PaymentsLog, PaymentsLogSchema } from 'src/infrastructure/database/schemas/PaymentLog.schema';

@Module({
  imports:[
    MongooseModule.forFeature([
      {name:PaymentsLog.name,schema:PaymentsLogSchema}
    ])
  ],
  controllers: [PaymentlogsController],
  providers: [PaymentlogsService],
  exports:[PaymentlogsService]
})
export class PaymentlogsModule {}
