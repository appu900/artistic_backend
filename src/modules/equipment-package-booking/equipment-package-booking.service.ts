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

    // Validate package exists and is approved
    const packageData = await this.packageModel
      .findById(dto.packageId)
      .populate('createdBy', 'firstName lastName email');
    
    if (!packageData) {
      throw new NotFoundException('Package not found');
    }

    if (packageData.status !== 'approved') {
      throw new BadRequestException('Package is not available for booking');
    }

    // Calculate number of days and total price
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    const timeDifference = endDate.getTime() - startDate.getTime();
    const numberOfDays = Math.ceil(timeDifference / (1000 * 3600 * 24)) + 1; // Include both start and end dates

    if (numberOfDays <= 0) {
      throw new BadRequestException('End date must be after start date');
    }

    // Check availability for the requested dates
    const isAvailable = await this.checkPackageAvailability(
      dto.packageId,
      dto.startDate,
      dto.endDate,
    );

    if (!isAvailable.available) {
      throw new BadRequestException(
        `Package is not available for the selected dates. Conflicts: ${isAvailable.conflicts.join(', ')}`,
      );
    }

    const pricePerDay = Number(packageData.totalPrice);
    const totalPrice = pricePerDay * numberOfDays;

    // Create booking
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
      specialRequests: dto.specialRequests,
      status: 'pending',
      paymentStatus: 'pending',
    });

    const populatedBooking = await this.bookingModel
      .findById(booking._id)
      .populate('packageId', 'name description images totalPrice')
      .populate('bookedBy', 'firstName lastName email');

    return {
      message: 'Package booking created successfully',
      booking: populatedBooking,
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

    const [bookings, total] = await Promise.all([
      this.bookingModel
        .find(query)
        .populate('packageId', 'name description images totalPrice createdBy')
        .populate({
          path: 'packageId',
          populate: {
            path: 'createdBy',
            select: 'firstName lastName email',
          },
        })
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

  async getProviderBookings(
    providerId: string,
    status?: string,
    page: number = 1,
    limit: number = 10,
  ) {
    // First, get all packages created by this provider
    const providerPackages = await this.packageModel
      .find({ createdBy: providerId })
      .select('_id');

    const packageIds = providerPackages.map((pkg) => pkg._id);

    const query: any = { packageId: { $in: packageIds } };
    if (status) {
      query.status = status;
    }

    const skip = (page - 1) * limit;

    const [bookings, total] = await Promise.all([
      this.bookingModel
        .find(query)
        .populate('packageId', 'name description images totalPrice')
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

  async getBookingById(bookingId: string, userId: string) {
    const booking = await this.bookingModel
      .findById(bookingId)
      .populate('packageId', 'name description images totalPrice createdBy')
      .populate('bookedBy', 'firstName lastName email')
      .populate({
        path: 'packageId',
        populate: {
          path: 'createdBy',
          select: 'firstName lastName email',
        },
      });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    // Check if user has access to this booking
    const isBookingOwner = booking.bookedBy._id.toString() === userId;
    const isPackageOwner = (booking.packageId as any).createdBy._id.toString() === userId;

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
    const booking = await this.bookingModel
      .findById(bookingId)
      .populate({
        path: 'packageId',
        select: 'createdBy',
      });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    // Check if user has permission to update status
    const isBookingOwner = booking.bookedBy.toString() === userId;
    const isPackageOwner = (booking.packageId as any).createdBy.toString() === userId;

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
    }

    booking.status = dto.status;
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
  ) {
    const conflicts = await this.bookingModel.find({
      packageId,
      status: { $in: ['pending', 'confirmed'] },
      $or: [
        {
          startDate: { $lte: endDate },
          endDate: { $gte: startDate },
        },
      ],
    });

    const conflictDates = conflicts.map(
      (conflict) => `${conflict.startDate} to ${conflict.endDate}`,
    );

    return {
      available: conflicts.length === 0,
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
        .populate('packageId', 'name description images totalPrice createdBy')
        .populate('bookedBy', 'firstName lastName email')
        .populate({
          path: 'packageId',
          populate: {
            path: 'createdBy',
            select: 'firstName lastName email',
          },
        })
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