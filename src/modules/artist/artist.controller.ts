import {
  Body,
  Controller,
  Get,
  Post,
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
} from '@nestjs/swagger';
import { CreateArtistDto } from './dto/create-artist.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from 'src/common/guards/roles.guards';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from 'src/common/enums/roles.enum';
import { JwtAuthGuard } from 'src/common/guards/jwtAuth.guard';

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
}

