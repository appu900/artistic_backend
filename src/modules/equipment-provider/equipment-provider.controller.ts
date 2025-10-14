import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
  Req,
  Query,
  ValidationPipe
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiBearerAuth,
  ApiProperty,
  ApiPropertyOptional
} from '@nestjs/swagger';
import { 
  IsEmail, 
  IsNotEmpty, 
  IsString, 
  IsOptional 
} from 'class-validator';
import { JwtAuthGuard } from 'src/common/guards/jwtAuth.guard';
import { RolesGuard } from 'src/common/guards/roles.guards';
import { Roles } from 'src/common/decorators/roles.decorator';
import { GetUser } from 'src/common/decorators/getUser.decorator';
import { UserRole } from 'src/common/enums/roles.enum';
import { 
  EquipmentProviderService,
  CreateEquipmentProviderRequest,
  UpdateEquipmentProviderProfileRequest
} from './equipment-provider.service';

export class CreateEquipmentProviderDto {
  @ApiProperty({ example: 'John' })
  @IsNotEmpty()
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsNotEmpty()
  @IsString()
  lastName: string;

  @ApiProperty({ example: 'provider@example.com' })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({ example: '+1234567890' })
  @IsNotEmpty()
  @IsString()
  phoneNumber: string;

  @ApiPropertyOptional({ example: 'Equipment Solutions Inc' })
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiPropertyOptional({ example: 'Professional audio and lighting equipment rental' })
  @IsOptional()
  @IsString()
  businessDescription?: string;
}

export class UpdateProfileDto {
  companyName?: string;
  businessDescription?: string;
  businessAddress?: string;
  website?: string;
  serviceAreas?: string[];
  specializations?: string[];
  yearsInBusiness?: number;
}

export class ChangePasswordDto {
  newPassword: string;
}

@ApiTags('Equipment-Provider')
@Controller('equipment-provider')
export class EquipmentProviderController {
  constructor(private readonly equipmentProviderService: EquipmentProviderService) {}

  @Post('')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new equipment provider (Admin only)' })
  @ApiResponse({ status: 201, description: 'Equipment provider created successfully' })
  async createEquipmentProvider(
    @Body(ValidationPipe) createDto: CreateEquipmentProviderDto,
    @GetUser('userId') adminId: string
  ) {
    console.log('Received DTO:', createDto); 
    return this.equipmentProviderService.createEquipmentProvider(createDto, adminId);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all equipment providers (Admin only)' })
  async getAllEquipmentProviders() {
    return this.equipmentProviderService.getAllEquipmentProviders();
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get equipment provider statistics (Admin only)' })
  async getEquipmentProviderStats() {
    return this.equipmentProviderService.getEquipmentProviderStats();
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.EQUIPMENT_PROVIDER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get own profile (Equipment Provider only)' })
  async getOwnProfile(@GetUser('userId') userId: string) {
    return this.equipmentProviderService.getEquipmentProviderById(userId);
  }

  @Put('profile')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.EQUIPMENT_PROVIDER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update own profile (Equipment Provider only)' })
  async updateOwnProfile(
    @GetUser('userId') userId: string,
    @Body() updateDto: UpdateProfileDto
  ) {
    return this.equipmentProviderService.updateEquipmentProviderProfile(userId, updateDto);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.EQUIPMENT_PROVIDER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change password (Equipment Provider only)' })
  async changePassword(
    @GetUser('userId') userId: string,
    @Body() changePasswordDto: ChangePasswordDto
  ) {
    return this.equipmentProviderService.changePassword(userId, changePasswordDto.newPassword);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get equipment provider by ID (Admin only)' })
  async getEquipmentProviderById(@Param('id') id: string) {
    return this.equipmentProviderService.getEquipmentProviderById(id);
  }

  @Put(':id/toggle-status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle equipment provider status (Admin only)' })
  async toggleProviderStatus(@Param('id') id: string) {
    return this.equipmentProviderService.toggleProviderStatus(id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete equipment provider (Super Admin only)' })
  async deleteEquipmentProvider(@Param('id') id: string) {
    return this.equipmentProviderService.deleteEquipmentProvider(id);
  }


  
}