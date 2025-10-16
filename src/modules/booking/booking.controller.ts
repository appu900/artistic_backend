import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { BookingService } from './booking.service';
import { CreateArtistBookingDto, CreateCombinedBookingDto, CreateEquipmentBookingDto } from './dto/booking.dto';
import { GetUser } from 'src/common/decorators/getUser.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwtAuth.guard';

@Controller('bookings')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Get('/artist/:artistId/availability')
  async getArtistAvailability(
    @Param('artistId') artistId: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    const monthNumber = month ? parseInt(month, 10) : undefined;
    const yearNumber = year ? parseInt(year, 10) : undefined;
    return this.bookingService.getArtistAvailability(artistId, monthNumber, yearNumber);
  }

  @Post('/artist/:artistId/test-unavailable')
  async createTestUnavailableSlots(
    @Param('artistId') artistId: string,
    @Body() body: { date: string; hours: number[] },
  ) {
    return this.bookingService.createTestUnavailableSlots(artistId, body.date, body.hours);
  }

  @Post('/artist')
  @UseGuards(JwtAuthGuard)
  async createArtistBooking(
    @Body() dto: CreateArtistBookingDto,
    @GetUser() user: any,
  ) {
    const userId = user.userId;
    dto.bookedBy = userId;
    return this.bookingService.createArtistBooking(dto);
  }

  @Post('/equipment')
  @UseGuards(JwtAuthGuard)
  async createEquipmentBooking(
    @Body() dto: CreateEquipmentBookingDto,
    @GetUser() user: any,
  ) {
    const userId = user.userId;
    dto.bookedBy = userId;
    return this.bookingService.createEquipmentBooking(dto);
  }


  @Post('/combine')
  @UseGuards(JwtAuthGuard)
  async bookCombine(@Body() dto:CreateCombinedBookingDto,@GetUser() user:any){
    const userId = user.userId;
    dto.bookedBy = userId
    return this.bookingService.createCombinedBooking(dto)
  }

  @Get('/my')
  @UseGuards(JwtAuthGuard)
  async getUserBookings(@GetUser() user: any) {
    const userId = user.userId;
    return this.bookingService.getUserBookings(userId);
  }
}
