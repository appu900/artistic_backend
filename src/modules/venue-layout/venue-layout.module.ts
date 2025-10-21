import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VenueLayoutController } from './venue-layout.controller';
import { VenueLayoutService } from './venue-layout.service';
import { SeatLayout, SeatLayoutSchema } from '../../infrastructure/database/schemas/seatlayout-seat-bookings/SeatLayout.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SeatLayout.name, schema: SeatLayoutSchema },
    ]),
  ],
  controllers: [VenueLayoutController],
  providers: [VenueLayoutService],
  exports: [VenueLayoutService],
})
export class VenueLayoutModule {}
