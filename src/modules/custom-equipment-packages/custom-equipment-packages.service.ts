import { 
  Injectable, 
  NotFoundException, 
  ForbiddenException,
  BadRequestException 
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { 
  CustomEquipmentPackage, 
  CustomEquipmentPackageDocument 
} from '../../infrastructure/database/schemas/custom-equipment-package.schema';
import { 
  Equipment, 
  EquipmentDocument,
  EquipmentStatus 
} from '../../infrastructure/database/schemas/equipment.schema';
import { 
  CreateCustomEquipmentPackageDto, 
  UpdateCustomEquipmentPackageDto 
} from './dto/custom-equipment-package.dto';

@Injectable()
export class CustomEquipmentPackagesService {
  constructor(
    @InjectModel(CustomEquipmentPackage.name)
    private customPackageModel: Model<CustomEquipmentPackageDocument>,
    @InjectModel(Equipment.name)
    private equipmentModel: Model<EquipmentDocument>,
  ) {}

  async create(
    createDto: CreateCustomEquipmentPackageDto, 
    userId: string
  ): Promise<CustomEquipmentPackage> {
    // Validate equipment items exist (temporarily not filtering by status)
    const equipmentIds = createDto.items.map(item => item.equipmentId);
    const equipments = await this.equipmentModel.find({
      _id: { $in: equipmentIds }
    });

    if (equipments.length !== equipmentIds.length) {
      const foundIds = equipments.map(eq => eq._id?.toString());
      const missingIds = equipmentIds.filter(id => !foundIds.includes(id));
      
      // Enhanced debugging information
      console.log('DEBUG: Equipment validation failed');
      console.log('DEBUG: Requested IDs:', equipmentIds);
      console.log('DEBUG: Found IDs:', foundIds);
      console.log('DEBUG: Missing IDs:', missingIds);
      
      throw new BadRequestException(
        `Some equipment items not found in database: ${missingIds.join(', ')}`
      );
    }

    // Calculate total price and update items with current prices
    let totalPrice = 0;
    const itemsWithPrices = createDto.items.map(item => {
      const equipment = equipments.find(eq => eq._id?.toString() === item.equipmentId);
      if (equipment) {
        totalPrice += equipment.pricePerDay * item.quantity;
        return {
          ...item,
          pricePerDay: equipment.pricePerDay
        };
      }
      return item;
    });

    const customPackage = new this.customPackageModel({
      ...createDto,
      items: itemsWithPrices,
      createdBy: new Types.ObjectId(userId),
      totalPricePerDay: totalPrice,
      isPublic: false, // Custom packages are always private
    });

    return customPackage.save();
  }

  async getUserPackages(
    userId: string,
    page: number = 1,
    limit: number = 10,
    status?: string,
    search?: string
  ) {
    const skip = (page - 1) * limit;
    const filter: any = { createdBy: new Types.ObjectId(userId) };

    if (status) {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const [packages, total] = await Promise.all([
      this.customPackageModel
        .find(filter)
        .populate('items.equipmentId', 'name images pricePerDay category')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.customPackageModel.countDocuments(filter).exec()
    ]);

    return {
      data: packages,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  async getAllPackages(
    page: number = 1,
    limit: number = 10,
    status?: string,
    search?: string,
    userId?: string
  ) {
    const skip = (page - 1) * limit;
    const filter: any = {};

    // If userId is provided, show packages created by the user OR public packages
    if (userId) {
      filter.$or = [
        { createdBy: new Types.ObjectId(userId) },
        { isPublic: true }
      ];
    } else {
      // For anonymous users, only show public packages
      filter.isPublic = true;
    }

    // Only filter by status if explicitly provided
    if (status && status !== 'all') {
      filter.status = status;
    } else {
      // Default to showing only active packages
      filter.status = 'active';
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const [packages, total] = await Promise.all([
      this.customPackageModel
        .find(filter)
        .populate('items.equipmentId', 'name images pricePerDay category')
        .populate('createdBy', 'firstName lastName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.customPackageModel.countDocuments(filter).exec()
    ]);

    return {
      data: packages,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  async findOne(id: string): Promise<CustomEquipmentPackage> {
    const customPackage = await this.customPackageModel
      .findById(id)
      .populate('items.equipmentId', 'name images pricePerDay category provider')
      .populate('createdBy', 'firstName lastName')
      .exec();

    if (!customPackage) {
      throw new NotFoundException('Custom equipment package not found');
    }

    return customPackage;
  }

  async update(
    id: string, 
    updateDto: UpdateCustomEquipmentPackageDto, 
    userId: string
  ): Promise<CustomEquipmentPackage> {
    const customPackage = await this.customPackageModel.findById(id);
    
    if (!customPackage) {
      throw new NotFoundException('Custom equipment package not found');
    }

    if (customPackage.createdBy.toString() !== userId) {
      throw new ForbiddenException('You can only update your own packages');
    }

    // If items are being updated, recalculate total price
    if (updateDto.items) {
      const equipmentIds = updateDto.items.map(item => item.equipmentId);
      const equipments = await this.equipmentModel.find({
        _id: { $in: equipmentIds }
      });

      if (equipments.length !== equipmentIds.length) {
        const foundIds = equipments.map(eq => eq._id?.toString());
        const missingIds = equipmentIds.filter(id => !foundIds.includes(id));
        throw new BadRequestException(
          `Some equipment items not found in database: ${missingIds.join(', ')}`
        );
      }

      let totalPrice = 0;
      for (const item of updateDto.items) {
        const equipment = equipments.find(eq => eq._id?.toString() === item.equipmentId);
        if (equipment) {
          totalPrice += equipment.pricePerDay * item.quantity;
        }
      }

      updateDto.totalPricePerDay = totalPrice;
    }

    // Ensure custom packages remain private
    const updateData = { ...updateDto, isPublic: false };
    
    const updated = await this.customPackageModel.findByIdAndUpdate(
      id, 
      updateData, 
      { new: true, runValidators: true }
    ).populate('items.equipmentId', 'name images pricePerDay category');
    
    if (!updated) {
      throw new NotFoundException('Custom equipment package not found after update');
    }
    
    return updated;
  }

  async remove(id: string, userId: string): Promise<void> {
    const customPackage = await this.customPackageModel.findById(id);
    
    if (!customPackage) {
      throw new NotFoundException('Custom equipment package not found');
    }

    if (customPackage.createdBy.toString() !== userId) {
      throw new ForbiddenException('You can only delete your own packages');
    }

    await this.customPackageModel.findByIdAndDelete(id);
  }

  async updateStatus(
    id: string, 
    status: string, 
    userId: string
  ): Promise<CustomEquipmentPackage> {
    const customPackage = await this.customPackageModel.findById(id);
    
    if (!customPackage) {
      throw new NotFoundException('Custom equipment package not found');
    }

    if (customPackage.createdBy.toString() !== userId) {
      throw new ForbiddenException('You can only update your own packages');
    }

    const updated = await this.customPackageModel.findByIdAndUpdate(
      id, 
      { status }, 
      { new: true, runValidators: true }
    ).populate('items.equipmentId', 'name images pricePerDay category');
    
    if (!updated) {
      throw new NotFoundException('Custom equipment package not found after status update');
    }
    
    return updated;
  }

  // Debug method to check equipment status
  async debugEquipmentStatus(equipmentIds: string[]) {
    const equipments = await this.equipmentModel.find({
      _id: { $in: equipmentIds }
    }).select('_id name status');

    const result = {
      requested: equipmentIds,
      found: equipments.map(eq => ({
        id: eq._id?.toString(),
        name: eq.name,
        status: eq.status || 'NO_STATUS_FIELD'
      })),
      missing: equipmentIds.filter(id => 
        !equipments.find(eq => eq._id?.toString() === id)
      )
    };

    return result;
  }

  async getAvailableEquipment(
    page: number = 1,
    limit: number = 50,
    category?: string,
    search?: string
  ) {
    const skip = (page - 1) * limit;
    const filter: any = {};

    if (category) {
      filter.category = category;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const [equipments, total] = await Promise.all([
      this.equipmentModel
        .find(filter)
        .populate('provider', 'name')
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.equipmentModel.countDocuments(filter).exec()
    ]);

    return {
      data: equipments,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }
}