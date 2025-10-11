import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from 'src/common/enums/roles.enum';
import { JwtAuthGuard } from 'src/common/guards/jwtAuth.guard';
import { RolesGuard } from 'src/common/guards/roles.guards';
import { AdminService } from './admin.service';
import { CreateArtistTypeDto } from './dto/Artist-type.dto';
import { CreateEquipmentProviderRequest } from '../equipment-provider/equipment-provider.service';
import { GetUser } from 'src/common/decorators/getUser.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('add-artist-type')
  @ApiOperation({ summary: 'Register a new artist Type' })
  @ApiResponse({ status: 201, description: 'User successfully registered' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async createArtistType(@Body() createArtistTypePayload: CreateArtistTypeDto) {
    return this.adminService.createArtistType(createArtistTypePayload);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('add-equipment-provider')
  @ApiOperation({ summary: 'Create a new equipment provider' })
  @ApiResponse({ status: 201, description: 'Equipment provider successfully created' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async createEquipmentProvider(
    @Body() createEquipmentProviderData: CreateEquipmentProviderRequest,
    @GetUser() admin: any
  ) {
    return this.adminService.createEquipmentProvider(createEquipmentProviderData, admin.id);
  }
}
