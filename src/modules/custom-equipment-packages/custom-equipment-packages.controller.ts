import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Patch, 
  Param, 
  Delete, 
  UseGuards,
  Query 
} from '@nestjs/common';
import { CustomEquipmentPackagesService } from './custom-equipment-packages.service';
import { 
  CreateCustomEquipmentPackageDto, 
  UpdateCustomEquipmentPackageDto 
} from './dto/custom-equipment-package.dto';
import { JwtAuthGuard } from '../../common/guards/jwtAuth.guard';
import { GetUser } from '../../common/decorators/getUser.decorator';

@Controller('custom-equipment-packages')
export class CustomEquipmentPackagesController {
  constructor(
    private readonly customEquipmentPackagesService: CustomEquipmentPackagesService
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() createDto: CreateCustomEquipmentPackageDto,
    @GetUser() user: any
  ) {
    return this.customEquipmentPackagesService.create(createDto, user.userId);
  }

  @Get('my-packages')
  @UseGuards(JwtAuthGuard)
  async getUserPackages(
    @GetUser() user: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('search') search?: string
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    
    return this.customEquipmentPackagesService.getUserPackages(
      user.userId, 
      pageNum, 
      limitNum, 
      status, 
      search
    );
  }

  @Get('available-equipment')
  async getAvailableEquipment(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('category') category?: string,
    @Query('search') search?: string
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 50;
    
    return this.customEquipmentPackagesService.getAvailableEquipment(
      pageNum, 
      limitNum, 
      category, 
      search
    );
  }

  @Get('all')
  @UseGuards(JwtAuthGuard)
  async getAllPackages(
    @GetUser() user: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('search') search?: string
  ) {
    console.log('=== /all endpoint called ===');
    console.log('User:', user?.userId);
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    
    return this.customEquipmentPackagesService.getAllPackages(
      pageNum, 
      limitNum, 
      status, 
      search,
      user.userId
    );
  }

  @Get('public')
  async getPublicPackages(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('search') search?: string
  ) {
    console.log('=== /public endpoint called ===');
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    
    return this.customEquipmentPackagesService.getAllPackages(
      pageNum, 
      limitNum, 
      status, 
      search
    );
  }

  @Get('debug/count')
  async getPackageCount() {
    return this.customEquipmentPackagesService.debugGetPackageCount();
  }

  @Get('debug/test-public')
  async testPublicPackages() {
    try {
      console.log('=== Testing public packages endpoint ===');
      const result = await this.customEquipmentPackagesService.getAllPackages(1, 10);
      console.log('Public packages result:', result);
      return {
        success: true,
        result,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error in testPublicPackages:', error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  @Post('debug/create-test-package')
  async createTestPackage() {
    return this.customEquipmentPackagesService.debugCreateTestPackage();
  }

  @Get('debug/auth-test')
  @UseGuards(JwtAuthGuard)
  async testAuthentication(@GetUser() user: any) {
    return {
      success: true,
      message: 'Authentication successful',
      user: {
        userId: user.userId,
        role: user.role,
        email: user.email
      },
      timestamp: new Date().toISOString()
    };
  }

  @Get('debug/no-auth-test')
  async testNoAuthentication() {
    return {
      success: true,
      message: 'No authentication required',
      timestamp: new Date().toISOString()
    };
  }

  @Get('health')
  async healthCheck() {
    return {
      status: 'ok',
      message: 'Custom equipment packages service is running',
      timestamp: new Date().toISOString()
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.customEquipmentPackagesService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateCustomEquipmentPackageDto,
    @GetUser() user: any
  ) {
    return this.customEquipmentPackagesService.update(id, updateDto, user.userId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('id') id: string,
    @GetUser() user: any
  ) {
    return this.customEquipmentPackagesService.remove(id, user.userId);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard)
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @GetUser() user: any
  ) {
    return this.customEquipmentPackagesService.updateStatus(id, status, user.userId);
  }

  @Post('debug-equipment')
  async debugEquipmentStatus(
    @Body('equipmentIds') equipmentIds: string[]
  ) {
    return this.customEquipmentPackagesService.debugEquipmentStatus(equipmentIds);
  }
}