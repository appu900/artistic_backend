import { 
  BadRequestException, 
  Injectable, 
  NotFoundException 
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from 'src/infrastructure/database/schemas/user.schema';
import { 
  EquipmentProviderProfile, 
  EquipmentProviderProfileDocument 
} from 'src/infrastructure/database/schemas/equipment-provider-profile.schema';
import { AuthService } from '../auth/auth.service';
import { UserRole } from 'src/common/enums/roles.enum';

export interface CreateEquipmentProviderRequest {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  companyName?: string;
  businessDescription?: string;
}

export interface UpdateEquipmentProviderProfileRequest {
  companyName?: string;
  businessDescription?: string;
  businessAddress?: string;
  website?: string;
  serviceAreas?: string[];
  specializations?: string[];
  yearsInBusiness?: number;
}

@Injectable()
export class EquipmentProviderService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(EquipmentProviderProfile.name) 
    private equipmentProviderProfileModel: Model<EquipmentProviderProfileDocument>,
    private readonly authService: AuthService,
  ) {}

  async createEquipmentProvider(
    data: CreateEquipmentProviderRequest,
    addedByAdminId?: string
  ) {
    try {
      console.log('=== CREATING EQUIPMENT PROVIDER ===');
      console.log('Input data:', data);
      console.log('Admin ID:', addedByAdminId);
      
      // Create user account
      const userResult = await this.authService.createUser({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phoneNumber: data.phoneNumber,
        role: UserRole.EQUIPMENT_PROVIDER,
        addedBy: addedByAdminId,
      }, true); // Send welcome email

      console.log('User created successfully:', userResult.user.id, 'Type:', typeof userResult.user.id);

      // Create equipment provider profile
      console.log('Creating EquipmentProviderProfile...');
      console.log('User ID from auth service:', userResult.user.id);
      console.log('User ID type:', typeof userResult.user.id);
      
      // Ensure we have a proper ObjectId for the user reference
      const userObjectId = userResult.user.id instanceof Types.ObjectId 
        ? userResult.user.id 
        : new Types.ObjectId(userResult.user.id as string);
      console.log('Converted to ObjectId:', userObjectId);
      
      const profile = await this.equipmentProviderProfileModel.create({
        user: userObjectId,
        addedBy: addedByAdminId ? new Types.ObjectId(addedByAdminId) : null,
        companyName: data.companyName || '',
        businessDescription: data.businessDescription || '',
      });

      console.log('EquipmentProviderProfile created successfully:');
      console.log('- Profile ID:', profile._id);
      console.log('- Linked User ID:', profile.user);
      console.log('- Company Name:', profile.companyName);

      // Update user's role profile reference
      console.log('Updating user with profile reference...');
      const updateResult = await this.userModel.updateOne(
        { _id: userObjectId },
        {
          roleProfile: profile._id,
          roleProfileRef: 'EquipmentProviderProfile'
        }
      );

      console.log('User update result:', updateResult);

      // Verify the linking worked
      const verifyProfile = await this.equipmentProviderProfileModel.findOne({ 
        user: userObjectId 
      });
      console.log('Verification - Can find profile by user ID:', !!verifyProfile);
      if (verifyProfile) {
        console.log('Verification success - Profile found with user:', verifyProfile.user);
      }

      const response = {
        message: 'Equipment provider created successfully',
        user: userResult.user,
        profile: {
          id: profile._id,
          companyName: profile.companyName,
          businessDescription: profile.businessDescription,
        }
      };

      console.log('=== EQUIPMENT PROVIDER CREATION COMPLETE ===');
      return response;
      
    } catch (error) {
      console.error('=== ERROR CREATING EQUIPMENT PROVIDER ===');
      console.error('Error details:', error);
      throw error;
    }
  }

  async getAllEquipmentProviders() {
    return await this.userModel
      .find({ role: UserRole.EQUIPMENT_PROVIDER })
      .populate('roleProfile')
      .select('-passwordHash')
      .lean();
  }

  async getEquipmentProviderById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid equipment provider ID');
    }

    const provider = await this.userModel
      .findOne({ _id: id, role: UserRole.EQUIPMENT_PROVIDER })
      .populate('roleProfile')
      .select('-passwordHash')
      .lean();

    if (!provider) {
      throw new NotFoundException('Equipment provider not found');
    }

    return provider;
  }

  async updateEquipmentProviderProfile(
    userId: string, 
    updateData: UpdateEquipmentProviderProfileRequest
  ) {
    const user = await this.userModel.findOne({ 
      _id: userId, 
      role: UserRole.EQUIPMENT_PROVIDER 
    });

    if (!user) {
      throw new NotFoundException('Equipment provider not found');
    }

    if (!user.roleProfile) {
      throw new BadRequestException('Equipment provider profile not found');
    }

    const updatedProfile = await this.equipmentProviderProfileModel
      .findByIdAndUpdate(
        user.roleProfile,
        { $set: updateData },
        { new: true }
      );

    return {
      message: 'Profile updated successfully',
      profile: updatedProfile
    };
  }

  async changePassword(userId: string, newPassword: string) {
    const user = await this.userModel.findOne({ 
      _id: userId, 
      role: UserRole.EQUIPMENT_PROVIDER 
    });

    if (!user) {
      throw new NotFoundException('Equipment provider not found');
    }

    return await this.authService.changePassword(userId, newPassword);
  }

  async toggleProviderStatus(id: string) {
    const provider = await this.userModel.findOne({ 
      _id: id, 
      role: UserRole.EQUIPMENT_PROVIDER 
    });

    if (!provider) {
      throw new NotFoundException('Equipment provider not found');
    }

    provider.isActive = !provider.isActive;
    await provider.save();

    return {
      message: `Equipment provider ${provider.isActive ? 'activated' : 'deactivated'} successfully`,
      isActive: provider.isActive
    };
  }

  async deleteEquipmentProvider(id: string) {
    const provider = await this.userModel.findOne({ 
      _id: id, 
      role: UserRole.EQUIPMENT_PROVIDER 
    });

    if (!provider) {
      throw new NotFoundException('Equipment provider not found');
    }

    // Delete profile if exists
    if (provider.roleProfile) {
      await this.equipmentProviderProfileModel.deleteOne({ _id: provider.roleProfile });
    }

    // Delete user
    await this.userModel.deleteOne({ _id: id });

    return {
      message: 'Equipment provider deleted successfully'
    };
  }

  async getEquipmentProviderStats() {
    const total = await this.userModel.countDocuments({ role: UserRole.EQUIPMENT_PROVIDER });
    const active = await this.userModel.countDocuments({ 
      role: UserRole.EQUIPMENT_PROVIDER, 
      isActive: true 
    });
    
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    const recentSignups = await this.userModel.countDocuments({
      role: UserRole.EQUIPMENT_PROVIDER,
      createdAt: { $gte: oneWeekAgo }
    });

    return {
      total,
      active,
      inactive: total - active,
      recentSignups
    };
  }
}