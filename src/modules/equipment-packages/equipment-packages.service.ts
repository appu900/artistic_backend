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
import {
  CustomEquipmentPackage,
  CustomEquipmentPackageDocument,
  CustomPackageStatus,
} from 'src/infrastructure/database/schemas/custom-equipment-package.schema';
import { CreateEquipmentDto } from '../equipment-provider/dto/create-equipment.Dto';
import { CreateEquipmentPackageDto } from './dto/create-equipment-paackge.dto';
import {
  CreateCustomEquipmentPackageDto,
  UpdateCustomEquipmentPackageDto,
} from './dto/custom-equipment-package.dto';
import { User, UserDocument } from 'src/infrastructure/database/schemas';
import {
  Equipment,
  EquipmentDocument,
} from 'src/infrastructure/database/schemas/equipment.schema';
import { S3Service } from 'src/infrastructure/s3/s3.service';

@Injectable()
export class EquipmentPackagesService {
  constructor(
    @InjectModel(EquipmentPackage.name)
    private readonly packageModel: Model<EquipmentPackageDocument>,
    @InjectModel(CustomEquipmentPackage.name)
    private readonly customPackageModel: Model<CustomEquipmentPackageDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Equipment.name)
    private readonly equipmentModel: Model<EquipmentDocument>,
    private readonly s3Service: S3Service,
  ) {}

  async createPackage(userId: string, dto: CreateEquipmentPackageDto, role:string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User Not Found');
    for (const item of dto.items) {
      const eq = await this.equipmentModel.findById(item.equipmentId);
      if (!eq) {
        console.log(`Equipment not found with id: ${item.equipmentId}`);
        throw new BadRequestException('Invalid equipment provided');
      }
    }

    const pkg = await this.packageModel.create({
      ...dto,
      createdBy: user.id,
      status: role == "ADMIN"? PackageStatus.APPROVED: PackageStatus.DRAFT,
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
      .populate('createdBy', 'firstName lastName email')
      .populate({
        path: 'items.equipmentId',
        select: 'name category pricePerDay images'
      });
  }

  async getAllPackagesForAdmin() {
    return this.packageModel.find({})
      .populate('createdBy', 'firstName lastName email')
      .populate({
        path: 'items.equipmentId',
        select: 'name category pricePerDay images'
      })
      .sort({ createdAt: -1 });
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
    return await this.packageModel.find({ status: status })
      .populate('createdBy', 'firstName lastName email')
      .populate({
        path: 'items.equipmentId',
        select: 'name category pricePerDay images'
      });
  }

  async getAllPublicVisiblePackages(){
    return await this.packageModel.find({visibility:PackageVisibility.ONLINE,status:PackageStatus.APPROVED})
      .populate('createdBy', 'firstName lastName email')
      .populate({
        path: 'items.equipmentId',
        select: 'name category pricePerDay images'
      });
  }

  async getAllpackagesByEquipmentProviderId(providerId: string) {
    return await this.packageModel.find({ createdBy: providerId })
      .populate('createdBy', 'firstName lastName email')
      .populate({
        path: 'items.equipmentId',
        select: 'name category pricePerDay images'
      });
  }

  async listPublicPackages() {
    return await this.packageModel.find({
      status: PackageStatus.APPROVED,
      visibility: PackageVisibility.ONLINE,
    })
      .populate('createdBy', 'name email')
      .populate({
        path: 'items.equipmentId',
        select: 'name category pricePerDay images'
      });
  }

  async updatePackage(userId: string, packageId: string, dto: CreateEquipmentPackageDto) {
    const pkg = await this.packageModel.findById(packageId);
    if (!pkg) throw new NotFoundException('Package not found');
    
    if (pkg.createdBy.toString() !== userId) {
      throw new ForbiddenException('You can only update your own packages');
    }

    // Allow updates for:
    // 1. Draft, rejected, or pending_review packages (any visibility)
    // 2. Approved packages that are offline (not visible to customers)
    const canEdit = (
      pkg.status === PackageStatus.DRAFT ||
      pkg.status === PackageStatus.REJECTED ||
      pkg.status === PackageStatus.PENDING_REVIEW ||
      (pkg.status === PackageStatus.APPROVED && pkg.visibility === PackageVisibility.OFFLINE)
    );

    if (!canEdit) {
      throw new BadRequestException('Cannot edit this package. Only draft, rejected, pending review, or approved offline packages can be edited');
    }

    // Validate equipment items
    for (const item of dto.items) {
      const eq = await this.equipmentModel.findById(item.equipmentId);
      if (!eq) {
        throw new BadRequestException('Invalid equipment provided');
      }
    }

    await this.packageModel.findByIdAndUpdate(packageId, {
      ...dto,
      status: PackageStatus.DRAFT, // Reset to draft when updated
    });

    return this.packageModel.findById(packageId)
      .populate('createdBy', 'name email')
      .populate({
        path: 'items.equipmentId',
        select: 'name category pricePerDay images'
      });
  }

  async deletePackage(userId: string, packageId: string) {
    const pkg = await this.packageModel.findById(packageId);
    if (!pkg) throw new NotFoundException('Package not found');
    
    if (pkg.createdBy.toString() !== userId) {
      throw new ForbiddenException('You can only delete your own packages');
    }

    // Allow deletion for:
    // 1. Draft, pending_review, or rejected packages (any visibility)
    // 2. Approved packages that are offline (not visible to customers)
    const canDelete = (
      pkg.status === PackageStatus.DRAFT ||
      pkg.status === PackageStatus.REJECTED ||
      pkg.status === PackageStatus.PENDING_REVIEW ||
      (pkg.status === PackageStatus.APPROVED && pkg.visibility === PackageVisibility.OFFLINE)
    );

    if (!canDelete) {
      throw new BadRequestException('Cannot delete this package. Only draft, pending review, rejected, or approved offline packages can be deleted');
    }

    await this.packageModel.findByIdAndDelete(packageId);
    return { message: 'Package deleted successfully' };
  }

  async getPackageById(packageId: string) {
    const pkg = await this.packageModel.findById(packageId)
      .populate('createdBy', 'firstName lastName email')
      .populate({
        path: 'items.equipmentId',
        select: 'name category pricePerDay images description',
      });

    if (!pkg) {
      throw new NotFoundException('Package not found');
    }

    return pkg;
  }

  async uploadPackageImages(userId: string, packageId: string, images: Express.Multer.File[]) {
    const pkg = await this.packageModel.findById(packageId);
    if (!pkg) throw new NotFoundException('Package not found');
    
    if (pkg.createdBy.toString() !== userId) {
      throw new ForbiddenException('You can only upload images to your own packages');
    }

    // Check if total images (existing + new) exceeds 10
    const currentImageCount = pkg.images?.length || 0;
    if (currentImageCount + images.length > 10) {
      throw new BadRequestException(`Cannot upload ${images.length} images. Maximum 10 images allowed. Currently have ${currentImageCount} images.`);
    }

    const imageUrls: string[] = [];
    for (const image of images) {
      const imageUrl = await this.s3Service.uploadFile(image, 'package-images');
      imageUrls.push(imageUrl);
    }

    // Add new images to existing ones
    pkg.images = [...(pkg.images || []), ...imageUrls];
    await pkg.save();

    return { 
      message: 'Images uploaded successfully', 
      imageUrls,
      totalImages: pkg.images.length 
    };
  }

  async uploadCoverImage(userId: string, packageId: string, coverImage: Express.Multer.File) {
    const pkg = await this.packageModel.findById(packageId);
    if (!pkg) throw new NotFoundException('Package not found');
    
    if (pkg.createdBy.toString() !== userId) {
      throw new ForbiddenException('You can only upload cover image to your own packages');
    }

    // Delete old cover image if exists
    if (pkg.coverImage) {
      try {
        await this.s3Service.deleteFile(pkg.coverImage);
      } catch (error) {
        console.error('Failed to delete old cover image:', error);
      }
    }

    const coverImageUrl = await this.s3Service.uploadFile(coverImage, 'package-covers');
    pkg.coverImage = coverImageUrl;
    await pkg.save();

    return { 
      message: 'Cover image uploaded successfully', 
      coverImageUrl 
    };
  }

  // Custom Equipment Package Methods
  async createCustomPackage(userId: string, dto: CreateCustomEquipmentPackageDto) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User Not Found');

    // Validate equipment exists and calculate total price
    let totalPricePerDay = 0;
    const packageItems: any[] = [];

    for (const item of dto.items) {
      const equipment = await this.equipmentModel.findById(item.equipmentId).populate('provider');
      if (!equipment) {
        throw new BadRequestException(`Equipment with id ${item.equipmentId} not found`);
      }

      const itemTotal = equipment.pricePerDay * item.quantity;
      totalPricePerDay += itemTotal;

      packageItems.push({
        equipmentId: equipment._id,
        quantity: item.quantity,
        pricePerDay: equipment.pricePerDay, // Store current price
      });
    }

    const customPackage = await this.customPackageModel.create({
      name: dto.name,
      description: dto.description,
      items: packageItems,
      totalPricePerDay,
      createdBy: userId,
      isPublic: dto.isPublic || false,
      notes: dto.notes || '',
    });

    return { 
      message: 'Custom package created successfully', 
      package: customPackage 
    };
  }

  async getUserCustomPackages(userId: string) {
    return this.customPackageModel
      .find({ 
        $or: [
          { createdBy: userId },
          { sharedWith: userId },
          { isPublic: true }
        ],
        status: CustomPackageStatus.ACTIVE
      })
      .populate({
        path: 'items.equipmentId',
        select: 'name category pricePerDay images provider',
        populate: {
          path: 'provider',
          select: 'companyName firstName lastName'
        }
      })
      .populate('createdBy', 'firstName lastName email')
      .sort({ createdAt: -1 });
  }

  async getCustomPackageById(userId: string, packageId: string) {
    const customPackage = await this.customPackageModel
      .findById(packageId)
      .populate({
        path: 'items.equipmentId',
        select: 'name category pricePerDay images description specifications provider',
        populate: {
          path: 'provider',
          select: 'companyName firstName lastName email'
        }
      })
      .populate('createdBy', 'firstName lastName email');

    if (!customPackage) {
      throw new NotFoundException('Custom package not found');
    }

    // Check if user has access
    if (
      customPackage.createdBy.toString() !== userId &&
      !customPackage.isPublic &&
      !customPackage.sharedWith.includes(userId as any)
    ) {
      throw new ForbiddenException('You do not have access to this custom package');
    }

    return customPackage;
  }

  async updateCustomPackage(userId: string, packageId: string, dto: UpdateCustomEquipmentPackageDto) {
    const customPackage = await this.customPackageModel.findById(packageId);
    if (!customPackage) {
      throw new NotFoundException('Custom package not found');
    }

    if (customPackage.createdBy.toString() !== userId) {
      throw new ForbiddenException('You can only update your own custom packages');
    }

    // If items are being updated, recalculate total price
    if (dto.items) {
      let totalPricePerDay = 0;
      const packageItems: any[] = [];

      for (const item of dto.items) {
        const equipment = await this.equipmentModel.findById(item.equipmentId);
        if (!equipment) {
          throw new BadRequestException(`Equipment with id ${item.equipmentId} not found`);
        }

        const itemTotal = equipment.pricePerDay * item.quantity;
        totalPricePerDay += itemTotal;

        packageItems.push({
          equipmentId: equipment._id,
          quantity: item.quantity,
          pricePerDay: equipment.pricePerDay,
        });
      }

      customPackage.items = packageItems;
      customPackage.totalPricePerDay = totalPricePerDay;
    }

    if (dto.name) customPackage.name = dto.name;
    if (dto.description) customPackage.description = dto.description;
    if (dto.isPublic !== undefined) customPackage.isPublic = dto.isPublic;
    if (dto.notes !== undefined) customPackage.notes = dto.notes;

    await customPackage.save();

    return { 
      message: 'Custom package updated successfully', 
      package: customPackage 
    };
  }

  async deleteCustomPackage(userId: string, packageId: string) {
    const customPackage = await this.customPackageModel.findById(packageId);
    if (!customPackage) {
      throw new NotFoundException('Custom package not found');
    }

    if (customPackage.createdBy.toString() !== userId) {
      throw new ForbiddenException('You can only delete your own custom packages');
    }

    await this.customPackageModel.findByIdAndDelete(packageId);

    return { message: 'Custom package deleted successfully' };
  }

  async getPublicCustomPackages() {
    return this.customPackageModel
      .find({ 
        isPublic: true,
        status: CustomPackageStatus.ACTIVE 
      })
      .populate({
        path: 'items.equipmentId',
        select: 'name category pricePerDay images provider',
        populate: {
          path: 'provider',
          select: 'companyName firstName lastName'
        }
      })
      .populate('createdBy', 'firstName lastName email')
      .sort({ createdAt: -1 });
  }

  async shareCustomPackage(userId: string, packageId: string, shareWithUserId: string) {
    const customPackage = await this.customPackageModel.findById(packageId);
    if (!customPackage) {
      throw new NotFoundException('Custom package not found');
    }

    if (customPackage.createdBy.toString() !== userId) {
      throw new ForbiddenException('You can only share your own custom packages');
    }

    const userToShareWith = await this.userModel.findById(shareWithUserId);
    if (!userToShareWith) {
      throw new NotFoundException('User to share with not found');
    }

    if (!customPackage.sharedWith.includes(shareWithUserId as any)) {
      customPackage.sharedWith.push(shareWithUserId as any);
      await customPackage.save();
    }

    return { message: 'Custom package shared successfully' };
  }
}
