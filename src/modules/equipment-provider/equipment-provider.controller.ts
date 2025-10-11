import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { EquipmentProviderService } from './equipment-provider.service';
import { RegisterEquipmentProviderDto } from './dto/Register-provider.dto';
import { EquipmentProviderLoginDto } from './dto/Login-Provider.Dto';
import { JwtAuthGuard } from 'src/common/guards/jwtAuth.guard';
import { RolesGuard } from 'src/common/guards/roles.guards';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from 'src/common/enums/roles.enum';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateEquipmentDto } from './dto/create-equipment.Dto';
import { GetUser } from 'src/common/decorators/getUser.decorator';
import { Types } from 'mongoose';

@ApiTags('Equipment-Provider')
@Controller('equipment-provider')
export class EquipmentProviderController {
  constructor(private readonly service: EquipmentProviderService) {}

  @Post('signup')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Register a new Equipment Provider (Admin Only)' })
  @ApiBearerAuth() // <-- Shows JWT auth button in Swagger
  @ApiResponse({
    status: 201,
    description: 'Provider registered successfully.',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error or duplicate email.',
  })
  async create(@Body() dto: RegisterEquipmentProviderDto) {
    return this.service.create(dto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Login Equipment Provider and get JWT token' })
  @ApiResponse({
    status: 200,
    description: 'Login successful, returns JWT token.',
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials.' })
  async Login(@Body() dto: EquipmentProviderLoginDto) {
    return this.service.login(dto);
  }

  @Get('listall')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'List all equipment providers (Admin Only)' })
  @ApiBearerAuth()
  @ApiResponse({
    status: 200,
    description: 'Returns all registered providers (excluding passwords).',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden: Requires admin access.',
  })
  async listAll() {
    return this.service.listAll();
  }

  @Post('changePass')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.EQUIPMENT_PROVIDER, UserRole.ADMIN)
  async changePassword(
    @Body('newPassword') newPassword: string,
    @GetUser() user: any,
  ) {
    const userId = user.userId;
    return this.service.chnagePassword(userId, newPassword);
  }

  @Post('create/equipment')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.EQUIPMENT_PROVIDER)
  @ApiOperation({
    summary: 'Create new equipment (Equipment Provider / Admin)',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('image'))
  @ApiResponse({ status: 201, description: 'Equipment created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request or missing image' })
  async createEquipment(
    @Body() dto: CreateEquipmentDto,
    @UploadedFile() file: Express.Multer.File,
    @GetUser() user: any,
  ) {
    const providerId = user.userId;
    console.log(providerId);
    return this.service.createEquipment(providerId, dto, file);
  }

  @ApiOperation({
    summary: 'fetch all equipments',
  })
  @Get('/list-equipments')
  async ListAllEquipments() {
    return this.service.listAllEquipments();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.EQUIPMENT_PROVIDER)
  @ApiOperation({
    summary: 'fetch all equipments of a equipment provider',
  })
  @Get('/me/equipments')
  async ListAllEquipmentsOfAProvider(@GetUser() user: any) {
    const providerId = user.userId;
    console.log(providerId);
    return this.service.listEquipmentBYProvider(providerId);
  }

  @Get('equipment/:id')
  async getEquipmentById(@Param('id') id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Invalid equipment Id');
    }
    const equipment = await this.service.getEquipment(id);
    if (!equipment) {
      throw new NotFoundException('Equipment not found');
    }
    return {
      message: 'Equipment fetched successfully',
      data: equipment,
    };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.EQUIPMENT_PROVIDER)
  @Delete('equipment/:id')
  async deleteEquipmentById(@Param('id') id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Invalid equipment Id');
    }
    return this.service.deleteEquipment(id);
  }
}
