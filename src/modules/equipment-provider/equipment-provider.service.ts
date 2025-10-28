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
import { 
  EquipmentBooking, 
  EquipmentBookingDocument 
} from 'src/infrastructure/database/schemas/Equipment-booking.schema';
import { 
  EquipmentPackageBooking, 
  EquipmentPackageBookingDocument 
} from 'src/infrastructure/database/schemas/equipment-package-booking.schema';
import { 
  Equipment, 
  EquipmentDocument 
} from 'src/infrastructure/database/schemas/equipment.schema';
import { 
  EquipmentPackage, 
  EquipmentPackageDocument 
} from 'src/infrastructure/database/schemas/equipment-package.schema';
import { 
  CustomEquipmentPackage, 
  CustomEquipmentPackageDocument 
} from 'src/infrastructure/database/schemas/custom-equipment-package.schema';
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
    @InjectModel(EquipmentBooking.name) 
    private equipmentBookingModel: Model<EquipmentBookingDocument>,
    @InjectModel(EquipmentPackageBooking.name) 
    private equipmentPackageBookingModel: Model<EquipmentPackageBookingDocument>,
    @InjectModel(Equipment.name) 
    private equipmentModel: Model<EquipmentDocument>,
    @InjectModel(EquipmentPackage.name) 
    private equipmentPackageModel: Model<EquipmentPackageDocument>,
    @InjectModel(CustomEquipmentPackage.name) 
    private customEquipmentPackageModel: Model<CustomEquipmentPackageDocument>,
    private readonly authService: AuthService,
  ) {}

  async createEquipmentProvider(
    data: CreateEquipmentProviderRequest,
    addedByAdminId?: string
  ) {
    try {
      
      const userResult = await this.authService.createUser({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phoneNumber: data.phoneNumber,
        role: UserRole.EQUIPMENT_PROVIDER,
        addedBy: addedByAdminId,
      }, true); 

     

      const userObjectId = userResult.user.id instanceof Types.ObjectId 
        ? userResult.user.id 
        : new Types.ObjectId(userResult.user.id as string);
      
      const profile = await this.equipmentProviderProfileModel.create({
        user: userObjectId,
        addedBy: addedByAdminId ? new Types.ObjectId(addedByAdminId) : null,
        companyName: data.companyName || '',
        businessDescription: data.businessDescription || '',
      });



      const updateResult = await this.userModel.updateOne(
        { _id: userObjectId },
        {
          roleProfile: profile._id,
          roleProfileRef: 'EquipmentProviderProfile'
        }
      );

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

    if (provider.roleProfile) {
      await this.equipmentProviderProfileModel.deleteOne({ _id: provider.roleProfile });
    }

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

  async getProviderBookings(userId: string, filters: any) {
    try {
      // Get equipment provider user
      const provider = await this.userModel.findById(userId)
        .populate('roleProfile')
        .exec();

      if (!provider) {
        throw new NotFoundException('User not found');
      }

      if (provider.role !== UserRole.EQUIPMENT_PROVIDER) {
        throw new NotFoundException('User is not an equipment provider');
      }

      // Check if equipment provider profile exists
      const providerProfile = await this.equipmentProviderProfileModel.findOne({ 
        user: new Types.ObjectId(userId) 
      });

      if (!providerProfile) {
        // Return empty bookings for providers without profiles yet
        return {
          bookings: [],
          pagination: {
            page: filters.page || 1,
            limit: filters.limit || 10,
            total: 0,
            totalPages: 0
          },
          stats: {
            totalEquipmentBookings: 0,
            totalPackageBookings: 0,
            totalBookings: 0
          }
        };
      }

      // Get all equipment owned by this provider
      const providerEquipment = await this.equipmentModel.find({ 
        provider: { $in: [new Types.ObjectId(userId), providerProfile._id] }
      }).exec();
      
      const equipmentIds = providerEquipment.map(eq => eq._id);

      
      // Get custom packages created by this provider 
      const providerCustomPackages = await this.customEquipmentPackageModel.find({ 
        createdBy: new Types.ObjectId(userId) 
      }).exec();
      
      const customPackageIds = providerCustomPackages.map(pkg => pkg._id);


      
      // Get regular packages created by this provider (for both equipment and package booking queries)
      const providerPackages = await this.equipmentPackageModel.find({ 
        createdBy: new Types.ObjectId(userId) 
      }).exec();
      const packageIds = providerPackages.map(pkg => pkg._id);

      // Build query for equipment bookings - include bookings with provider's equipment OR custom packages
  const equipmentBookingsQuery: any = {};
      
      // Build $or conditions only if there are IDs to search for
      const orConditions: any[] = [];
      if (equipmentIds.length > 0) {
        orConditions.push({ 'equipments.equipmentId': { $in: equipmentIds } });
      }
      if (customPackageIds.length > 0) {
        orConditions.push({ 'customPackages': { $in: customPackageIds } });
      }
      if (packageIds.length > 0) {
        // Include equipment bookings that reference provider's regular packages
        orConditions.push({ 'packages': { $in: packageIds } });
      }
      
      // Only add $or if we have conditions
      if (orConditions.length > 0) {
        equipmentBookingsQuery.$or = orConditions;
      } else {
        // No equipment or custom packages - return empty results
        return {
          bookings: [],
          pagination: {
            page: filters.page || 1,
            limit: filters.limit || 10,
            total: 0,
            totalPages: 0
          },
          stats: {
            totalEquipmentBookings: 0,
            totalPackageBookings: 0,
            totalBookings: 0
          }
        };
      }
      

      // Build query for package bookings (include both regular and custom packages)
      const packageBookingsQuery: any = {};

      // Include custom packages as well
      const combinedPackageIds = [...packageIds, ...customPackageIds];
      if (combinedPackageIds.length > 0) {
        packageBookingsQuery.packageId = { $in: combinedPackageIds };
      }

      // Apply filters
      if (filters.status) {
        equipmentBookingsQuery.status = filters.status;
        packageBookingsQuery.status = filters.status;
      }

      if (filters.startDate && filters.endDate) {
        const dateFilter = {
          $gte: filters.startDate,
          $lte: filters.endDate
        };
        equipmentBookingsQuery.date = dateFilter;
        packageBookingsQuery.startDate = dateFilter;
      }

      // Pagination
      const skip = (filters.page - 1) * filters.limit;

      // Expand query to include bookings that have customPackages; we'll filter them by provider's equipment afterward
      const expandedEquipmentQuery = {
        ...equipmentBookingsQuery,
        $or: [
          ...(equipmentBookingsQuery.$or || []),
          { customPackages: { $exists: true, $ne: [] } }
        ]
      };

      const rawEquipmentBookings = await this.equipmentBookingModel
        .find(expandedEquipmentQuery)
        .populate('bookedBy', 'firstName lastName email phoneNumber')
        .populate('equipments.equipmentId')
        .populate({
          path: 'packages',
          populate: {
            path: 'items.equipmentId',
            model: 'Equipment'
          }
        })
        .populate({
          path: 'customPackages',
          populate: {
            path: 'items.equipmentId',
            model: 'Equipment'
          }
        })
        .sort({ createdAt: -1 })
        .exec();

      // Filter equipment bookings to only those actually belonging to this provider
  const equipmentIdSet = new Set((equipmentIds as Types.ObjectId[]).map((id) => id.toString()));
  const packageIdSet = new Set((packageIds as Types.ObjectId[]).map((id) => id.toString()));

      const filteredEquipmentBookings = rawEquipmentBookings.filter(b => {
        const hasOwnEquip = (b.equipments || []).some((it: any) => it.equipmentId && equipmentIdSet.has(it.equipmentId._id.toString()));
        const hasOwnStdPkg = (b.packages || []).some((pkg: any) => pkg && packageIdSet.has(pkg._id.toString()));
        const hasOwnCustomPkg = (b.customPackages || []).some((cp: any) => (cp.items || []).some((it: any) => it.equipmentId && equipmentIdSet.has(it.equipmentId._id.toString())));
        return hasOwnEquip || hasOwnStdPkg || hasOwnCustomPkg;
      });

      // Apply pagination after filtering
      const equipmentStart = skip;
      const equipmentEnd = skip + filters.limit;
  const pagedEquipmentBookings = filteredEquipmentBookings.slice(equipmentStart, equipmentEnd);


      // Get package bookings
      const packageBookings = await this.equipmentPackageBookingModel
        .find(packageBookingsQuery)
        .populate('bookedBy', 'firstName lastName email phoneNumber')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(filters.limit)
        .lean()
        .exec();

      // Manually populate package data (supports both EquipmentPackage and CustomEquipmentPackage)
      const populatedPackageBookings = await Promise.all(
        packageBookings.map(async (booking) => {
          let pkg: any = await this.equipmentPackageModel
            .findById(booking.packageId)
            .populate('items.equipmentId')
            .lean();
          if (!pkg) {
            pkg = await this.customEquipmentPackageModel.findById(booking.packageId).lean();
          }
          return { ...booking, packageId: pkg || booking.packageId };
        })
      );

      // Transform and combine bookings
  const transformedEquipmentBookings = pagedEquipmentBookings.map(booking => {
        const bookingObj = booking.toObject();
        return {
          _id: bookingObj._id,
          type: 'equipment',
          customer: bookingObj.bookedBy,
          items: bookingObj.equipments.map(item => ({
            equipment: item.equipmentId,
            quantity: item.quantity
          })),
          packages: bookingObj.packages || [],
          customPackages: bookingObj.customPackages || [],
          date: bookingObj.date,
          startTime: bookingObj.startTime,
          endTime: bookingObj.endTime,
          equipmentDates: bookingObj.equipmentDates || [],
          isMultiDay: bookingObj.isMultiDay || false,
          status: bookingObj.status,
          paymentStatus: bookingObj.paymentStatus,
          totalPrice: bookingObj.totalPrice,
          address: bookingObj.address,
          createdAt: (bookingObj as any).createdAt,
          updatedAt: (bookingObj as any).updatedAt
        };
      });

      const transformedPackageBookings = populatedPackageBookings.map(booking => {
        const bookingObj: any = booking;
        return {
          _id: bookingObj._id,
          type: 'package',
          customer: bookingObj.bookedBy,
          package: bookingObj.packageId,
          startDate: bookingObj.startDate,
          endDate: bookingObj.endDate,
          numberOfDays: bookingObj.numberOfDays,
          pricePerDay: bookingObj.pricePerDay,
          totalPrice: bookingObj.totalPrice,
          status: bookingObj.status,
          paymentStatus: bookingObj.paymentStatus,
          userDetails: bookingObj.userDetails,
          venueDetails: bookingObj.venueDetails,
          eventDescription: bookingObj.eventDescription,
          specialRequests: bookingObj.specialRequests,
          createdAt: bookingObj.createdAt,
          updatedAt: bookingObj.updatedAt
        };
      });

      // Combine and sort all bookings
      const allBookings = [...transformedEquipmentBookings, ...transformedPackageBookings]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      // Get total counts
  // Recalculate totals after filtering
  const totalEquipmentBookings = filteredEquipmentBookings.length;
  const totalPackageBookings = await this.equipmentPackageBookingModel.countDocuments(packageBookingsQuery);
      const totalBookings = totalEquipmentBookings + totalPackageBookings;

      return {
        bookings: allBookings,
        pagination: {
          page: filters.page,
          limit: filters.limit,
          total: totalBookings,
          totalPages: Math.ceil(totalBookings / filters.limit)
        },
        stats: {
          totalEquipmentBookings,
          totalPackageBookings,
          totalBookings
        }
      };
    } catch (error) {
      throw new BadRequestException('Failed to fetch provider bookings: ' + error.message);
    }
  }

  async getBookingAnalytics(userId: string) {
    try {
      // Get equipment provider user
      const provider = await this.userModel.findById(userId);
      
      if (!provider) {
        throw new NotFoundException('User not found');
      }

      if (provider.role !== UserRole.EQUIPMENT_PROVIDER) {
        throw new NotFoundException('User is not an equipment provider');
      }

      // Check if equipment provider profile exists
      const providerProfile = await this.equipmentProviderProfileModel.findOne({ 
        user: new Types.ObjectId(userId) 
      });

      if (!providerProfile) {
        // Return empty analytics for providers without profiles yet
        return {
          overview: {
            totalEquipment: 0,
            totalPackages: 0,
            totalBookingsThisMonth: 0,
            totalBookingsLastMonth: 0,
            totalRevenue: 0,
            equipmentRevenue: 0,
            packageRevenue: 0
          },
          bookingTrends: {
            equipmentBookingsThisMonth: 0,
            equipmentBookingsLastMonth: 0,
            packageBookingsThisMonth: 0,
            packageBookingsLastMonth: 0
          },
          statusBreakdown: {
            equipment: [],
            packages: []
          }
        };
      }

      // Get all equipment owned by this provider (backward-compatible)
      const providerEquipment = await this.equipmentModel.find({ 
        provider: { $in: [new Types.ObjectId(userId), providerProfile._id] }
      }).exec();
      
      const equipmentIds = providerEquipment.map(eq => eq._id);

      // Get custom packages created by this provider
      const providerCustomPackages = await this.customEquipmentPackageModel.find({ 
        createdBy: new Types.ObjectId(userId) 
      }).exec();
      
      const customPackageIds = providerCustomPackages.map(pkg => pkg._id);

      // Find any custom packages (by any creator) that include this provider's equipment
      const __customPkgsWithProviderEquip = await this.customEquipmentPackageModel
        .find({ 'items.equipmentId': { $in: equipmentIds } })
        .select('_id')
        .lean();
      const customPkgIdsByEquip = (__customPkgsWithProviderEquip as any[]).map((p: any) => p._id);

      // Get packages created by this provider
      const providerPackages = await this.equipmentPackageModel.find({ 
        createdBy: new Types.ObjectId(userId) 
      }).exec();
      const packageIds = providerPackages.map(pkg => pkg._id);

      // Calculate date ranges
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

      // Equipment bookings analytics (include equipment, provider's standard packages, and any custom packages that use provider's equipment)
      const equipmentBookingsThisMonth = await this.equipmentBookingModel.countDocuments({
        $or: [
          { 'equipments.equipmentId': { $in: equipmentIds } },
          // include provider-owned custom packages and also those referencing provider equipment
          { 'customPackages': { $in: [...customPackageIds, ...customPkgIdsByEquip] } },
          { 'packages': { $in: packageIds } }
        ],
        createdAt: { $gte: startOfMonth }
      });

      const equipmentBookingsLastMonth = await this.equipmentBookingModel.countDocuments({
        $or: [
          { 'equipments.equipmentId': { $in: equipmentIds } },
          { 'customPackages': { $in: [...customPackageIds, ...customPkgIdsByEquip] } },
          { 'packages': { $in: packageIds } }
        ],
        createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth }
      });

      const totalEquipmentRevenue = await this.equipmentBookingModel.aggregate([
        { 
          $match: { 
            $or: [
              { 'equipments.equipmentId': { $in: equipmentIds } },
              { 'customPackages': { $in: [...customPackageIds, ...customPkgIdsByEquip] } },
              { 'packages': { $in: packageIds } }
            ],
            status: 'confirmed' 
          } 
        },
        { $group: { _id: null, total: { $sum: '$totalPrice' } } }
      ]);

      // Package bookings analytics (standard packages only; custom packages are part of equipment bookings)
      const packageBookingsThisMonth = await this.equipmentPackageBookingModel.countDocuments({
        packageId: { $in: packageIds },
        createdAt: { $gte: startOfMonth }
      });

      const packageBookingsLastMonth = await this.equipmentPackageBookingModel.countDocuments({
        packageId: { $in: packageIds },
        createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth }
      });

      const totalPackageRevenue = await this.equipmentPackageBookingModel.aggregate([
        { $match: { packageId: { $in: packageIds }, status: 'confirmed' } },
        { $group: { _id: null, total: { $sum: '$totalPrice' } } }
      ]);

      // Status breakdown
      const equipmentStatusBreakdown = await this.equipmentBookingModel.aggregate([
        { 
          $match: { 
            $or: [
              { 'equipments.equipmentId': { $in: equipmentIds } },
              { 'customPackages': { $in: [...customPackageIds, ...customPkgIdsByEquip] } },
              { 'packages': { $in: packageIds } }
            ]
          } 
        },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]);

      const packageStatusBreakdown = await this.equipmentPackageBookingModel.aggregate([
        { $match: { packageId: { $in: packageIds } } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]);

      // Compute Active Packages: distinct packages used in bookings related to this provider
      // 1) Standard packages: used in equipment bookings or direct package bookings
      const stdPkgIdsUsedInEquipBookings = await this.equipmentBookingModel.distinct('packages', {
        $or: [
          { 'equipments.equipmentId': { $in: equipmentIds } },
          { 'packages': { $in: packageIds } },
          { 'customPackages': { $in: [...customPackageIds, ...customPkgIdsByEquip] } },
        ]
      });
      const stdPkgUsedSet = new Set<string>([
        ...((stdPkgIdsUsedInEquipBookings as any[]) || []).map((id: any) => id?.toString()).filter(Boolean),
      ]);
      // Intersect with provider-owned standard packages
  const providerStdPkgSet = new Set<string>((packageIds as any[]).map((id: any) => id.toString()));
      const activeStdPkgCount = Array.from(stdPkgUsedSet).filter(id => providerStdPkgSet.has(id)).length;

      // 2) Standard packages booked directly via package booking model
      const stdPkgIdsUsedDirect = await this.equipmentPackageBookingModel.distinct('packageId', {
        packageId: { $in: packageIds }
      });
      const directStdUsedSet = new Set<string>((stdPkgIdsUsedDirect as any[]).map((id: any) => id?.toString()).filter(Boolean));

      // Union of standard packages used
      const allActiveStdPkgs = new Set<string>([...Array.from(stdPkgUsedSet).filter(id => providerStdPkgSet.has(id)), ...Array.from(directStdUsedSet)]);

      // 3) Custom packages: those that include provider's equipment and were used in equipment bookings
      const customPkgIdsUsed = await this.equipmentBookingModel.distinct('customPackages', {
        'customPackages': { $in: customPkgIdsByEquip }
      });
      const activeCustomPkgCount = ((customPkgIdsUsed as any[]) || []).filter(Boolean).length;

      const activePackagesCount = allActiveStdPkgs.size + activeCustomPkgCount;

      return {
        overview: {
          totalEquipment: providerEquipment.length,
          // Expose active packages count so UI shows non-zero when packages/custom packages are actually booked
          totalPackages: activePackagesCount,
          totalBookingsThisMonth: equipmentBookingsThisMonth + packageBookingsThisMonth,
          totalBookingsLastMonth: equipmentBookingsLastMonth + packageBookingsLastMonth,
          totalRevenue: (totalEquipmentRevenue[0]?.total || 0) + (totalPackageRevenue[0]?.total || 0),
          equipmentRevenue: totalEquipmentRevenue[0]?.total || 0,
          packageRevenue: totalPackageRevenue[0]?.total || 0
        },
        bookingTrends: {
          equipmentBookingsThisMonth,
          equipmentBookingsLastMonth,
          packageBookingsThisMonth,
          packageBookingsLastMonth
        },
        statusBreakdown: {
          equipment: equipmentStatusBreakdown,
          packages: packageStatusBreakdown
        }
      };
    } catch (error) {
      throw new BadRequestException('Failed to fetch booking analytics: ' + error.message);
    }
  }

  async updateBookingStatus(userId: string, bookingId: string, updateData: { status: string; notes?: string }) {
    try {
      // Get equipment provider user
      const provider = await this.userModel.findById(userId);
      
      if (!provider) {
        throw new NotFoundException('User not found');
      }

      if (provider.role !== UserRole.EQUIPMENT_PROVIDER) {
        throw new NotFoundException('User is not an equipment provider');
      }

      // Check if equipment provider profile exists
      const providerProfile = await this.equipmentProviderProfileModel.findOne({ 
        user: new Types.ObjectId(userId) 
      });

      if (!providerProfile) {
        throw new NotFoundException('Equipment provider profile not found. Please complete your profile setup.');
      }

      // Get all equipment owned by this provider (backward-compatible)
      const providerEquipment = await this.equipmentModel.find({ 
        provider: { $in: [new Types.ObjectId(userId), providerProfile._id] }
      }).exec();
      
      const equipmentIds = providerEquipment.map(eq => eq._id);

      // Get custom packages created by this provider
      const providerCustomPackages = await this.customEquipmentPackageModel.find({ 
        createdBy: new Types.ObjectId(userId) 
      }).exec();
      
      const customPackageIds = providerCustomPackages.map(pkg => pkg._id);

      // Get regular equipment packages created by this provider
      const providerPackages = await this.equipmentPackageModel.find({ 
        createdBy: new Types.ObjectId(userId) 
      }).exec();
      const packageIds = providerPackages.map(pkg => pkg._id);

      // Try to find in equipment bookings first (including custom packages and regular packages)
      let booking = await this.equipmentBookingModel.findOne({
        _id: new Types.ObjectId(bookingId),
        $or: [
          { 'equipments.equipmentId': { $in: equipmentIds } },
          { 'customPackages': { $in: customPackageIds } },
          { 'packages': { $in: packageIds } }
        ]
      });

      if (booking) {
        booking.status = updateData.status;
        await booking.save();
        return {
          message: 'Equipment booking status updated successfully',
          booking: booking
        };
      }

      // Try to find in package bookings
      booking = await this.equipmentPackageBookingModel.findOne({
        _id: new Types.ObjectId(bookingId),
        packageId: { $in: [...packageIds, ...customPackageIds] }
      });

      if (booking) {
        booking.status = updateData.status;
        await booking.save();
        return {
          message: 'Package booking status updated successfully',
          booking: booking
        };
      }

      throw new NotFoundException('Booking not found or you do not have permission to update it');
    } catch (error) {
      throw new BadRequestException('Failed to update booking status: ' + error.message);
    }
  }
}