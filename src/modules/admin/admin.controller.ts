import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from 'src/common/enums/roles.enum';
import { JwtAuthGuard } from 'src/common/guards/jwtAuth.guard';
import { RolesGuard } from 'src/common/guards/roles.guards';
import { AdminService } from './admin.service';
import { CreateArtistTypeDto } from './dto/Artist-type.dto';
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
  @Post('add-artist-type')
  @ApiOperation({ summary: 'Register a new artist Type' })
  @ApiResponse({ status: 201, description: 'User successfully registered' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async createArtistType(@Body() createArtistTypePayload: CreateArtistTypeDto) {
    return this.adminService.createArtistType(createArtistTypePayload);
  }

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
}
