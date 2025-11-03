import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from 'src/common/enums/roles.enum';
import { JwtAuthGuard } from 'src/common/guards/jwtAuth.guard';
import { RolesGuard } from 'src/common/guards/roles.guards';
import { AdminService } from './admin.service';
import { CreateEquipmentProviderRequest } from '../equipment-provider/equipment-provider.service';
import { GetUser } from 'src/common/decorators/getUser.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

@ApiTags('admin')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
  ) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post('add-equipment-provider')
  @ApiOperation({ summary: 'Create a new equipment provider' })
  @ApiResponse({ status: 201, description: 'Equipment provider successfully created' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async createEquipmentProvider(
    @Body() createEquipmentProviderData: CreateEquipmentProviderRequest,
    @GetUser() admin: any
  ) {
    return this.adminService.createEquipmentProvider(createEquipmentProviderData, admin.id);
  }

  // Artist Profile Update Management
  @Get('profile-update-requests')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get all pending profile and portfolio update requests' })
  @ApiResponse({ status: 200, description: 'Profile update requests retrieved successfully' })
  async getAllUpdateRequests() {
    return this.adminService.getAllUpdateRequests();
  }

  @Post('profile-update-requests/:id/review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Review and approve/reject a profile update request' })
  @ApiResponse({ status: 200, description: 'Request reviewed successfully' })
  async reviewProfileUpdateRequest(
    @Param('id') requestId: string,
    @Query('approve') approve: string,
    @Body('comment') comment: string,
    @GetUser() admin: any,
  ) {
    const isApproved = approve === 'true';
    return this.adminService.reviewProfileUpdateRequest(
      admin.userId,
      requestId,
      isApproved,
      comment,
    );
  }

  @Post('portfolio-items/:id/review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Review and approve/reject a portfolio item' })
  @ApiResponse({ status: 200, description: 'Portfolio item reviewed successfully' })
  async reviewPortfolioItem(
    @Param('id') portfolioItemId: string,
    @Query('approve') approve: string,
    @Body('reviewComment') reviewComment: string,
    @GetUser() admin: any,
  ) {
    const isApproved = approve === 'true';
    return this.adminService.reviewPortfolioItem(
      admin.userId,
      portfolioItemId,
      isApproved,
      reviewComment,
    );
  }

  // Artist Booking Management
  @Get('bookings/artists')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get all artist bookings with analytics' })
  @ApiResponse({ status: 200, description: 'Artist bookings retrieved successfully' })
  async getArtistBookings(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.adminService.getArtistBookings({
      page: page || 1,
      limit: limit || 10,
      status,
      search,
      startDate,
      endDate,
    });
  }

  // Equipment Booking Management
  @Get('bookings/equipment')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get all equipment bookings (individual and packages) with analytics' })
  @ApiResponse({ status: 200, description: 'Equipment bookings retrieved successfully' })
  async getEquipmentBookings(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.adminService.getEquipmentBookings({
      page: page || 1,
      limit: limit || 10,
      status,
      search,
      startDate,
      endDate,
    });
  }

  // Legacy endpoint for backward compatibility
  @Get('bookings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get all bookings (legacy endpoint)' })
  @ApiResponse({ status: 200, description: 'Bookings retrieved successfully' })
  async getAllBookings(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.adminService.getAllBookings({
      page: page || 1,
      limit: limit || 10,
      status,
      search,
      startDate,
      endDate,
    });
  }

  @Get('equipment-package-bookings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get all equipment package bookings' })
  @ApiResponse({ status: 200, description: 'Equipment package bookings retrieved successfully' })
  async getAllEquipmentPackageBookings(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.adminService.getAllEquipmentPackageBookings({
      page: page || 1,
      limit: limit || 10,
      status,
      search,
      startDate,
      endDate,
    });
  }

  // Payment Management
  @Get('payments/artists')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get all artist payments' })
  @ApiResponse({ status: 200, description: 'Artist payments retrieved successfully' })
  async getArtistPayments(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.adminService.getArtistPayments({
      page: page || 1,
      limit: limit || 10,
      status,
      search,
      startDate,
      endDate,
    });
  }

  @Get('payments/equipment-providers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get all equipment provider payments' })
  @ApiResponse({ status: 200, description: 'Equipment provider payments retrieved successfully' })
  async getEquipmentProviderPayments(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.adminService.getEquipmentProviderPayments({
      page: page || 1,
      limit: limit || 10,
      status,
      search,
      startDate,
      endDate,
    });
  }

  // Detailed booking endpoints
  @Get('bookings/combined/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get detailed combined booking with artist and equipment breakdown' })
  @ApiResponse({ status: 200, description: 'Combined booking details retrieved successfully' })
  async getCombinedBookingDetails(@Param('id') id: string) {
    return this.adminService.getCombinedBookingDetails(id);
  }

  @Get('bookings/equipment-package/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get detailed equipment package booking with breakdown' })
  @ApiResponse({ status: 200, description: 'Equipment package booking details retrieved successfully' })
  async getEquipmentPackageBookingDetails(@Param('id') id: string) {
    return this.adminService.getEquipmentPackageBookingDetails(id);
  }
}
