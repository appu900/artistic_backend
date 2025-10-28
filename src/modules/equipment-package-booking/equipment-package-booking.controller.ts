import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Patch,
  UseGuards,
  Query,
} from '@nestjs/common';
import { EquipmentPackageBookingService } from './equipment-package-booking.service';
import { CreateEquipmentPackageBookingDto, UpdateEquipmentPackageBookingStatusDto } from '../equipment-packages/dto/equipment-package-booking.dto';
import { JwtAuthGuard } from '../../common/guards/jwtAuth.guard';
import { GetUser } from '../../common/decorators/getUser.decorator';

@Controller('equipment-package-booking')
@UseGuards(JwtAuthGuard)
export class EquipmentPackageBookingController {
  constructor(
    private readonly packageBookingService: EquipmentPackageBookingService,
  ) {}

  @Post('create')
  async createBooking(
    @GetUser() user: any,
    @Body() dto: CreateEquipmentPackageBookingDto,
  ) {
    return this.packageBookingService.createBooking(user.userId, dto);
  }

  @Get('my-bookings')
  async getMyBookings(
    @GetUser() user: any,
    @Query('status') status?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.packageBookingService.getUserBookings(
      user.userId,
      status,
      page,
      limit,
    );
  }

  @Get('provider-bookings')
  async getProviderBookings(
    @GetUser() user: any,
    @Query('status') status?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.packageBookingService.getProviderBookings(
      user.userId,
      status,
      page,
      limit,
    );
  }

  @Get(':id')
  async getBookingById(
    @GetUser() user: any,
    @Param('id') bookingId: string,
  ) {
    return this.packageBookingService.getBookingById(bookingId, user.userId);
  }

  @Patch(':id/status')
  async updateBookingStatus(
    @GetUser() user: any,
    @Param('id') bookingId: string,
    @Body() dto: UpdateEquipmentPackageBookingStatusDto,
  ) {
    return this.packageBookingService.updateBookingStatus(
      bookingId,
      user.userId,
      dto,
    );
  }

  @Get('check-availability/:packageId')
  async checkPackageAvailability(
    @GetUser() user: any,
    @Param('packageId') packageId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.packageBookingService.checkPackageAvailability(
      packageId,
      startDate,
      endDate,
      user?.userId,
    );
  }

  // Admin endpoints
  @Get('admin/all')
  async getAllBookingsForAdmin(
    @GetUser() user: any,
    @Query('status') status?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.packageBookingService.getAllBookingsForAdmin(
      status,
      page,
      limit,
    );
  }
}