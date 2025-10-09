import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { EquipmentProviderService } from './equipment-provider.service';
import { RegisterEquipmentProviderDto } from './dto/Register-provider.dto';
import { EquipmentProviderLoginDto } from './dto/Login-Provider.Dto';
import { JwtAuthGuard } from 'src/common/guards/jwtAuth.guard';
import { RolesGuard } from 'src/common/guards/roles.guards';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from 'src/common/enums/roles.enum';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';



@ApiTags('Equipment-Provider')
@Controller('equipment-provider')
export class EquipmentProviderController {
  constructor(private readonly service: EquipmentProviderService) {}

  @Post('signup')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Register a new Equipment Provider (Admin Only)' })
  @ApiBearerAuth() // <-- Shows JWT auth button in Swagger
  @ApiResponse({ status: 201, description: 'Provider registered successfully.' })
  @ApiResponse({ status: 400, description: 'Validation error or duplicate email.' })
  async create(@Body() dto: RegisterEquipmentProviderDto) {
    return this.service.create(dto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Login Equipment Provider and get JWT token' })
  @ApiResponse({ status: 200, description: 'Login successful, returns JWT token.' })
  @ApiResponse({ status: 401, description: 'Invalid credentials.' })
  async Login(@Body() dto: EquipmentProviderLoginDto) {
    return this.service.login(dto);
  }


  @Get('listall')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN,UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'List all equipment providers (Admin Only)' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Returns all registered providers (excluding passwords).' })
  @ApiResponse({ status: 403, description: 'Forbidden: Requires admin access.' })
  async listAll() {
    return this.service.listAll();
  }
}
