import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { EquipmentPackagesService } from './equipment-packages.service';
import { CreateEquipmentPackageDto } from './dto/create-equipment-paackge.dto';
import { GetUser } from 'src/common/decorators/getUser.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwtAuth.guard';
import { RolesGuard } from 'src/common/guards/roles.guards';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from 'src/common/enums/roles.enum';
import { PackageStatus } from 'src/infrastructure/database/schemas/equipment-package.schema';

@Controller('equipment-packages')
export class EquipmentPackagesController {
  constructor(private readonly packageService: EquipmentPackagesService) {}

  @Post('create')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.EQUIPMENT_PROVIDER)
  async createPackage(
    @Body() payload: CreateEquipmentPackageDto,
    @GetUser() user: any,
  ) {
    const userId = user.userId;
    const role = user.role;
    let roleRef = '';
    if (role == 'ADMIN') {
      roleRef = 'ADMIN';
    } else {
      roleRef = 'EQUIPEMNT_PROVIDER';
    }
    return this.packageService.createPackage(userId, payload, roleRef);
  }

  @Post('/approve/:packageId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async approvePackageById(
    @Param('packageId') packageId: string,
    @GetUser() user: any,
  ) {
    if (!packageId) {
      throw new BadRequestException('Package id is required');
    }
    return this.packageService.ApprovedPackage(user.userId, packageId);
  }

  @Post('/reject/:packageId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async rejectPackage(
    @Param('packageId') packageId: string,
    @Body('remarks') remarks: string,
    @GetUser() user: any,
  ) {
    if (!packageId) {
      throw new BadRequestException('Package id is required');
    }
    const adminId = user.userId;
    return this.packageService.rejectPakage(adminId, packageId, remarks);
  }

  @Post('/visibility/:packageId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async toggelVisibility(
    @Param('packageId') packageId: string,
    @Body('visibility') visibility: boolean,
    @GetUser() user: any,
  ) {
    if (!packageId) {
      throw new BadRequestException('Package id is required');
    }
    return this.packageService.toggelVisibility(
      user.userId,
      packageId,
      visibility,
    );
  }

  @Get('/equipment-provider/list')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.EQUIPMENT_PROVIDER)
  async allPackagesByEquipmentProvider(@GetUser() user: any) {
    const providerId = user.userId;
    return this.packageService.getAllpackagesByEquipmentProviderId(providerId);
  }

  @Get('/public')
  async getAllPublicPackages() {
    return this.packageService.getAllPublicVisiblePackages();
  }

  @Get('/pending-review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async getAllPackagesWithPendingReview() {
    return this.packageService.getPackgesWithStatus(
      PackageStatus.PENDING_REVIEW,
    );
  }

  @Post('submit-for-review/:packageId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.EQUIPMENT_PROVIDER)
  async submitPackageForReview(
    @Param('packageId') packageId: string,
    @GetUser() user: any,
  ) {
    if (!packageId) {
      throw new BadRequestException('package id is required');
    }
    const providerId = user.userId;
    if (!providerId) {
      throw new BadRequestException('Please login again and try again');
    }
    return this.packageService.submitforReview(providerId, packageId);
  }
}
