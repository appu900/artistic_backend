import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  EquipmentPackage,
  EquipmentPackageDocument,
  PackageStatus,
  PackageVisibility,
} from 'src/infrastructure/database/schemas/equipment-package.schema';
import { CreateEquipmentDto } from '../equipment-provider/dto/create-equipment.Dto';
import { CreateEquipmentPackageDto } from './dto/create-equipment-paackge.dto';
import { User, UserDocument } from 'src/infrastructure/database/schemas';
import {
  Equipment,
  EquipmentDocument,
} from 'src/infrastructure/database/schemas/equipment.schema';

@Injectable()
export class EquipmentPackagesService {
  constructor(
    @InjectModel(EquipmentPackage.name)
    private readonly packageModel: Model<EquipmentPackageDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Equipment.name)
    private readonly equipmentModel: Model<EquipmentDocument>,
  ) {}

  async createPackage(userId: string, dto: CreateEquipmentPackageDto, role:string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User Not Found');
    for (const item of dto.items) {
      const eq = await this.equipmentModel.findById(item.equipmentId);
      console.log(`equipment not found with the ${item.equipmentId}`);
      if (!eq) throw new BadRequestException('Invalid equipment provided');
    }

    const pkg = await this.packageModel.create({
      ...dto,
      createdBy: user.id,
      status: role == "ADMIN"? PackageStatus.APPROVED: PackageStatus.PENDING_REVIEW,
      visibility: PackageVisibility.OFFLINE,
      roleRef:role
    });
    return { message: 'Packge draft created sucessfully', pkg };
  }

  async submitforReview(providerId: string, packageId: string) {
    const pkg = await this.packageModel.findById(packageId);
    if (!pkg)
      throw new NotFoundException('Pakckage not found something went wrong');

    // check if the admin is submitting the packages for approved or review prevent this
    if (pkg.createdBy.toString() !== providerId) {
      throw new ForbiddenException('You can not submit your own packages');
    }
    if (
      pkg.status !== PackageStatus.DRAFT &&
      pkg.status !== PackageStatus.REJECTED
    ) {
      throw new BadRequestException('Packge already under review or approved');
    }

    pkg.status = PackageStatus.PENDING_REVIEW;
    await pkg.save();
    return { message: 'package submitted for admin review', pkg };
  }


  async getAllPackgesWithPendingReview(){
    return this.packageModel.find({})
  }

  async starReview(adminId: string, packageId: string) {
    const pkg = await this.packageModel.findById(packageId);
    if (!pkg) throw new NotFoundException('Package not found');
    pkg.status = PackageStatus.UNDER_REVIEW;
    await pkg.save();
    return { message: 'Package marked as under review', pkg };
  }

  async ApprovedPackage(adminId: string, packageId: string) {
    const pkg = await this.packageModel.findById(packageId);
    if (!pkg) throw new NotFoundException('Packge not found');
    pkg.status = PackageStatus.APPROVED;
    pkg.visibility = PackageVisibility.OFFLINE;
    await pkg.save();
    return { message: 'Package approved successfully', pkg };
  }

  async rejectPakage(adminId: string, packageId: string, reason?: string) {
    const pkg = await this.packageModel.findById(packageId);
    if (!pkg) throw new NotFoundException('Package not found');
    if(pkg.visibility == 'online'){
      throw new ForbiddenException("The package is now live u cant rehect it now")
    }
    pkg.status = PackageStatus.REJECTED;
    pkg.adminNotes = reason || 'No reason specified';
    await pkg.save();
    return { message: 'package rejected', pkg };
  }

  async toggelVisibility(adminId: string, packageId: string, online: boolean) {
    const pkg = await this.packageModel.findById(packageId);
    if (!pkg) throw new NotFoundException('Package not found');

    if (pkg.status !== PackageStatus.APPROVED) {
      throw new BadRequestException('only approved packages can be published');
    }

    pkg.visibility = online
      ? PackageVisibility.ONLINE
      : PackageVisibility.OFFLINE;
    await pkg.save();
    return {
      message: `Package is now ${online ? 'ONLINE' : 'OFFLINE'}`,
    };
  }

  async getPackgesWithStatus(status: PackageStatus) {
    return await this.packageModel.find({ status: status });
  }

  async getAllPublicVisiblePackages(){
    return await this.packageModel.find({visibility:PackageVisibility.ONLINE,status:PackageStatus.APPROVED})
  }

  async getAllpackagesByEquipmentProviderId(providerId: string) {
    return await this.packageModel.find({ createdBy: providerId });
  }

  async listPublicPackages() {
    return await this.packageModel.find({
      status: PackageStatus.APPROVED,
      visibility: PackageVisibility.ONLINE,
    });
  }
}
