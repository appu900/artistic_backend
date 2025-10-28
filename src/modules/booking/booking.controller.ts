import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { BookingService } from './booking.service';
import { CreateArtistBookingDto, CreateCombinedBookingDto, CreateEquipmentBookingDto, CalculatePricingDto } from './dto/booking.dto';
import { GetUser } from 'src/common/decorators/getUser.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwtAuth.guard';

@Controller('bookings')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Post('/calculate-pricing')
  async calculateBookingPricing(@Body() dto: CalculatePricingDto) {
    return this.bookingService.calculateBookingPricing(dto);
  }

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

  @Get('/debug/artist/:artistId/unavailable-data')
  async debugArtistUnavailableData(
    @Param('artistId') artistId: string,
  ) {
    return this.bookingService.debugArtistUnavailableData(artistId);
  }

  @Get('/debug/verify-artist-profile/:artistId')
  async verifyArtistProfile(@Param('artistId') artistId: string) {
    return this.bookingService.verifyArtistProfile(artistId);
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
    const userEmail = user.email
    return this.bookingService.createArtistBooking(dto,userEmail);
  }

  @Post('/equipment')
  @UseGuards(JwtAuthGuard)
  async createEquipmentBooking(
    @Body() dto: CreateEquipmentBookingDto,
    @GetUser() user: any,
  ) {
    const userId = user.userId;
    const userEmail = user.email;
    dto.bookedBy = userId;
    return this.bookingService.createEquipmentBooking(dto,userEmail);
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

  @Get('/artist/my')
  @UseGuards(JwtAuthGuard)
  async getArtistOwnBookings(@GetUser() user: any) {
    const artistUserId = user.userId;
    return this.bookingService.getArtistOwnBookings(artistUserId);
  }

  // Artist analytics and stats
  @Get('/artist/analytics')
  @UseGuards(JwtAuthGuard)
  async getArtistAnalytics(@GetUser() user: any) {
    const artistUserId = user.userId;
    return this.bookingService.getArtistAnalytics(artistUserId);
  }

  @Get('/equipment/my')
  @UseGuards(JwtAuthGuard)
  async getMyEquipmentBookings(
    @GetUser() user: any,
    @Query('status') status?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    const userId = user.userId;
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.max(parseInt(limit, 10) || 10, 1);
    return this.bookingService.getMyEquipmentBookings(userId, status, pageNum, limitNum);
  }

  @Get('/debug/check-user-role/:userId')
  async checkUserRole(@Param('userId') userId: string) {
    return this.bookingService.checkUserRoleAndProfile(userId);
  }

  @Post('/debug/create-missing-artist-profile/:userId')
  async createMissingArtistProfile(@Param('userId') userId: string) {
    return this.bookingService.createMissingArtistProfile(userId);
  }
}
