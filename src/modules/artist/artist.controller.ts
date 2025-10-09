import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ArtistService } from './artist.service';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
} from '@nestjs/swagger';
import { CreateArtistDto } from './dto/create-artist.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from 'src/common/guards/roles.guards';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from 'src/common/enums/roles.enum';
import { JwtAuthGuard } from 'src/common/guards/jwtAuth.guard';
import { UpdateArtistProfileDto } from './dto/profile-update-request.dto';
import { GetUser } from 'src/common/decorators/getUser.decorator';

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
      { name: 'demoVideo', maxCount: 1 },
    ]),
  )
  createArtistByAdmin(
    @Body() payload: CreateArtistDto,
    @UploadedFiles()
    files: {
      profileImage?: Express.Multer.File[];
      profileCoverImage?: Express.Multer.File[];
      demoVideo?: Express.Multer.File[];
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

  @ApiOperation({ summary: 'fetch all Artist details for admins' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get('list/private')
  listAllArtist_PRIVATE() {
    return this.artistService.ListAllArtist_PRIVATE();
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
      { name: 'demoVideo', maxCount: 1 },
    ]),
  )
  async requestProfileUpdate(
    @Body() payload: UpdateArtistProfileDto,
    @UploadedFiles()
    files: {
      profileImage?: Express.Multer.File[];
      profileCoverImage?: Express.Multer.File[];
      demoVideo?: Express.Multer.File[];
    },
    @GetUser() user:any,
  ) {
    const artistId = user.userId
    if (!artistId) {
      throw new BadRequestException('Please login and try again');
    }
    return this.artistService.requestProfileUpdate(artistId, payload, files);
  }

  @Get('profile/update/pending-request')
  @ApiOperation({ summary: 'List all pending profile update requests' })
  @UseGuards(JwtAuthGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getPendingProfileUpdateRequests() {
    return this.artistService.getPendingRequests();
  }

  @Post('/profile/review-update/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Approve or reject artist profile update request' })
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async reviewProfileUpdate(
    @Param('id') id: string,
    @Query('approve') approve: string,
    @Body('comment') comment: string,
    @Req() req,
  ) {
    const isApproved = approve === "true";
    return this.artistService.reviewProflileUpdateRequest(req.user.sub,id,isApproved,comment)
  }
}
