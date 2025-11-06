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
import { SponsorService } from './sponsor.service';
import {
  CreateSponsorDto,
  UpdateSponsorDto,
  UpdateSponsorOrderDto,
} from './dto/sponsor.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { S3Service } from '../../infrastructure/s3/s3.service';

@ApiTags('Sponsor Management')
@Controller('sponsors')
export class SponsorController {
  constructor(
    private readonly sponsorService: SponsorService,
    private readonly s3Service: S3Service,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new sponsor' })
  @ApiResponse({ status: 201, description: 'Sponsor created successfully' })
  async createSponsor(
    @Body() createSponsorDto: CreateSponsorDto,
  ) {
    const userId = '507f1f77bcf86cd799439011'; // Dummy admin ID
    const sponsor = await this.sponsorService.createSponsor(
      userId,
      createSponsorDto,
    );
    return {
      message: 'Sponsor created successfully',
      sponsor,
    };
  }

  @Post('upload')
  @ApiOperation({ summary: 'Upload sponsor logo to S3' })
  @UseInterceptors(FileInterceptor('logo'))
  async uploadLogo(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      return { message: 'No file uploaded' };
    }
    const url = await this.s3Service.uploadFile(file, 'sponsors');
    return { url };
  }

  @Get()
  @ApiOperation({ summary: 'Get all sponsors with pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({ name: 'tier', required: false, type: String })
  async getAllSponsors(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('isActive') isActive?: string,
    @Query('tier') tier?: string,
  ) {
    const isActiveFilter =
      isActive !== undefined ? isActive === 'true' : undefined;
    
    return await this.sponsorService.getAllSponsors(page, limit, isActiveFilter, tier);
  }

  @Get('active')
  @ApiOperation({ summary: 'Get all active sponsors for public display' })
  @ApiResponse({ status: 200, description: 'Active sponsors retrieved successfully' })
  async getActiveSponsors() {
    const sponsors = await this.sponsorService.getActiveSponsors();
    return {
      sponsors,
      count: sponsors.length,
    };
  }

  @Put('reorder')
  @ApiOperation({ summary: 'Reorder sponsors' })
  @ApiResponse({ status: 200, description: 'Sponsors reordered successfully' })
  async updateSponsorOrder(
    @Body() updates: UpdateSponsorOrderDto[],
  ) {
    const userId = '507f1f77bcf86cd799439011'; // Dummy admin ID
    await this.sponsorService.updateSponsorOrder(userId, updates);
    return {
      message: 'Sponsors reordered successfully',
    };
  }

  @Put(':id/toggle-status')
  @ApiOperation({ summary: 'Toggle sponsor active status' })
  @ApiResponse({ status: 200, description: 'Sponsor status updated successfully' })
  async toggleSponsorStatus(@Param('id') id: string) {
    const userId = '507f1f77bcf86cd799439011'; // Dummy admin ID
    const sponsor = await this.sponsorService.toggleSponsorStatus(id, userId);
    return {
      message: 'Sponsor status updated successfully',
      sponsor,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get sponsor by ID' })
  @ApiResponse({ status: 200, description: 'Sponsor retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Sponsor not found' })
  async getSponsorById(@Param('id') id: string) {
    const sponsor = await this.sponsorService.getSponsorById(id);
    return {
      sponsor,
    };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update sponsor' })
  @ApiResponse({ status: 200, description: 'Sponsor updated successfully' })
  @ApiResponse({ status: 404, description: 'Sponsor not found' })
  async updateSponsor(
    @Param('id') id: string,
    @Body() updateSponsorDto: UpdateSponsorDto,
  ) {
    const userId = '507f1f77bcf86cd799439011'; // Dummy admin ID
    const sponsor = await this.sponsorService.updateSponsor(
      id,
      userId,
      updateSponsorDto,
    );
    return {
      message: 'Sponsor updated successfully',
      sponsor,
    };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete sponsor' })
  @ApiResponse({ status: 200, description: 'Sponsor deleted successfully' })
  @ApiResponse({ status: 404, description: 'Sponsor not found' })
  async deleteSponsor(@Param('id') id: string) {
    const userId = '507f1f77bcf86cd799439011'; // Dummy admin ID
    await this.sponsorService.deleteSponsor(id, userId);
    return {
      message: 'Sponsor deleted successfully',
    };
  }
}
