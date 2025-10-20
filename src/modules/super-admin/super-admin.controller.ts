import { Body, Controller, Get, Post, Patch, Delete, Param, UseGuards, Query } from '@nestjs/common';
import { SuperAdminService } from './super-admin.service';
import { CreateAdminDto } from './dto/create.admin.dto';
import { UpdateAdminDto } from './dto/update.admin.dto';
import { JwtAuthGuard } from 'src/common/guards/jwtAuth.guard';
import { RolesGuard } from 'src/common/guards/roles.guards';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from 'src/common/enums/roles.enum';
import { GetUser } from 'src/common/decorators/getUser.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';

@ApiTags('super-admin')
@Controller('super-admin')
@ApiBearerAuth()
export class SuperAdminController {
  constructor(private readonly superAdminService: SuperAdminService) {}

  @Post('/create/admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a new admin user' })
  @ApiResponse({ status: 201, description: 'Admin created successfully' })
  @ApiResponse({ status: 409, description: 'Admin with this email or phone already exists' })
  async createAdmin(@Body() dto: CreateAdminDto, @GetUser() superAdmin: any) {
    return this.superAdminService.createAdmin(dto, superAdmin.id);
  }

  @Get('/list/admins')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get all admin users with pagination and filtering' })
  @ApiResponse({ status: 200, description: 'Admins retrieved successfully' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiQuery({ name: 'search', required: false, description: 'Search by name or email' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by active status' })
  async fetchAllAdmins(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.superAdminService.fetchAllAdmins({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 10,
      search,
      status: status === 'true' ? true : status === 'false' ? false : undefined,
    });
  }

  @Get('/admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get admin details by ID' })
  @ApiResponse({ status: 200, description: 'Admin details retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Admin not found' })
  @ApiParam({ name: 'id', description: 'Admin ID' })
  async getAdminById(@Param('id') id: string) {
    return this.superAdminService.getAdminById(id);
  }

  @Patch('/admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update admin details' })
  @ApiResponse({ status: 200, description: 'Admin updated successfully' })
  @ApiResponse({ status: 404, description: 'Admin not found' })
  @ApiParam({ name: 'id', description: 'Admin ID' })
  async updateAdmin(@Param('id') id: string, @Body() dto: UpdateAdminDto, @GetUser() superAdmin: any) {
    return this.superAdminService.updateAdmin(id, dto, superAdmin.id);
  }

  @Patch('/admin/:id/toggle-status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Toggle admin active status' })
  @ApiResponse({ status: 200, description: 'Admin status updated successfully' })
  @ApiResponse({ status: 404, description: 'Admin not found' })
  @ApiParam({ name: 'id', description: 'Admin ID' })
  async toggleAdminStatus(@Param('id') id: string, @GetUser() superAdmin: any) {
    return this.superAdminService.toggleAdminStatus(id, superAdmin.id);
  }

  @Delete('/admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete an admin user' })
  @ApiResponse({ status: 200, description: 'Admin deleted successfully' })
  @ApiResponse({ status: 404, description: 'Admin not found' })
  @ApiParam({ name: 'id', description: 'Admin ID' })
  async deleteAdmin(@Param('id') id: string, @GetUser() superAdmin: any) {
    return this.superAdminService.deleteAdmin(id, superAdmin.id);
  }

  @Post('/admin/:id/reset-password')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Reset admin password' })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiResponse({ status: 404, description: 'Admin not found' })
  @ApiParam({ name: 'id', description: 'Admin ID' })
  async resetAdminPassword(@Param('id') id: string, @GetUser() superAdmin: any) {
    return this.superAdminService.resetAdminPassword(id, superAdmin.id);
  }
}
