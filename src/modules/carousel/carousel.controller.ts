import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CarouselService } from './carousel.service';
import {
  CreateCarouselSlideDto,
  UpdateCarouselSlideDto,
  UpdateSlideOrderDto,
} from './dto/carousel-slide.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { S3Service } from '../../infrastructure/s3/s3.service';

@ApiTags('Carousel Management')
@Controller('carousel')
export class CarouselController {
  constructor(
    private readonly carouselService: CarouselService,
    private readonly s3Service: S3Service,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new carousel slide' })
  @ApiResponse({ status: 201, description: 'Carousel slide created successfully' })
  async createSlide(
    @Body() createSlideDto: CreateCarouselSlideDto,
  ) {
    const userId = '507f1f77bcf86cd799439011'; 
    const slide = await this.carouselService.createSlide(
      userId,
      createSlideDto,
    );
    return {
      message: 'Carousel slide created successfully',
      slide,
    };
  }

  @Post('upload')
  @ApiOperation({ summary: 'Upload carousel image to S3' })
  @UseInterceptors(FileInterceptor('image'))
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      return { message: 'No file uploaded' };
    }
    const url = await this.s3Service.uploadFile(file, 'carousel');
    return { url };
  }

  @Get()
  @ApiOperation({ summary: 'Get all carousel slides with pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  async getAllSlides(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('isActive') isActive?: string,
  ) {
    const isActiveFilter =
      isActive !== undefined ? isActive === 'true' : undefined;
    
    return await this.carouselService.getAllSlides(page, limit, isActiveFilter);
  }

  @Get('active')
  @ApiOperation({ summary: 'Get all active carousel slides for public display' })
  @ApiResponse({ status: 200, description: 'Active carousel slides retrieved successfully' })
  async getActiveSlides() {
    const slides = await this.carouselService.getActiveSlides();
    return {
      slides,
      count: slides.length,
    };
  }

  @Put('reorder')
  @ApiOperation({ summary: 'Reorder carousel slides' })
  @ApiResponse({ status: 200, description: 'Carousel slides reordered successfully' })
  async updateSlideOrder(
    @Body() updates: UpdateSlideOrderDto[],
  ) {
    const userId = '507f1f77bcf86cd799439011'; // Dummy admin ID
    await this.carouselService.updateSlideOrder(userId, updates);
    return {
      message: 'Carousel slides reordered successfully',
    };
  }

  @Put(':id/toggle-status')
  @ApiOperation({ summary: 'Toggle carousel slide active status' })
  @ApiResponse({ status: 200, description: 'Carousel slide status updated successfully' })
  async toggleSlideStatus(@Param('id') id: string) {
    const userId = '507f1f77bcf86cd799439011'; // Dummy admin ID
    const slide = await this.carouselService.toggleSlideStatus(
      id,
      userId,
    );
    return {
      message: 'Carousel slide status updated successfully',
      slide,
    };
  }

  @Post(':id/duplicate')
  @ApiOperation({ summary: 'Duplicate carousel slide' })
  @ApiResponse({ status: 201, description: 'Carousel slide duplicated successfully' })
  async duplicateSlide(@Param('id') id: string) {
    const userId = '507f1f77bcf86cd799439011'; // Dummy admin ID
    const slide = await this.carouselService.duplicateSlide(id, userId);
    return {
      message: 'Carousel slide duplicated successfully',
      slide,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get carousel slide by ID' })
  @ApiResponse({ status: 200, description: 'Carousel slide retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Carousel slide not found' })
  async getSlideById(@Param('id') id: string) {
    const slide = await this.carouselService.getSlideById(id);
    return {
      slide,
    };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update carousel slide' })
  @ApiResponse({ status: 200, description: 'Carousel slide updated successfully' })
  @ApiResponse({ status: 404, description: 'Carousel slide not found' })
  async updateSlide(
    @Param('id') id: string,
    @Body() updateSlideDto: UpdateCarouselSlideDto,
  ) {
    const userId = '507f1f77bcf86cd799439011'; // Dummy admin ID
    const slide = await this.carouselService.updateSlide(
      id,
      userId,
      updateSlideDto,
    );
    return {
      message: 'Carousel slide updated successfully',
      slide,
    };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete carousel slide' })
  @ApiResponse({ status: 200, description: 'Carousel slide deleted successfully' })
  @ApiResponse({ status: 404, description: 'Carousel slide not found' })
  async deleteSlide(@Param('id') id: string) {
    const userId = '507f1f77bcf86cd799439011'; // Dummy admin ID
    await this.carouselService.deleteSlide(id, userId);
    return {
      message: 'Carousel slide deleted successfully',
    };
  }
}