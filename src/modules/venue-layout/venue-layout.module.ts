import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VenueLayoutController } from './venue-layout.controller';
import { VenueLayoutService } from './venue-layout.service';
import { SeatLayout, SeatLayoutSchema } from '../../infrastructure/database/schemas/seatlayout-seat-bookings/SeatLayout.schema';
import { SeatState, SeatStateSchema } from '../../infrastructure/database/schemas/seatlayout-seat-bookings/SeatState.schema';
import { SeatLockService } from '../../infrastructure/redis/seat-lock.service';
import { SeatBookingService } from './seat-booking.service';
import { RedisModule } from '../../infrastructure/redis/redis.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SeatLayout.name, schema: SeatLayoutSchema },
      { name: SeatState.name, schema: SeatStateSchema },
    ]),
    RedisModule,
  ],
  controllers: [VenueLayoutController],
  providers: [VenueLayoutService, SeatLockService, SeatBookingService],
  exports: [VenueLayoutService, SeatLockService, SeatBookingService],
})
export class VenueLayoutModule {}
