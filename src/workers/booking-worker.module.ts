
import { Module } from '@nestjs/common';
import { RedisModule } from 'src/infrastructure/redis/redis.module';
import { BookingModule } from 'src/modules/booking/booking.module';
import { BookingStatusWorker } from './booking.status';
import { EquipmentPackageBookingModule } from 'src/modules/equipment-package-booking/equipment-package-booking.module';
import { SeatBookModule } from 'src/modules/seat-book/seat-book.module';


@Module({
  imports: [RedisModule, BookingModule, EquipmentPackageBookingModule,SeatBookModule],
  providers: [BookingStatusWorker],
})
export class BookingWorkerModule {}
