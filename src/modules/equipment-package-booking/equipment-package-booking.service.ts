import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  EquipmentPackageBooking,
  EquipmentPackageBookingDocument,
} from '../../infrastructure/database/schemas/equipment-package-booking.schema';
import {
  EquipmentPackage,
  EquipmentPackageDocument,
} from '../../infrastructure/database/schemas/equipment-package.schema';
import {
  CustomEquipmentPackage,
  CustomEquipmentPackageDocument,
} from '../../infrastructure/database/schemas/custom-equipment-package.schema';
import { User, UserDocument } from '../../infrastructure/database/schemas';
import {
  CreateEquipmentPackageBookingDto,
  UpdateEquipmentPackageBookingStatusDto,
} from '../equipment-packages/dto/equipment-package-booking.dto';

@Injectable()
export class EquipmentPackageBookingService {
  constructor(
    @InjectModel(EquipmentPackageBooking.name)
    private readonly bookingModel: Model<EquipmentPackageBookingDocument>,
    @InjectModel(EquipmentPackage.name)
    private readonly packageModel: Model<EquipmentPackageDocument>,
    @InjectModel(CustomEquipmentPackage.name)
    private readonly customPackageModel: Model<CustomEquipmentPackageDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async createBooking(
    userId: string,
    dto: CreateEquipmentPackageBookingDto,
  ) {
    
    // Validate user exists
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Try to find package in both EquipmentPackage and CustomEquipmentPackage collections
    let packageData: any = null;
    let packageType: 'regular' | 'custom' = 'regular';
    let pricePerDay: number = 0;

    // First, try to find in regular equipment packages
    packageData = await this.packageModel
      .findById(dto.packageId)
      .populate('createdBy', 'firstName lastName email');
    
    if (packageData) {
      // Validate package is approved for regular packages
      if (packageData.status !== 'approved') {
        throw new BadRequestException('Package is not available for booking');
      }
      pricePerDay = Number(packageData.totalPrice);
      packageType = 'regular';
    } else {
      // Try to find in custom equipment packages
      packageData = await this.customPackageModel
        .findById(dto.packageId)
        .populate('createdBy', 'firstName lastName email');
      
      if (packageData) {
        // Custom packages can be booked by their creators (and potentially admins)
        if (packageData.createdBy._id.toString() !== userId) {
          throw new ForbiddenException('You can only book your own custom packages');
        }
        pricePerDay = Number(packageData.totalPricePerDay);
        packageType = 'custom';
      }
    }
    
    if (!packageData) {
      throw new NotFoundException('Package not found');
    }

    // Calculate number of days and total price
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    const timeDifference = endDate.getTime() - startDate.getTime();
    const numberOfDays = Math.floor(timeDifference / (1000 * 3600 * 24)) + 1; // Include both start and end dates
    
   
    if (numberOfDays <= 0) {
      throw new BadRequestException('End date must be after start date');
    }

    // Check availability (only for regular packages, custom packages don't have availability conflicts)
    if (packageType === 'regular') {
      const isAvailable = await this.checkPackageAvailability(
        dto.packageId,
        dto.startDate,
        dto.endDate,
        userId,
      );

      if (!isAvailable.available) {
        throw new BadRequestException(
          `Package is not available for the selected dates. Conflicts: ${isAvailable.conflicts.join(', ')}`,
        );
      }
    }

    const totalPrice = pricePerDay * numberOfDays;

    // Create booking with package type information
    const booking = await this.bookingModel.create({
      bookedBy: userId,
      packageId: dto.packageId,
      startDate: dto.startDate,
      endDate: dto.endDate,
      numberOfDays,
      pricePerDay,
      totalPrice,
      userDetails: dto.userDetails,
      venueDetails: dto.venueDetails,
      eventDescription: dto.eventDescription,
      specialRequests: (dto.specialRequests || '') + (packageType === 'custom' ? ' [CUSTOM PACKAGE]' : ''),
      status: 'pending',
      paymentStatus: 'pending',
    });

    // Manually populate package data based on package type
    const populatedBooking = await this.bookingModel
      .findById(booking._id)
      .populate('bookedBy', 'firstName lastName email')
      .lean();

    // Add package data manually since we can't rely on populate for mixed collections
    (populatedBooking as any).packageId = packageData;
    (populatedBooking as any).packageType = packageType;


    return {
      message: 'Package booking created successfully',
      booking: populatedBooking,
      packageType,
    };
  }

  async getUserBookings(
    userId: string,
    status?: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const query: any = { bookedBy: userId };
    if (status) {
      query.status = status;
    }

    const skip = (page - 1) * limit;

    // Get bookings without package population first
    const [rawBookings, total] = await Promise.all([
      this.bookingModel
        .find(query)
        .populate('bookedBy', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.bookingModel.countDocuments(query),
    ]);

    // Manually populate package data for each booking
    const bookings = await Promise.all(
      rawBookings.map(async (booking) => {
        let packageData: any = null;
        let packageType = 'unknown';

        // Try to find in regular equipment packages first
        const regularPackage = await this.packageModel
          .findById(booking.packageId)
          .populate('createdBy', 'firstName lastName email')
          .populate('items.equipmentId', 'name category pricePerDay images description specifications')
          .lean();
        
        if (regularPackage) {
          packageData = regularPackage;
          packageType = 'regular';
        } else {
          // Try to find in custom equipment packages
          const customPackage = await this.customPackageModel
            .findById(booking.packageId)
            .populate('createdBy', 'firstName lastName email')
            .populate('items.equipmentId', 'name category pricePerDay images description specifications')
            .lean();
          
          if (customPackage) {
            packageData = customPackage;
            packageType = 'custom';
          }
        }

        // Return booking with properly populated package data
        return {
          ...booking,
          packageId: packageData,
          packageType,
        };
      })
    );


    return {
      bookings,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };
  }

  async getProviderBookings(
    providerId: string,
    status?: string,
    page: number = 1,
    limit: number = 10,
  ) {
    // Get both regular and custom packages for this provider
    const [providerPackages, customProviderPackages] = await Promise.all([
      this.packageModel
        .find({ createdBy: providerId })
        .select('_id'),
      this.customPackageModel
        .find({ createdBy: providerId })
        .select('_id')
    ]);

    const packageIds = [
      ...providerPackages.map((pkg) => pkg._id),
      ...customProviderPackages.map((pkg) => pkg._id)
    ];

    const query: any = { packageId: { $in: packageIds } };
    if (status) {
      query.status = status;
    }

    const skip = (page - 1) * limit;

    // Get bookings without package population first
    const [rawBookings, total] = await Promise.all([
      this.bookingModel
        .find(query)
        .populate('bookedBy', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.bookingModel.countDocuments(query),
    ]);

    // Manually populate package data for each booking
    const bookings = await Promise.all(
      rawBookings.map(async (booking) => {
        let packageData: any = null;
        let packageType = 'unknown';

        // Try to find in regular equipment packages first
        const regularPackage = await this.packageModel
          .findById(booking.packageId)
          .populate('createdBy', 'firstName lastName email')
          .populate('items.equipmentId', 'name category pricePerDay images description specifications')
          .lean();
        
        if (regularPackage) {
          packageData = regularPackage;
          packageType = 'regular';
        } else {
          // Try to find in custom equipment packages
          const customPackage = await this.customPackageModel
            .findById(booking.packageId)
            .populate('createdBy', 'firstName lastName email')
            .populate('items.equipmentId', 'name category pricePerDay images description specifications')
            .lean();
          
          if (customPackage) {
            packageData = customPackage;
            packageType = 'custom';
          }
        }

        // Return booking with properly populated package data
        return {
          ...booking,
          packageId: packageData,
          packageType,
        };
      })
    );

    return {
      bookings,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };
  }

  async getBookingById(bookingId: string, userId: string) {
    // Get booking without package population first
    const rawBooking = await this.bookingModel
      .findById(bookingId)
      .populate('bookedBy', 'firstName lastName email')
      .lean();

    if (!rawBooking) {
      throw new NotFoundException('Booking not found');
    }

    // Manually populate package data
    let packageData: any = null;
    let packageType = 'unknown';

    // Try to find in regular equipment packages first
    const regularPackage = await this.packageModel
      .findById(rawBooking.packageId)
      .populate('createdBy', 'firstName lastName email')
      .populate('items.equipmentId', 'name category pricePerDay images description specifications')
      .lean();
    
    if (regularPackage) {
      packageData = regularPackage;
      packageType = 'regular';
    } else {
      // Try to find in custom equipment packages
      const customPackage = await this.customPackageModel
        .findById(rawBooking.packageId)
        .populate('createdBy', 'firstName lastName email')
        .populate('items.equipmentId', 'name category pricePerDay images description specifications')
        .lean();
      
      if (customPackage) {
        packageData = customPackage;
        packageType = 'custom';
      }
    }

    if (!packageData) {
      throw new NotFoundException('Package not found');
    }

    const booking = {
      ...rawBooking,
      packageId: packageData,
      packageType,
    };

    // Check if user has access to this booking
    const isBookingOwner = booking.bookedBy._id.toString() === userId;
    const isPackageOwner = packageData.createdBy._id.toString() === userId;

    if (!isBookingOwner && !isPackageOwner) {
      throw new ForbiddenException('Access denied');
    }

    return booking;
  }

  async updateBookingStatus(
    bookingId: string,
    userId: string,
    dto: UpdateEquipmentPackageBookingStatusDto,
  ) {
    const booking = await this.bookingModel.findById(bookingId);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    // Find package data to check ownership
    let packageCreatorId: string | null = null;

    // Try to find in regular equipment packages first
    const regularPackage = await this.packageModel
      .findById(booking.packageId)
      .select('createdBy')
      .lean();
    
    if (regularPackage) {
      packageCreatorId = regularPackage.createdBy.toString();
    } else {
      // Try to find in custom equipment packages
      const customPackage = await this.customPackageModel
        .findById(booking.packageId)
        .select('createdBy')
        .lean();
      
      if (customPackage) {
        packageCreatorId = customPackage.createdBy.toString();
      }
    }

    if (!packageCreatorId) {
      throw new NotFoundException('Package not found');
    }

    // Check if user has permission to update status
    const isBookingOwner = booking.bookedBy.toString() === userId;
    const isPackageOwner = packageCreatorId === userId;

    if (!isBookingOwner && !isPackageOwner) {
      throw new ForbiddenException('Access denied');
    }

    // Business logic for status updates
    if (dto.status === 'cancelled') {
      if (booking.status === 'completed') {
        throw new BadRequestException('Cannot cancel a completed booking');
      }
      booking.cancellationReason = dto.cancellationReason;
      booking.cancelledAt = new Date();
      // Reflect payment state for cancellations
      booking.paymentStatus = 'failed';
    }

    booking.status = dto.status;
    // When confirming, mark payment as paid
    if (dto.status === 'confirmed') {
      booking.paymentStatus = 'paid';
    }
    await booking.save();

    const updatedBooking = await this.bookingModel
      .findById(bookingId)
      .populate('packageId', 'name description images totalPrice')
      .populate('bookedBy', 'firstName lastName email');

    return {
      message: 'Booking status updated successfully',
      booking: updatedBooking,
    };
  }

  async checkPackageAvailability(
    packageId: string,
    startDate: string,
    endDate: string,
    userId?: string,
  ) {
    const conflicts = await this.bookingModel
      .find({
        packageId,
        status: { $in: ['pending', 'confirmed'] },
        $or: [
          {
            startDate: { $lte: endDate },
            endDate: { $gte: startDate },
          },
        ],
      })
      .select('startDate endDate bookedBy')
      .lean();

    // Exclude conflicts that belong to the same user (allow same-user multi-booking on same dates)
    const conflictsExcludingSelf = userId
      ? conflicts.filter((c) => String(c.bookedBy) !== String(userId))
      : conflicts;

    const conflictDates = conflictsExcludingSelf.map(
      (conflict) => `${conflict.startDate} to ${conflict.endDate}`,
    );

    return {
      available: conflictsExcludingSelf.length === 0,
      conflicts: conflictDates,
    };
  }

  async getAllBookingsForAdmin(
    status?: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const query: any = {};
    if (status) {
      query.status = status;
    }

    const skip = (page - 1) * limit;

    const [bookings, total] = await Promise.all([
      this.bookingModel
        .find(query)
        .populate({
          path: 'packageId',
          select: 'name description images totalPrice createdBy items',
          populate: [
            {
              path: 'createdBy',
              select: 'firstName lastName email',
            },
            {
              path: 'items.equipmentId',
              select: 'name category pricePerDay images description specifications'
            }
          ]
        })
        .populate('bookedBy', 'firstName lastName email')
        .sort({ bookingDate: -1 })
        .skip(skip)
        .limit(limit),
      this.bookingModel.countDocuments(query),
    ]);

    return {
      bookings,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };
  }
}