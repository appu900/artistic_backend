import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { S3Service } from '../../infrastructure/s3/s3.service';
import {
  CreateDiscoveryCardDto,
  UpdateDiscoveryCardDto,
  UpdateDiscoverySettingsDto,
} from './dto/discovery-carousel.dto';
import { DiscoveryCarouselService } from './discovery-carousel.service';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

@ApiTags('Discovery Carousel')
@Controller('discovery-carousel')
export class DiscoveryCarouselController {
  constructor(
    private readonly discoveryCarouselService: DiscoveryCarouselService,
    private readonly s3Service: S3Service,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get discovery carousel settings and cards' })
  @ApiQuery({ name: 'all', required: false, type: Boolean })
  async getCarousel(@Query('all') all?: string) {
    return this.discoveryCarouselService.getCarouselData(all === 'true');
  }

  @Put()
  @ApiOperation({ summary: 'Update discovery section headline copy' })
  async updateSettings(@Body() dto: UpdateDiscoverySettingsDto) {
    return this.discoveryCarouselService.updateSettings(dto);
  }

  @Post()
  @ApiOperation({ summary: 'Create a discovery carousel card' })
  async createCard(@Body() dto: CreateDiscoveryCardDto) {
    const card = await this.discoveryCarouselService.createCard(dto);
    return card;
  }

  @Patch()
  @ApiOperation({ summary: 'Update a discovery carousel card' })
  async updateCard(@Body() dto: UpdateDiscoveryCardDto) {
    return this.discoveryCarouselService.updateCard(dto);
  }

  @Delete()
  @ApiOperation({ summary: 'Delete a discovery carousel card' })
  @ApiQuery({ name: 'id', required: true, type: String })
  async deleteCard(@Query('id') id?: string) {
    if (!id) {
      throw new BadRequestException('id is required');
    }

    await this.discoveryCarouselService.deleteCard(id);
    return { success: true };
  }

  @Post('upload')
  @ApiOperation({ summary: 'Upload discovery carousel photo or reel to S3' })
  @UseInterceptors(FileInterceptor('file'))
  async uploadMedia(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const isImage = IMAGE_TYPES.has(file.mimetype);
    const isVideo = VIDEO_TYPES.has(file.mimetype);

    if (!isImage && !isVideo) {
      throw new BadRequestException(
        'Unsupported file type. Use JPG, PNG, WebP, MP4, WebM, or MOV.',
      );
    }

    const url = await this.s3Service.uploadFile(file, 'discovery');

    return {
      url,
      mediaType: isVideo ? 'video' : 'image',
    };
  }
}
