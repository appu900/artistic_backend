
import { Module } from '@nestjs/common';
import { RedisModule } from 'src/infrastructure/redis/redis.module';
import { BookingModule } from 'src/modules/booking/booking.module';
import { BookingStatusWorker } from './booking.status';


@Module({
  imports: [RedisModule, BookingModule],
  providers: [BookingStatusWorker],
})
export class BookingWorkerModule {}
