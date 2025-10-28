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
      isPublic: false,
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
        .populate('items.equipmentId', 'name imageUrl pricePerDay category')
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

    // Set up the base access filter based on authentication and requirements
    const accessFilter: any = {};
    if (userId) {
      // Authenticated user: can see their own packages (public or private) + public packages from others
      accessFilter.$or = [
        { createdBy: new Types.ObjectId(userId) }, // Their own packages (any visibility)
        { isPublic: true } // Public packages from others
      ];
    
    } else {
      // Non-authenticated user: only public packages
      accessFilter.isPublic = true;
     
    }

    if (status && status !== 'all') {
      filter.status = status;
    } else {
      // Default to showing only active package
      filter.status = 'active';
    }

    // Handle search with proper $and logic to not override access filter
    if (search) {
      filter.$and = [
        accessFilter,
        {
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } }
          ]
        }
      ];
    } else {
      // If no search, just apply the access filter directly
      Object.assign(filter, accessFilter);
    }

    
    

    const [packages, total] = await Promise.all([
      this.customPackageModel
        .find(filter)
        .populate('items.equipmentId', 'name imageUrl pricePerDay category')
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
      .populate('items.equipmentId', 'name imageUrl pricePerDay category provider')
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
    ).populate('items.equipmentId', 'name imageUrl pricePerDay category');
    
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
    ).populate('items.equipmentId', 'name imageUrl pricePerDay category');
    
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
        .populate('provider', 'firstName lastName email')
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

  // Debug method to check package counts
  async debugGetPackageCount() {
    try {
      const totalCount = await this.customPackageModel.countDocuments({});
      const activeCount = await this.customPackageModel.countDocuments({ status: 'active' });
      const publicCount = await this.customPackageModel.countDocuments({ isPublic: true });
      const privateCount = await this.customPackageModel.countDocuments({ isPublic: false });

      const samplePackages = await this.customPackageModel
        .find({})
        .select('name status isPublic createdBy createdAt')
        .populate('createdBy', 'firstName lastName')
        .limit(5)
        .exec();

      return {
        counts: {
          total: totalCount,
          active: activeCount,
          public: publicCount,
          private: privateCount
        },
        samplePackages: samplePackages.map(pkg => ({
          id: pkg._id,
          name: pkg.name,
          status: pkg.status,
          isPublic: pkg.isPublic,
          createdBy: pkg.createdBy,
          createdAt: (pkg as any).createdAt
        })),
        message: totalCount === 0 ? 'No custom packages found in database' : `Found ${totalCount} packages`
      };
    } catch (error) {
      console.error('Error in debugGetPackageCount:', error);
      throw error;
    }
  }

  // Debug method to create a test package if none exist
  async debugCreateTestPackage() {
    try {
      // Check if we have any equipment to use
      const equipments = await this.equipmentModel.find({}).limit(2).exec();
      if (equipments.length === 0) {
        return {
          success: false,
          message: 'No equipment found in database - cannot create test package'
        };
      }

      // Check if we have any users to assign as creator
      const userModel = this.customPackageModel.db.model('User');
      const users = await userModel.find({}).limit(1).exec();
      let createdBy: Types.ObjectId;
      
      if (users.length > 0) {
        createdBy = users[0]._id;
      } else {
        // Create a random ObjectId if no users exist
        createdBy = new Types.ObjectId();
      }

      // Create a test package
      const testPackage = new this.customPackageModel({
        name: 'Debug Test Package',
        description: 'This is a test package created for debugging purposes',
        items: equipments.map(eq => ({
          equipmentId: eq._id,
          quantity: 1,
          pricePerDay: eq.pricePerDay || 100
        })),
        totalPricePerDay: equipments.reduce((sum, eq) => sum + (eq.pricePerDay || 100), 0),
        createdBy: createdBy,
        status: 'active',
        isPublic: false, // Make it private to test user access
        sharedWith: [],
        notes: 'Debug test package - private'
      });

      const saved = await testPackage.save();
      return {
        success: true,
        message: 'Test package created successfully',
        packageId: saved._id,
        package: {
          name: saved.name,
          status: saved.status,
          isPublic: saved.isPublic,
          itemCount: saved.items.length,
          createdBy: saved.createdBy
        }
      };
    } catch (error) {
      console.error('Error creating test package:', error);
      return {
        success: false,
        message: 'Failed to create test package',
        error: error.message
      };
    }
  }
}