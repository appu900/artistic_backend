import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SeatBookingController } from './seat-booking.controller';
import { SeatBookingService } from './seat-booking.service';
import { RedisModule } from '../../infrastructure/redis/redis.module';

// Import schemas
import { SeatLayout, SeatLayoutSchema } from '../../infrastructure/database/schemas/seatlayout-seat-bookings/SeatLayout.schema';
import { SeatState, SeatStateSchema } from '../../infrastructure/database/schemas/seatlayout-seat-bookings/SeatState.schema';
import { SeatBooking, SeatBookingSchema } from '../../infrastructure/database/schemas/seatlayout-seat-bookings/SeatBooking.schema';

@Module({
  imports: [
    // MongoDB schemas
    MongooseModule.forFeature([
      { name: SeatLayout.name, schema: SeatLayoutSchema },
      { name: SeatState.name, schema: SeatStateSchema },
      { name: SeatBooking.name, schema: SeatBookingSchema },
    ]),
    
    // Redis for atomic locking
    RedisModule,
  ],
  controllers: [SeatBookingController],
  providers: [SeatBookingService],
  exports: [SeatBookingService], // Export for use in other modules
})
export class SeatBookingModule {}