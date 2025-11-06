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
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TestimonialService } from './testimonial.service';
import {
  CreateTestimonialDto,
  UpdateTestimonialDto,
  UpdateTestimonialOrderDto,
} from './dto/testimonial.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { S3Service } from '../../infrastructure/s3/s3.service';

@ApiTags('Testimonial Management')
@Controller('testimonials')
export class TestimonialController {
  constructor(
    private readonly testimonialService: TestimonialService,
    private readonly s3Service: S3Service,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new testimonial' })
  @ApiResponse({ status: 201, description: 'Testimonial created successfully' })
  async createTestimonial(
    @Body() createTestimonialDto: CreateTestimonialDto,
  ) {
    const userId = '507f1f77bcf86cd799439011'; // Dummy admin ID
    const testimonial = await this.testimonialService.createTestimonial(
      userId,
      createTestimonialDto,
    );
    return {
      message: 'Testimonial created successfully',
      testimonial,
    };
  }

  @Post('upload')
  @ApiOperation({ summary: 'Upload testimonial avatar to S3' })
  @UseInterceptors(FileInterceptor('avatar'))
  async uploadAvatar(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      return { message: 'No file uploaded' };
    }
    const url = await this.s3Service.uploadFile(file, 'testimonials');
    return { url };
  }

  @Get()
  @ApiOperation({ summary: 'Get all testimonials with pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  async getAllTestimonials(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('isActive') isActive?: string,
  ) {
    const isActiveFilter =
      isActive !== undefined ? isActive === 'true' : undefined;
    
    return await this.testimonialService.getAllTestimonials(page, limit, isActiveFilter);
  }

  @Get('active')
  @ApiOperation({ summary: 'Get all active testimonials for public display' })
  @ApiResponse({ status: 200, description: 'Active testimonials retrieved successfully' })
  async getActiveTestimonials() {
    const testimonials = await this.testimonialService.getActiveTestimonials();
    return {
      testimonials,
      count: testimonials.length,
    };
  }

  @Put('reorder')
  @ApiOperation({ summary: 'Reorder testimonials' })
  @ApiResponse({ status: 200, description: 'Testimonials reordered successfully' })
  async updateTestimonialOrder(
    @Body() updates: UpdateTestimonialOrderDto[],
  ) {
    const userId = '507f1f77bcf86cd799439011'; // Dummy admin ID
    await this.testimonialService.updateTestimonialOrder(userId, updates);
    return {
      message: 'Testimonials reordered successfully',
    };
  }

  @Put(':id/toggle-status')
  @ApiOperation({ summary: 'Toggle testimonial active status' })
  @ApiResponse({ status: 200, description: 'Testimonial status updated successfully' })
  async toggleTestimonialStatus(@Param('id') id: string) {
    const userId = '507f1f77bcf86cd799439011'; // Dummy admin ID
    const testimonial = await this.testimonialService.toggleTestimonialStatus(id, userId);
    return {
      message: 'Testimonial status updated successfully',
      testimonial,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get testimonial by ID' })
  @ApiResponse({ status: 200, description: 'Testimonial retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Testimonial not found' })
  async getTestimonialById(@Param('id') id: string) {
    const testimonial = await this.testimonialService.getTestimonialById(id);
    return {
      testimonial,
    };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update testimonial' })
  @ApiResponse({ status: 200, description: 'Testimonial updated successfully' })
  @ApiResponse({ status: 404, description: 'Testimonial not found' })
  async updateTestimonial(
    @Param('id') id: string,
    @Body() updateTestimonialDto: UpdateTestimonialDto,
  ) {
    const userId = '507f1f77bcf86cd799439011'; // Dummy admin ID
    const testimonial = await this.testimonialService.updateTestimonial(
      id,
      userId,
      updateTestimonialDto,
    );
    return {
      message: 'Testimonial updated successfully',
      testimonial,
    };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete testimonial' })
  @ApiResponse({ status: 200, description: 'Testimonial deleted successfully' })
  @ApiResponse({ status: 404, description: 'Testimonial not found' })
  async deleteTestimonial(@Param('id') id: string) {
    const userId = '507f1f77bcf86cd799439011'; // Dummy admin ID
    await this.testimonialService.deleteTestimonial(id, userId);
    return {
      message: 'Testimonial deleted successfully',
    };
  }
}
