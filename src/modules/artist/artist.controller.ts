import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  FileFieldsInterceptor,
  FileInterceptor,
} from '@nestjs/platform-express';
import { ArtistService } from './artist.service';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
} from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { CreateArtistDto } from './dto/create-artist.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from 'src/common/guards/roles.guards';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from 'src/common/enums/roles.enum';
import { JwtAuthGuard } from 'src/common/guards/jwtAuth.guard';
import { UpdateArtistProfileDto } from './dto/profile-update-request.dto';
import { GetUser } from 'src/common/decorators/getUser.decorator';
import { CreateArtistApplicationDto } from './dto/artist-application.dto';
import { ApplicationStatus } from 'src/infrastructure/database/schemas/artist-application.schema';
import { CreatePortfolioItemDto, ReviewPortfolioItemDto } from './dto/portfolio-item.dto';
import { PortfolioItemStatus } from 'src/infrastructure/database/schemas/portfolio-item.schema';

@ApiTags('artist')
@Controller('artist')
export class ArtistController {
  constructor(private readonly artistService: ArtistService) {}

  @Get('list-types')
  @ApiOperation({ summary: 'fetch all Artist Type' })
  listAllArtistType() {
    return this.artistService.listAllArtistType();
  }

  @Post('/onboard')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'profileImage', maxCount: 1 },
      { name: 'profileCoverImage', maxCount: 1 },
    ]),
  )
  createArtistByAdmin(
    @Body() payload: CreateArtistDto,
    @UploadedFiles()
    files: {
      profileImage?: Express.Multer.File[];
      profileCoverImage?: Express.Multer.File[];
    },
    @Req() req,
  ) {
    const adminId = req.user.sub;
    return this.artistService.createArtistByAdmin(payload, adminId, files);
  }

  @ApiOperation({ summary: 'fetch all Artist details for user' })
  @Get('list/public')
  listAllArtist_PUBLIC() {
    return this.artistService.listAllArtist_PUBLIC();
  }

  @Get('profile/me')
  @ApiOperation({ summary: 'Get current artist\'s profile' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ARTIST)
  async getMyProfile(@GetUser() user: any) {
    const artistId = user.userId;
    if (!artistId) {
      throw new BadRequestException('Please login and try again');
    }
    return this.artistService.getArtistProfileByUserId(artistId);
  }

  @Get('profile/:id')
  @ApiOperation({ summary: 'Get artist profile by profile ID (public)' })
  async getArtistProfileById(@Param('id') profileId: string) {
    return this.artistService.getArtistProfileById(profileId);
  }

  @ApiOperation({ summary: 'fetch all Artist details for admins' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get('list/private')
  listAllArtist_PRIVATE() {
    return this.artistService.ListAllArtist_PRIVATE();
  }

  @Get('profile/:id')
  @ApiOperation({ summary: 'Get public artist profile by ID' })
  async getArtistProfile(@Param('id') id: string) {
    return this.artistService.getArtistProfileById(id);
  }

  @Post('profile/update-request')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ARTIST)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Artist can request limited profile updates' })
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'profileImage', maxCount: 1 },
      { name: 'profileCoverImage', maxCount: 1 },
    ]),
  )
  async requestProfileUpdate(
    @Body() payload: UpdateArtistProfileDto,
    @UploadedFiles()
    files: {
      profileImage?: Express.Multer.File[];
      profileCoverImage?: Express.Multer.File[];
    },
    @GetUser() user: any,
  ) {
    const artistId = user.userId;
    if (!artistId) {
      throw new BadRequestException('Please login and try again');
    }
    return this.artistService.requestProfileUpdate(artistId, payload, files);
  }

  @Get('profile/update/pending-request')
  @ApiOperation({ summary: 'List all pending profile update requests' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getPendingProfileUpdateRequests() {
    return this.artistService.getPendingRequests();
  }

  @Get('profile/update/my-requests')
  @ApiOperation({ summary: 'Get my profile update requests' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ARTIST)
  async getMyProfileUpdateRequests(@GetUser() user: any) {
    const artistId = user.userId;
    if (!artistId) {
      throw new BadRequestException('Please login and try again');
    }
    return this.artistService.getRequestsByArtistId(artistId);
  }

  @Post('/profile/review-update/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Approve or reject artist profile update request' })
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async reviewProfileUpdate(
    @Param('id') id: string,
    @Query('approve') approve: string,
    @Body('comment') comment: string,
    @Req() req,
  ) {
    const isApproved = approve === 'true';
    return this.artistService.reviewProflileUpdateRequest(
      req.user.sub,
      id,
      isApproved,
      comment,
    );
  }

@Post('/submit-application')
@ApiOperation({ summary: 'Submit a new artist application' })
@ApiConsumes('multipart/form-data')
@UseInterceptors(
  FileFieldsInterceptor([
    { name: 'resume', maxCount: 1 },
    { name: 'profileImage', maxCount: 1 },
  ], {
    limits: {
      fileSize: 10 * 1024 * 1024, 
    },
    fileFilter: (req, file, cb) => {
      if (file.fieldname === 'resume') {
        const allowedMimeTypes = [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ];
        
        if (allowedMimeTypes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Only PDF, DOC, and DOCX files are allowed for resume'), false);
        }
      } else if (file.fieldname === 'profileImage') {
        const allowedImageTypes = [
          'image/jpeg',
          'image/jpg',
          'image/png',
          'image/webp'
        ];
        
        if (allowedImageTypes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Only JPEG, PNG, and WebP files are allowed for profile image'), false);
        }
      } else {
        cb(new BadRequestException('Invalid file field'), false);
      }
    },
  })
)
async createApplication(
  @Body() dto: CreateArtistApplicationDto,
  @UploadedFiles() files?: {
    resume?: Express.Multer.File[];
    profileImage?: Express.Multer.File[];
  },
) {
  return this.artistService.createApplication(dto, files);
}
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get('/application')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all artist applications (Admin)' })
  async listAll(@Query('status') status?: ApplicationStatus) {
    return this.artistService.ListAllApplication(status);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Approve or reject an application' })
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: ApplicationStatus,
  ) {
    return this.artistService.updateApplicationStatus(id, status);
  }

  @Get('application/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'fetch a application details' })
  async getApplication(@Param('id') id: string) {
    return this.artistService.getApplicationById(id);
  }

  @Delete('application/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'delete an application' })
  async deleteApplication(@Param('id') id: string) {
    return this.artistService.deleteArtistApplication(id);
  }

  @Patch(':id/verify')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Verify or unverify an artist' })
  async verifyArtist(
    @Param('id') id: string,
    @Body('isVerified') isVerified: boolean,
  ) {
    return this.artistService.verifyArtist(id, isVerified);
  }

  @Patch(':id/visibility')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Toggle artist visibility on homepage' })
  async toggleArtistVisibility(
    @Param('id') id: string,
    @Body('isVisible') isVisible: boolean,
  ) {
    return this.artistService.toggleArtistVisibility(id, isVisible);
  }

  // Portfolio Management Endpoints

  @Post('portfolio/create')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ARTIST)
  @ApiOperation({ summary: 'Upload a new portfolio item for review' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB
    },
    fileFilter: (req, file, cb) => {
      const allowedMimeTypes = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'video/mp4', 'video/avi', 'video/mov', 'video/wmv',
        'audio/mp3', 'audio/wav', 'audio/flac', 'audio/aac'
      ];
      
      if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new BadRequestException('Invalid file type'), false);
      }
    },
  }))
  async createPortfolioItem(
    @Body() dto: CreatePortfolioItemDto,
    @UploadedFile() file: Express.Multer.File,
    @GetUser() user: any,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    const artistUserId = user.userId;
    return this.artistService.createPortfolioItem(artistUserId, dto, file);
  }

  @Get('portfolio/my-items')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ARTIST)
  @ApiOperation({ summary: 'Get my portfolio items' })
  async getMyPortfolioItems(
    @GetUser() user: any,
    @Query('status') status?: PortfolioItemStatus,
  ) {
    const artistUserId = user.userId;
    return this.artistService.getMyPortfolioItems(artistUserId, status);
  }

  @Get('portfolio/public/:artistProfileId')
  @ApiOperation({ summary: 'Get public portfolio items for an artist' })
  async getPublicPortfolioItems(@Param('artistProfileId') artistProfileId: string) {
    return this.artistService.getPublicPortfolioItems(artistProfileId);
  }

  @Get('portfolio/pending-review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get all pending portfolio items for review' })
  async getAllPendingPortfolioItems() {
    return this.artistService.getAllPendingPortfolioItems();
  }

  @Post('portfolio/review/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Approve or reject a portfolio item' })
  async reviewPortfolioItem(
    @Param('id') id: string,
    @Query('approve') approve: string,
    @Body() dto: ReviewPortfolioItemDto,
    @GetUser() user: any,
  ) {
    const adminId = user.userId;
    const isApproved = approve === 'true';
    return this.artistService.reviewPortfolioItem(adminId, id, isApproved, dto.reviewComment);
  }

  @Delete('portfolio/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ARTIST)
  @ApiOperation({ summary: 'Delete my portfolio item' })
  async deletePortfolioItem(
    @Param('id') id: string,
    @GetUser() user: any,
  ) {
    const artistUserId = user.userId;
    return this.artistService.deletePortfolioItem(artistUserId, id);
  }

  @Post('portfolio/:id/view')
  @ApiOperation({ summary: 'Increment portfolio item view count' })
  async incrementPortfolioViews(@Param('id') id: string) {
    return this.artistService.incrementPortfolioViews(id);
  }

  @Post('portfolio/:id/like')
  @ApiOperation({ summary: 'Toggle like on portfolio item' })
  async togglePortfolioLike(
    @Param('id') id: string,
    @Body('increment') increment: boolean,
  ) {
    return this.artistService.togglePortfolioLike(id, increment);
  }
}
