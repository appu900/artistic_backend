import { Controller, Get, UseGuards } from '@nestjs/common';
import { UserBookingAnalyticsService } from './services/user-booking.service';
import { JwtAuthGuard } from 'src/common/guards/jwtAuth.guard';
import { GetUser } from 'src/common/decorators/getUser.decorator';

@Controller('booking-analytics')
export class BookingAnalyticsController {
  constructor(
    private readonly userBookingAnalytics: UserBookingAnalyticsService,
  ) {}

  @Get('/user/artist-booking')
  @UseGuards(JwtAuthGuard)
  async getUserBookings(@GetUser() user: any) {
    const userId = user.userId;
    return this.userBookingAnalytics.getUserArtistBooking(userId);
  }

  @Get('/user/equipment-booking')
  @UseGuards(JwtAuthGuard)
  async getUserEquipementBookings(@GetUser() user: any) {
    const userId = user.userId;
    return this.userBookingAnalytics.getUserEquipmentBookings(userId);
  }

  @Get('/user/booking')
  @UseGuards(JwtAuthGuard)
  async getUserCombinetBookings(@GetUser() user: any) {
    const userId = user.userId;
    return this.userBookingAnalytics.getUserCombineBookings(userId);
  }
}


