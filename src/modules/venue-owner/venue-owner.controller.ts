import {
  Controller,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  Req,
  Patch,
  Param,
  BadRequestException,
  Get,
  Delete,
} from '@nestjs/common';
import { VenueOwnerService } from './venue-owner.service';
import { CreateVenueOwnerProfileDto } from './dto/create-venue-owner.dto';
import { JwtAuthGuard } from 'src/common/guards/jwtAuth.guard';
import { RolesGuard } from 'src/common/guards/roles.guards';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from 'src/common/enums/roles.enum';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { UpdateVenueOwnerProfileDto } from './dto/update-venue-owner.dto';
import { User } from 'src/infrastructure/database/schemas';
import { GetUser } from 'src/common/decorators/getUser.decorator';
import { CreateVenueOwnerApplicationDto, ReviewVenueOwnerApplicationDto } from './dto/venue-owner-application.dto';

@Controller('venue-owner')
export class VenueOwnerController {
  constructor(private readonly venueOwnerService: VenueOwnerService) {}

  @Post('/onboard')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'profileImage', maxCount: 1 },
      { name: 'coverPhoto', maxCount: 1 },
    ]),
  )
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async create(
    @UploadedFiles()
    files: {
      profileImage?: Express.Multer.File[];
      coverPhoto?: Express.Multer.File[];
    },
    @Body() dto: CreateVenueOwnerProfileDto,
  ) {
    return this.venueOwnerService.create(dto, files);
  }

  @Patch(':userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'profileImage', maxCount: 1 },
      { name: 'coverPhoto', maxCount: 1 },
    ]),
  )
  async updateData(
    @UploadedFiles()
    files: {
      profileImage?: Express.Multer.File[];
      coverPhoto?: Express.Multer.File[];
    },
    @Body() dto: UpdateVenueOwnerProfileDto,
    @Param('userId') userId: string,
  ) {
    if (!userId) {
      throw new BadRequestException('userId is needed');
    }
    return this.venueOwnerService.updateVenueOwnerProfile(userId, dto, files);
  }

  @Get('full')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getAllVenueOwnersWithProfiles() {
    return this.venueOwnerService.getAllVenueOwnersWithProfiles();
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getAllVenueProviders() {
    return this.venueOwnerService.getAllVenueProvidersForAdmin();
  }

  @Get('profile/me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENUE_OWNER)
  async fetchMyProfile(@GetUser() user: any) {
    console.log('Venue Owner profile/me - JWT user payload:', user);
    const userId = user.userId; // This comes from JWT strategy validation
    if (!userId) {
      console.error('No userId found in JWT payload:', user);
      throw new BadRequestException('User ID not found in token');
    }
    return this.venueOwnerService.getVenueOwnerProfileDetails(userId);
  }

  @Get('/profile/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.VENUE_OWNER)
  async fetchProfileDetails(@Param('userId') userId: string) {
    if (!userId) throw new BadRequestException('profile id is required');
    return this.venueOwnerService.getVenueOwnerProfileDetails(userId);
  }



  @Delete(':userId')
  @UseGuards(JwtAuthGuard,RolesGuard)
  @Roles(UserRole.ADMIN,UserRole.SUPER_ADMIN)
  async deleteOwner(@Param('userId') userId:string){
    if(!userId) throw new BadRequestException("userid is required")
    return this.venueOwnerService.delete(userId)
  }

  // --- Venue Owner Application Endpoints ---

  // Public: submit application (multipart)
  @Post('/submit-application')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'license', maxCount: 1 },
      { name: 'venueImage', maxCount: 1 },
    ]),
  )
  async submitVenueOwnerApplication(
    @UploadedFiles()
    files: {
      license?: Express.Multer.File[];
      venueImage?: Express.Multer.File[];
    },
    @Body() dto: CreateVenueOwnerApplicationDto,
  ) {
    return this.venueOwnerService.submitApplication(dto, files);
  }

  // Admin: list applications
  @Get('/application')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async listVenueOwnerApplications() {
    return this.venueOwnerService.listApplications();
  }

  // Admin: review application status
  @Patch('/application/:id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async reviewVenueOwnerApplication(
    @Param('id') id: string,
    @Body() dto: ReviewVenueOwnerApplicationDto,
  ) {
    if (!id) throw new BadRequestException('Application id is required');
    if (!dto?.status) throw new BadRequestException('Status is required');
    return this.venueOwnerService.reviewApplication(id, dto.status);
  }
}
