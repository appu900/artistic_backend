import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import {
  ArtistBooking,
  ArtistBookingDocument,
} from 'src/infrastructure/database/schemas/artist-booking.schema';
import {
  ArtistUnavailable,
  ArtistUnavailableDocument,
} from 'src/infrastructure/database/schemas/Artist-Unavailable.schema';
import {
  ArtistProfile,
  ArtistProfileDocument,
  PerformancePreference,
} from 'src/infrastructure/database/schemas/artist-profile.schema';
import {
  CombineBooking,
  CombineBookingDocument,
} from 'src/infrastructure/database/schemas/Booking.schema';
import {
  EquipmentBooking,
  EquipmentBookingDocument,
  EquipmentBookingSchema,
} from 'src/infrastructure/database/schemas/Equipment-booking.schema';
import {
  CreateArtistBookingDto,
  CreateCombinedBookingDto,
  CreateEquipmentBookingDto,
  CalculatePricingDto,
  BookingStatus,
} from './dto/booking.dto';
import { User, UserDocument } from 'src/infrastructure/database/schemas';
import { ArtistAvailabilityService } from '../artist-availability/artist-availability.service';
import { TimeSlotService } from '../artist-pricing/time-slot.service';
import {
  CustomEquipmentPackage,
  CustomEquipmentPackageDocument,
} from 'src/infrastructure/database/schemas/custom-equipment-package.schema';
import {
  EquipmentPackage,
  EquipmentPackageDocument,
} from 'src/infrastructure/database/schemas/equipment-package.schema';
import {
  Equipment,
  EquipmentDocument,
} from 'src/infrastructure/database/schemas/equipment.schema';
import { ObjectId } from 'bson';
// import { ObjectId } from 'mongoose'
import { PaymentService } from 'src/payment/payment.service';
import { BookingType } from './interfaces/bookingType';
import { UpdatePaymentStatus } from 'src/common/enums/Booking.updateStatus';

@Injectable()
export class BookingService {
  constructor(
    @InjectModel(CombineBooking.name)
    private combineBookingModel: Model<CombineBookingDocument>,
    @InjectModel(EquipmentBooking.name)
    private equipmentBookingModel: Model<EquipmentBookingDocument>,
    @InjectModel(ArtistBooking.name)
    private artistBookingModel: Model<ArtistBookingDocument>,
    @InjectModel(ArtistUnavailable.name)
    private readonly artistUnavailableModel: Model<ArtistUnavailableDocument>,
    @InjectModel(ArtistProfile.name)
    private readonly artistProfileModel: Model<ArtistProfileDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(CustomEquipmentPackage.name)
    private customEquipmentPackageModel: Model<CustomEquipmentPackageDocument>,
    @InjectModel(EquipmentPackage.name)
    private equipmentPackageModel: Model<EquipmentPackageDocument>,
    @InjectModel(Equipment.name)
    private equipmentModel: Model<EquipmentDocument>,
    @InjectConnection() private connection: Connection,
    private readonly artistAvailabilityService: ArtistAvailabilityService,
    private readonly timeSlotService: TimeSlotService,
    private paymentService: PaymentService,
  ) {}

  async getArtistAvailability(artistId: string, month?: number, year?: number) {
    try {
      const artistExists = await this.artistProfileModel.findOne({
        _id: new Types.ObjectId(artistId),
        isVisible: true,
      });

      if (!artistExists) {
        throw new BadRequestException('Artist not found');
      }

      const preferenceStrings = artistExists.performPreference.map((p) =>
        p.toString().toLowerCase(),
      );
      const hasPrivatePreference = preferenceStrings.includes('private');

      if (!hasPrivatePreference) {
        throw new BadRequestException(
          'Artist not available for private bookings',
        );
      }

      const unavailabilityData =
        await this.artistAvailabilityService.getArtistUnavailabilityByProfileId(
          artistId,
          month,
          year,
        );

      const currentDate = new Date();
      let startDate: Date;
      let endDate: Date;

      if (month && year) {
        startDate = new Date(Date.UTC(year, month - 1, 1));
        endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
      } else {
        startDate = new Date(
          Date.UTC(currentDate.getFullYear(), currentDate.getMonth(), 1),
        );
        endDate = new Date(
          Date.UTC(
            currentDate.getFullYear(),
            currentDate.getMonth() + 1,
            0,
            23,
            59,
            59,
            999,
          ),
        );
      }

      const existingBookings = await this.artistBookingModel.find({
        artistId: artistExists.user,
        status: { $in: ['pending', 'confirmed'] },
        date: {
          $gte: startDate.toISOString().split('T')[0],
          $lte: endDate.toISOString().split('T')[0],
        },
      });

      const unavailableByDate = { ...unavailabilityData.unavailableSlots };

      existingBookings.forEach((booking) => {
        const dateKey = booking.date;
        const startHour = parseInt(booking.startTime.split(':')[0]);
        const endHour = parseInt(booking.endTime.split(':')[0]);

        // Hours during the booking
        const bookedHours: number[] = [];
        for (let hour = startHour; hour < endHour; hour++) {
          bookedHours.push(hour);
        }

        // Add cooldown hours after the booking (same day only)
        const cooldownHours: number[] = [];
        if (artistExists.cooldownPeriodHours > 0) {
          const cooldownEndHour = endHour + artistExists.cooldownPeriodHours;
          for (
            let hour = endHour;
            hour < cooldownEndHour && hour < 24;
            hour++
          ) {
            cooldownHours.push(hour);
          }
        }

        // Combine booked hours and cooldown hours
        const allUnavailableHours = [...bookedHours, ...cooldownHours];

        if (unavailableByDate[dateKey]) {
          const combined = [
            ...unavailableByDate[dateKey],
            ...allUnavailableHours,
          ];
          unavailableByDate[dateKey] = [...new Set(combined)].sort(
            (a, b) => a - b,
          );
        } else {
          unavailableByDate[dateKey] = allUnavailableHours;
        }
      });

      return {
        artistId,
        month: month || currentDate.getMonth() + 1,
        year: year || currentDate.getFullYear(),
        unavailableSlots: unavailableByDate,
      };
    } catch (error) {
      throw error;
    }
  }

  async calculateBookingPricing(dto: CalculatePricingDto) {
    try {
      console.log('🔄 calculateBookingPricing called with:', dto);

      // Validate that we have either an artist or equipment packages
      if (
        !dto.artistId &&
        (!dto.selectedEquipmentPackages ||
          dto.selectedEquipmentPackages.length === 0) &&
        (!dto.selectedCustomPackages || dto.selectedCustomPackages.length === 0)
      ) {
        throw new BadRequestException(
          'Either artistId or equipment packages must be provided for pricing calculation',
        );
      }

      let totalHours = 0;
      let totalDays = 0;
      let breakdown: Array<{ date: string; hours: number; rate: number }> = [];

      if (dto.eventDates && dto.eventDates.length > 0) {
        totalDays = dto.eventDates.length; // Number of days for equipment pricing
        for (const dayData of dto.eventDates) {
          const startHour = parseInt(dayData.startTime.split(':')[0]);
          const endHour = parseInt(dayData.endTime.split(':')[0]);
          const dayHours = endHour - startHour;
          totalHours += dayHours;

          breakdown.push({
            date: dayData.date,
            hours: dayHours,
            rate: 0,
          });
        }
      } else if (dto.eventDate && dto.startTime && dto.endTime) {
        console.log('📊 Processing single-day booking');
        totalDays = 1; // Single day for equipment pricing

        const startHour = parseInt(dto.startTime.split(':')[0]);
        const endHour = parseInt(dto.endTime.split(':')[0]);
        totalHours = endHour - startHour;

        breakdown.push({
          date: dto.eventDate,
          hours: totalHours,
          rate: 0,
        });
      } else {
        throw new BadRequestException(
          'Either eventDates or eventDate with times must be provided',
        );
      }

      console.log(`📊 Total hours calculated: ${totalHours}`);

      let artistPricingAmount = 0;
      let ratePerHour = 0;

      if (dto.artistId) {
        let performanceType: PerformancePreference;
        switch (dto.eventType) {
          case 'private':
            performanceType = PerformancePreference.PRIVATE;
            break;
          case 'public':
            performanceType = PerformancePreference.PUBLIC;
            break;
          default:
            performanceType = PerformancePreference.PRIVATE;
        }

        artistPricingAmount = await this.timeSlotService.calculateBookingCost(
          dto.artistId,
          performanceType,
          8,
          totalHours,
        );

        ratePerHour = artistPricingAmount / totalHours;
      }

      breakdown.forEach((day) => {
        day.rate = day.hours * ratePerHour;
      });

      // Calculate equipment pricing
      let equipmentFee: {
        amount: number;
        packages: Array<{
          id: string;
          name: string;
          price: number;
          type: string;
        }>;
      } = {
        amount: 0,
        packages: [],
      };

      if (dto.equipments && dto.equipments.length > 0) {
        try {
          for (const equipmentItem of dto.equipments) {
            const equipmentData = await this.equipmentModel.findById(
              equipmentItem.equipmentId,
            );
            if (equipmentData) {
              const itemPrice =
                equipmentItem.quantity *
                Number(equipmentData.pricePerDay) *
                totalDays;
              equipmentFee.amount += itemPrice;
              equipmentFee.packages.push({
                id: equipmentData.id,
                name: `${equipmentData.name} (x${equipmentItem.quantity})`,
                price: itemPrice,
                type: 'individual',
              });
            }
          }
        } catch (equipmentError) {
          console.warn(
            'Individual equipment pricing calculation failed:',
            equipmentError,
          );
        }
      }

      if (
        dto.selectedEquipmentPackages &&
        dto.selectedEquipmentPackages.length > 0
      ) {
        try {
          for (const packageId of dto.selectedEquipmentPackages) {
            const packageData =
              await this.equipmentPackageModel.findById(packageId);
            if (packageData) {
              const packagePrice = Number(packageData.totalPrice) * totalDays;
              equipmentFee.amount += packagePrice;
              equipmentFee.packages.push({
                id: packageData.id,
                name: packageData.name || 'Equipment Package',
                price: packagePrice,
                type: 'provider',
              });
            }
          }
        } catch (equipmentError) {}
      }

      if (dto.selectedCustomPackages && dto.selectedCustomPackages.length > 0) {
        try {
          for (const customPackageId of dto.selectedCustomPackages) {
            const customPackageData =
              await this.customEquipmentPackageModel.findById(customPackageId);
            if (customPackageData) {
              const customPackagePrice =
                customPackageData.totalPricePerDay * totalDays;
              equipmentFee.amount += customPackagePrice;
              equipmentFee.packages.push({
                id: customPackageData.id,
                name: customPackageData.name,
                price: customPackagePrice,
                type: 'custom',
              });
            }
          }
        } catch (customEquipmentError) {
          console.warn(
            'Custom equipment package pricing calculation failed:',
            customEquipmentError,
          );
        }
      }

      const result = {
        artistFee: {
          amount: artistPricingAmount,
          totalHours,
          pricingTier: `${totalHours}-hour`,
          breakdown,
        },
        equipmentFee,
        totalAmount: artistPricingAmount + equipmentFee.amount,
        currency: 'KWD',
        calculatedAt: new Date().toISOString(),
      };

      return result;
    } catch (error) {
      console.error('❌ calculateBookingPricing error:', error);
      throw new BadRequestException(
        `Pricing calculation failed: ${error.message}`,
      );
    }
  }

  async debugArtistUnavailableData(artistId: string) {
    try {
      const artistProfile = await this.artistProfileModel.findById(artistId);

      if (!artistProfile) {
        return { error: 'Artist profile not found', artistId };
      }

      const unavailableData = await this.artistUnavailableModel
        .find({
          artistProfile: artistProfile._id,
        })
        .sort({ date: 1 });

      const existingBookings = await this.artistBookingModel
        .find({
          artistId: artistProfile.user,
        })
        .sort({ date: 1 });

      return {
        artistId,
        artistProfile: {
          _id: artistProfile._id,
          stageName: artistProfile.stageName,
          user: artistProfile.user,
          isVisible: artistProfile.isVisible,
        },
        unavailableRecords: unavailableData.map((record) => ({
          date: record.date.toISOString().split('T')[0],
          hours: record.hours,
        })),
        existingBookings: existingBookings.map((booking) => ({
          date: booking.date,
          startTime: booking.startTime,
          endTime: booking.endTime,
          status: booking.status,
        })),
      };
    } catch (error) {
      console.error('❌ Debug error:', error);
      return { error: error.message, artistId };
    }
  }

  async verifyArtistProfile(artistId: string) {
    try {
      const artistProfile = await this.artistProfileModel.findById(artistId);

      if (!artistProfile) {
        return {
          error: 'Artist profile not found',
          artistId,
          isValidProfile: false,
        };
      }

      const user = await this.userModel.findById(artistProfile.user);

      return {
        artistId,
        isValidProfile: true,
        artistProfile: {
          _id: artistProfile._id,
          stageName: artistProfile.stageName,
          user: artistProfile.user,
          isVisible: artistProfile.isVisible,
        },
        user: user
          ? {
              _id: user._id,
              firstName: user.firstName,
              lastName: user.lastName,
              email: user.email,
              roleProfile: user.roleProfile,
              roleProfileRef: user.roleProfileRef,
            }
          : null,
        idMatches: user?.roleProfile?.toString() === artistId,
      };
    } catch (error) {
      console.error('❌ Verify error:', error);
      return { error: error.message, artistId, isValidProfile: false };
    }
  }

  async createTestUnavailableSlots(
    artistProfileId: string,
    date: string,
    hours: number[],
  ) {
    try {
      // Find the artist profile first
      const artistProfile =
        await this.artistProfileModel.findById(artistProfileId);
      if (!artistProfile) {
        throw new BadRequestException('Artist profile not found');
      }

      await this.artistUnavailableModel.updateOne(
        {
          artistProfile: new Types.ObjectId(artistProfileId),
          date: new Date(date),
        },
        {
          $addToSet: { hours: { $each: hours } },
        },
        { upsert: true },
      );

      return {
        message: 'Test unavailable slots created',
        artistProfileId,
        date,
        hours,
      };
    } catch (error) {
      throw error;
    }
  }

  async validateArtistAvalibility(
    artistId: string,
    startTime: string,
    endTime: string,
    date: string,
  ) {
    const startHour = parseInt(startTime.split(':')[0]);
    const endHour = parseInt(endTime.split(':')[0]);
    const requestedHours: number[] = [];
    for (let h = startHour; h < endHour; h++) {
      requestedHours.push(h);
    }
    const artist = await this.userModel.findById(artistId);
    if (!artist) {
      throw new BadRequestException(
        'the artist u are looking for is no longer with us',
      );
    }
    const unavailable = await this.artistUnavailableModel.findOne({
      artistProfile: new Types.ObjectId(artist.roleProfile),
      date: new Date(date),
    });
    if (unavailable) {
      const conflict = requestedHours.some((hour) =>
        unavailable.hours.includes(hour),
      );
      if (conflict) {
        throw new ConflictException('Artist not available for selected time.');
      }
    }
    return requestedHours;
  }

  async createArtistBooking(dto: CreateArtistBookingDto) {
    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      const startHour = parseInt(dto.startTime.split(':')[0]);
      const endHour = parseInt(dto.endTime.split(':')[0]);
      const requestedHours: number[] = [];
      for (let h = startHour; h < endHour; h++) {
        requestedHours.push(h);
      }
      //   ** fetch artist details
      const artist = await this.userModel.findById(dto.artistId);
      if (!artist) {
        throw new BadRequestException(
          'the artist u are looking for is no longer with us',
        );
      }

      const unavailable = await this.artistUnavailableModel.findOne({
        artistProfile: new Types.ObjectId(artist.roleProfile),
        date: new Date(dto.date),
      });

      if (unavailable) {
        const conflict = requestedHours.some((hour) =>
          unavailable.hours.includes(hour),
        );
        if (conflict) {
          throw new ConflictException(
            'Artist not available for selected time.',
          );
        }
      }

      const existingBookings = await this.artistBookingModel.find({
        artistId: new Types.ObjectId(dto.artistId),
        date: dto.date,
        status: { $in: ['pending', 'confirmed'] },
      });

      for (const booking of existingBookings) {
        const bookedStartHour = parseInt(booking.startTime.split(':')[0]);
        const bookedEndHour = parseInt(booking.endTime.split(':')[0]);
        const bookedHours: number[] = [];
        for (let h = bookedStartHour; h < bookedEndHour; h++) {
          bookedHours.push(h);
        }

        const conflict = requestedHours.some((hour) =>
          bookedHours.includes(hour),
        );

        if (conflict) {
          throw new ConflictException(
            'Artist already has a booking during the selected time.',
          );
        }
      }

      //   make the booking

      const artistBooking = await this.artistBookingModel.create(
        [
          {
            artistId: new Types.ObjectId(dto.artistId),
            bookedBy: new Types.ObjectId(dto.bookedBy),
            artistType: dto.artistType,
            date: dto.date,
            startTime: dto.startTime,
            endTime: dto.endTime,
            price: dto.price,
            status: 'confirmed',
          },
        ],
        { session },
      );

      const dateParts = dto.date.split('-');
      const bookingDate = new Date(
        Date.UTC(
          parseInt(dateParts[0]),
          parseInt(dateParts[1]) - 1,
          parseInt(dateParts[2]),
        ),
      );

      await this.artistUnavailableModel.updateOne(
        {
          artistProfile: new Types.ObjectId(artist.roleProfile),
          date: bookingDate,
        },
        {
          $addToSet: { hours: { $each: requestedHours } },
        },
        { upsert: true, session },
      );

      await session.commitTransaction();
      return {
        message: 'Booking confirmed',
        data: artistBooking,
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async createEquipmentBooking(
    dto: CreateEquipmentBookingDto,
    userEmail: string,
  ) {
    let finalEquipmentList: any[] = [];
    let userPackages: UserPackage[] = [];
    let listedPackages: ListedPackage[] = [];

    // Validate multi-day vs single-day booking data
    const isMultiDay =
      dto.isMultiDay && dto.equipmentDates && dto.equipmentDates.length > 0;

    if (isMultiDay) {
      if (!dto.equipmentDates || dto.equipmentDates.length === 0) {
        throw new BadRequestException(
          'Equipment dates are required for multi-day bookings',
        );
      }
    } else {
      if (!dto.date || !dto.startTime || !dto.endTime) {
        throw new BadRequestException(
          'Date, start time, and end time are required for single-day bookings',
        );
      }
    }

    const totalDays = isMultiDay ? dto.equipmentDates!.length : 1;

    if (dto.equipments && dto.equipments.length > 0) {
      console.log('Adding individual equipment items:', dto.equipments);
      for (const equipmentItem of dto.equipments) {
        finalEquipmentList.push({
          equipmentId: equipmentItem.equipmentId,
          quantity: equipmentItem.quantity,
        });
      }
    }

    if (dto.userEquipmentPackages && dto.userEquipmentPackages.length > 0) {
      userPackages = await this.customEquipmentPackageModel.find({
        _id: { $in: dto.userEquipmentPackages },
      });

      if (userPackages.length !== dto.userEquipmentPackages.length) {
        throw new BadRequestException(
          'One or more user equipment packages not found',
        );
      }
    }

    if (dto.packages && dto.packages.length > 0) {
      listedPackages = await this.equipmentPackageModel.find({
        _id: { $in: dto.packages },
      });

      if (listedPackages.length !== dto.packages.length) {
        throw new BadRequestException('One or more listed packages not found');
      }
    }

    for (const pkg of userPackages) {
      for (const item of pkg.items) {
        finalEquipmentList.push({
          equipmentId: item.equipmentId,
          quantity: item.quantity,
        });
      }
    }

    for (const pkg of listedPackages) {
      for (const item of pkg.items) {
        finalEquipmentList.push({
          equipmentId: item.equipmentId,
          quantity: item.quantity,
        });
      }
    }

    let serverCalculatedTotal = 0;

    for (const equipmentItem of finalEquipmentList) {
      try {
        const equipmentData = await this.equipmentModel.findById(
          equipmentItem.equipmentId,
        );
        if (equipmentData) {
          const itemTotalPerDay =
            equipmentItem.quantity * equipmentData.pricePerDay;
          const itemTotal = itemTotalPerDay * totalDays;
          serverCalculatedTotal += itemTotal;
        }
      } catch (error) {}
    }

    for (const pkg of userPackages) {
      const packageTotal = (pkg.totalPricePerDay || 0) * totalDays;
      serverCalculatedTotal += packageTotal;
    }

    for (const pkg of listedPackages) {
      const packageTotal = isMultiDay
        ? (pkg.totalPrice || 0) * totalDays
        : pkg.totalPrice || 0;
      serverCalculatedTotal += packageTotal;
    }

    const finalPrice =
      Math.abs(serverCalculatedTotal - dto.totalPrice) > 1
        ? serverCalculatedTotal
        : dto.totalPrice;

    if (finalPrice !== dto.totalPrice) {
      console.warn(
        `⚠️  Price mismatch detected. Using server-calculated: ${finalPrice} instead of client: ${dto.totalPrice}`,
      );
    }

    try {
      const equipmentBookingData: any = {
        bookedBy: new Types.ObjectId(dto.bookedBy),
        address: dto.address,
        equipments: finalEquipmentList.map((eq) => ({
          equipmentId: eq.equipmentId,
          quantity: eq.quantity,
        })),
        date: dto.date,
        startTime: dto.startTime,
        endTime: dto.endTime,
        totalPrice:0.01,
        status: 'pending',
        isMultiDay: dto.isMultiDay || false,
      };

      // Add multi-day dates if provided
      if (
        dto.isMultiDay &&
        dto.equipmentDates &&
        dto.equipmentDates.length > 0
      ) {
        equipmentBookingData.equipmentDates = dto.equipmentDates;
      }

      // Add packages if provided
      if (userPackages.length > 0) {
        equipmentBookingData.customPackages = userPackages.map(
          (pkg) => new Types.ObjectId(pkg._id),
        );
      }
      if (listedPackages.length > 0) {
        equipmentBookingData.packages = listedPackages.map(
          (pkg) => new Types.ObjectId(pkg._id),
        );
      }

      const equipmentBookingResponse =
        await this.equipmentBookingModel.create(equipmentBookingData);

      // intialize the payment process here

      let paymentLink: string | null = null;
      let trackId: string | null = null;
      try {
        const paymentRes = await this.paymentService.initiatePayment({
          bookingId: equipmentBookingResponse._id as string,
          userId: dto.bookedBy!,
          amount: 0.01,
          customerEmail: userEmail,
          type: BookingType.EQUIPMENT,
          description: `Equiipment Booking - ID: ${equipmentBookingResponse._id}`,
        });
        if(!paymentRes){
          await this.equipmentBookingModel.updateOne({_id: equipmentBookingResponse._id},{
            status:'failed',
            paymentStatus:'CANCEL'
          })
          throw new InternalServerErrorException("booking failed")
        }
        console.log(paymentRes)
        paymentLink = paymentRes.paymentLink;
        trackId = paymentRes.log?.trackId || null;
        console.log('Payment initiated successfully:', {
          paymentLink,
          trackId,
        });
      } catch (paymentError) {
        console.warn(
          'Payment initiation failed (booking remains pending):',
          paymentError.message,
        );
      }

      return {
        message: 'Equipment booking done sucessfully',
        bookingId: equipmentBookingResponse._id,
        paymentLink,
        trackId,
        bookingType: BookingType.EQUIPMENT,
      };
    } catch (error) {
      console.log(
        'something went wrong with equipment booking creation:',
        error,
      );
      throw new InternalServerErrorException(
        'Failed to create equipment booking: ' + error.message,
      );
    }
  }

  async createCombinedBooking(dto: CreateCombinedBookingDto) {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const artistProfile = await this.artistProfileModel.findOne({
        _id: new Types.ObjectId(dto.artistId),
        isVisible: true,
      });

      if (!artistProfile) {
        throw new BadRequestException('Artist not found');
      }

      const preferenceStrings = artistProfile.performPreference.map((p) =>
        p.toString().toLowerCase(),
      );
      const hasPrivatePreference = preferenceStrings.includes('private');

      if (!hasPrivatePreference) {
        throw new BadRequestException(
          'Artist not available for private bookings',
        );
      }

      const artist = await this.userModel.findById(artistProfile.user);
      if (!artist) {
        throw new BadRequestException('Artist user not found');
      }

      const isArtistMultiDay = dto.isArtistMultiDay || dto.isMultiDay;
      const isEquipmentMultiDay = dto.isEquipmentMultiDay || dto.isMultiDay;

      const artistEventDates = dto.artistEventDates || dto.eventDates || [];
      const equipmentEventDates =
        dto.equipmentEventDates || dto.eventDates || [];

      // Validate artist booking data
      if (isArtistMultiDay) {
        if (!artistEventDates || artistEventDates.length === 0) {
          throw new BadRequestException(
            'artistEventDates is required for multi-day artist bookings',
          );
        }
      } else {
        if (!dto.eventDate || !dto.startTime || !dto.endTime) {
          throw new BadRequestException(
            'eventDate, startTime, and endTime are required for single-day artist bookings',
          );
        }
      }

      const allRequestedHours: { date: string; hours: number[] }[] = [];

      // Validate artist availability for artist-specific dates
      if (isArtistMultiDay) {
        for (const eventDate of artistEventDates!) {
          const startHour = parseInt(eventDate.startTime.split(':')[0]);
          const endHour = parseInt(eventDate.endTime.split(':')[0]);
          const requestedHours: number[] = [];
          for (let h = startHour; h < endHour; h++) {
            requestedHours.push(h);
          }

          allRequestedHours.push({
            date: eventDate.date,
            hours: requestedHours,
          });

          await this.validateSingleDayAvailability(
            artistProfile._id as Types.ObjectId,
            artistProfile.user,
            eventDate.date,
            requestedHours,
          );
        }
      } else {
        const startHour = parseInt(dto.startTime!.split(':')[0]);
        const endHour = parseInt(dto.endTime!.split(':')[0]);
        const requestedHours: number[] = [];
        for (let h = startHour; h < endHour; h++) {
          requestedHours.push(h);
        }

        allRequestedHours.push({
          date: dto.eventDate!,
          hours: requestedHours,
        });

        await this.validateSingleDayAvailability(
          artistProfile._id as Types.ObjectId,
          artistProfile.user,
          dto.eventDate!,
          requestedHours,
        );
      }

      const artistBookings: any[] = [];

      if (isArtistMultiDay) {
        const firstEventDate = artistEventDates![0];
        const lastEventDate = artistEventDates![artistEventDates!.length - 1];

        const artistBooking = await this.artistBookingModel.create(
          [
            {
              artistId: artistProfile.user,
              bookedBy: new Types.ObjectId(dto.bookedBy),
              artistType: dto.eventType,
              date: firstEventDate.date,
              startTime: firstEventDate.startTime,
              endTime: lastEventDate.endTime,
              price: dto.artistPrice,
              status: 'confirmed',
              address: `${dto.venueDetails.address}, ${dto.venueDetails.city}, ${dto.venueDetails.state}, ${dto.venueDetails.country}`,
            },
          ],
          { session },
        );
        artistBookings.push(artistBooking[0]);
      } else {
        const artistBooking = await this.artistBookingModel.create(
          [
            {
              artistId: artistProfile.user,
              bookedBy: new Types.ObjectId(dto.bookedBy),
              artistType: dto.eventType,
              date: dto.eventDate!,
              startTime: dto.startTime!,
              endTime: dto.endTime!,
              price: dto.artistPrice,
              status: 'confirmed',
              address: `${dto.venueDetails.address}, ${dto.venueDetails.city}, ${dto.venueDetails.state}, ${dto.venueDetails.country}`,
            },
          ],
          { session },
        );
        artistBookings.push(artistBooking[0]);
      }

      let equipmentBooking: any = null;

      const hasEquipmentPackages =
        dto.selectedEquipmentPackages &&
        dto.selectedEquipmentPackages.length > 0;
      const hasCustomPackages =
        dto.selectedCustomPackages && dto.selectedCustomPackages.length > 0;
      const hasEquipmentPrice = dto.equipmentPrice && dto.equipmentPrice > 0;

      // Only create equipment booking if there are packages AND a price > 0
      if ((hasEquipmentPackages || hasCustomPackages) && hasEquipmentPrice) {
        const equipmentDate = isEquipmentMultiDay
          ? equipmentEventDates![0].date
          : dto.eventDate!;
        const equipmentStartTime = isEquipmentMultiDay
          ? equipmentEventDates![0].startTime
          : dto.startTime!;
        const equipmentEndTime = isEquipmentMultiDay
          ? equipmentEventDates![equipmentEventDates!.length - 1].endTime
          : dto.endTime!;

        const equipmentBookingData: any = {
          bookedBy: new Types.ObjectId(dto.bookedBy),
          equipments: [],
          packages: hasEquipmentPackages
            ? dto.selectedEquipmentPackages?.map(
                (p) => new Types.ObjectId(p),
              ) || []
            : [],
          customPackages: hasCustomPackages
            ? dto.selectedCustomPackages?.map((p) => new Types.ObjectId(p)) ||
              []
            : [],
          date: equipmentDate,
          startTime: equipmentStartTime,
          endTime: equipmentEndTime,
          totalPrice: dto.equipmentPrice || 0,
          status: 'confirmed',
          address: `${dto.venueDetails.address}, ${dto.venueDetails.city}, ${dto.venueDetails.state}, ${dto.venueDetails.country}`,
          isMultiDay: isEquipmentMultiDay || false,
        };

        // Add multi-day equipment dates if applicable
        if (
          isEquipmentMultiDay &&
          equipmentEventDates &&
          equipmentEventDates.length > 0
        ) {
          equipmentBookingData.equipmentDates = equipmentEventDates.map(
            (eventDate) => ({
              date: eventDate.date,
              startTime: eventDate.startTime,
              endTime: eventDate.endTime,
            }),
          );
        }

        equipmentBooking = await this.equipmentBookingModel.create(
          [equipmentBookingData],
          { session },
        );
      }

      // Use the earliest start date/time as the primary booking date
      const allDates = [...artistEventDates, ...equipmentEventDates].filter(
        Boolean,
      );
      const earliestDate = allDates.length > 0 ? allDates[0] : null;

      const combinedDate = earliestDate?.date || dto.eventDate!;
      const combinedStartTime = earliestDate?.startTime || dto.startTime!;

      // Use the latest end time among all bookings
      const allEndTimes = allDates.map((d) => d.endTime).filter(Boolean);
      const latestEndTime =
        allEndTimes.length > 0
          ? allEndTimes[allEndTimes.length - 1]
          : dto.endTime!;

      const combineBooking = await this.combineBookingModel.create(
        [
          {
            bookingType:
              (hasEquipmentPackages || hasCustomPackages) && hasEquipmentPrice
                ? 'combined'
                : 'artist_only',
            bookedBy: new Types.ObjectId(dto.bookedBy),
            artistBookingId: artistBookings[0]._id,
            equipmentBookingId: equipmentBooking
              ? equipmentBooking[0]._id
              : null,
            date: combinedDate,
            startTime: combinedStartTime,
            endTime: latestEndTime,
            totalPrice: dto.totalPrice,
            status: 'confirmed',
            address: `${dto.venueDetails.address}, ${dto.venueDetails.city}, ${dto.venueDetails.state}, ${dto.venueDetails.country}`,
            userDetails: dto.userDetails,
            venueDetails: dto.venueDetails,
            eventDescription: dto.eventDescription,
            specialRequests: dto.specialRequests,
            // Store both legacy and new format for compatibility
            isMultiDay: isArtistMultiDay || isEquipmentMultiDay || false,
            eventDates:
              artistEventDates.length > 0 ? artistEventDates : undefined,
            // New flexible format
            isArtistMultiDay: isArtistMultiDay || false,
            artistEventDates: isArtistMultiDay ? artistEventDates : undefined,
            isEquipmentMultiDay: isEquipmentMultiDay || false,
            equipmentEventDates: isEquipmentMultiDay
              ? equipmentEventDates
              : undefined,
            totalHours: dto.totalHours || undefined,
          },
        ],
        { session },
      );

      for (const dayData of allRequestedHours) {
        const maxBookedHour = Math.max(...dayData.hours);
        const cooldownHours: number[] = [];

        if (artistProfile.cooldownPeriodHours > 0) {
          const cooldownEndHour =
            maxBookedHour + 1 + artistProfile.cooldownPeriodHours;
          for (
            let hour = maxBookedHour + 1;
            hour < cooldownEndHour && hour < 24;
            hour++
          ) {
            cooldownHours.push(hour);
          }
        }

        const allHoursToReserve = [...dayData.hours, ...cooldownHours];

        await this.artistUnavailableModel.updateOne(
          {
            artistProfile: artistProfile._id,
            date: new Date(dayData.date),
          },
          {
            $addToSet: { hours: { $each: allHoursToReserve } },
          },
          { upsert: true, session },
        );
      }

      for (const artistBooking of artistBookings) {
        await this.artistBookingModel.updateOne(
          { _id: artistBooking._id },
          { combineBookingRef: combineBooking[0]._id },
          { session },
        );
      }

      if (equipmentBooking) {
        await this.equipmentBookingModel.updateOne(
          { _id: equipmentBooking[0]._id },
          { combineBookingRef: combineBooking[0]._id },
          { session },
        );
      }

      await session.commitTransaction();

      const responseData = {
        message: 'Booking created successfully',
        data: {
          _id: combineBooking[0]._id,
          artistId: dto.artistId,
          bookedBy: dto.bookedBy,
          eventType: dto.eventType,
          status: 'confirmed',
          totalPrice: dto.totalPrice,
          bookingDate: new Date().toISOString(),
          isMultiDay: isArtistMultiDay || isEquipmentMultiDay || false,
          ...(isArtistMultiDay || isEquipmentMultiDay
            ? {
                eventDates:
                  artistEventDates.length > 0
                    ? artistEventDates
                    : equipmentEventDates,
                totalHours: dto.totalHours,
              }
            : {
                eventDate: dto.eventDate!,
                startTime: dto.startTime!,
                endTime: dto.endTime!,
              }),
        },
      };

      return responseData;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  private async validateSingleDayAvailability(
    artistProfileId: Types.ObjectId,
    artistUserId: Types.ObjectId,
    eventDate: string,
    requestedHours: number[],
  ) {
    const unavailable = await this.artistUnavailableModel.findOne({
      artistProfile: artistProfileId,
      date: new Date(eventDate),
    });

    if (unavailable) {
      const conflict = requestedHours.some((hour) =>
        unavailable.hours.includes(hour),
      );
      if (conflict) {
        throw new ConflictException(
          `Artist not available for selected time on ${eventDate}.`,
        );
      }
    }

    // Also check against existing bookings to prevent double booking
    const existingBookings = await this.artistBookingModel.find({
      artistId: artistUserId,
      date: eventDate,
      status: { $in: ['pending', 'confirmed'] },
    });

    for (const booking of existingBookings) {
      const bookedStartHour = parseInt(booking.startTime.split(':')[0]);
      const bookedEndHour = parseInt(booking.endTime.split(':')[0]);
      const bookedHours: number[] = [];
      for (let h = bookedStartHour; h < bookedEndHour; h++) {
        bookedHours.push(h);
      }

      const conflict = requestedHours.some((hour) =>
        bookedHours.includes(hour),
      );

      if (conflict) {
        throw new ConflictException(
          `Artist already has a booking during the selected time on ${eventDate}.`,
        );
      }
    }
  }

  async checkUserRoleAndProfile(userId: string) {
    try {
      const user = await this.userModel.findById(userId);
      if (!user) {
        return { error: 'User not found', userId };
      }

      const artistProfile = user.roleProfile
        ? await this.artistProfileModel.findById(user.roleProfile)
        : null;

      return {
        userId,
        user: {
          role: user.role,
          firstName: user.firstName,
          lastName: user.lastName,
          isActive: user.isActive,
          profilePicture: user.profilePicture,
        },
        artistProfile: artistProfile
          ? {
              _id: artistProfile._id,
              stageName: artistProfile.stageName,
              profileImage: artistProfile.profileImage,
              profileCoverImage: artistProfile.profileCoverImage,
            }
          : null,
        diagnosis: {
          userExists: true,
          isArtistRole: user.role === 'ARTIST',
          hasArtistProfile: !!artistProfile,
          recommendedAction:
            !artistProfile && user.role === 'ARTIST'
              ? 'Create missing artist profile'
              : artistProfile
                ? 'Profile exists - check image population'
                : 'User is not an artist',
        },
      };
    } catch (error) {
      console.error('❌ checkUserRoleAndProfile error:', error);
      return { error: error.message, userId };
    }
  }

  async createMissingArtistProfile(userId: string) {
    try {
      // Get the user first
      const user = await this.userModel.findById(userId);
      if (!user) {
        return { error: 'User not found', userId };
      }

      const existingProfile = user.roleProfile
        ? await this.artistProfileModel.findById(user.roleProfile)
        : null;

      if (existingProfile) {
        return {
          message: 'Artist profile already exists',
          userId,
          profileId: existingProfile._id,
          stageName: existingProfile.stageName,
        };
      }

      // Check if user should have an artist profile
      if (user.role !== 'ARTIST') {
        return {
          error: 'User is not an artist',
          userId,
          userRole: user.role,
        };
      }

      const newProfile = new this.artistProfileModel({
        user: userId,
        stageName: `${user.firstName} ${user.lastName}`.trim() || 'Artist',
        gender: 'Not Specified',
        artistType: 'DANCER',
        about: `Professional artist based in Kuwait`,
        yearsOfExperience: 1,
        skills: [],
        musicLanguages: [],
        awards: [],
        pricePerHour: 100,
        profileImage: user.profilePicture || '',
        profileCoverImage: '',
        youtubeLink: '',
        likeCount: 0,
        category: 'Entertainment',
        country: 'Kuwait',
        cooldownPeriodHours: 2,
        maximumPerformanceHours: 4,
        genres: [],
        performPreference: ['private'],
        isVisible: true,
      });

      const savedProfile = await newProfile.save();
      await this.userModel.findByIdAndUpdate(userId, {
        roleProfile: savedProfile._id,
        roleProfileRef: 'ArtistProfile',
      });

      return {
        message: 'Successfully created artist profile and linked to user',
        userId,
        profileId: savedProfile._id,
        stageName: savedProfile.stageName,
        profileImage: savedProfile.profileImage,
        created: true,
        linkedToUser: true,
      };
    } catch (error) {
      console.error('❌ createMissingArtistProfile error:', error);
      return { error: error.message, userId };
    }
  }

  async syncUserProfilePictureToArtist(artistUserId: string) {
    try {
      // Get the user first
      const user = await this.userModel.findById(artistUserId);
      if (!user) {
        return { error: 'User not found', artistUserId };
      }

      // Get the artist profile by user ID
      const artistProfile = await this.artistProfileModel.findOne({
        user: artistUserId,
      });
      if (!artistProfile) {
        return { error: 'Artist profile not found', artistUserId };
      }

      if (!user.profilePicture) {
        return {
          error: 'User does not have a profile picture to copy',
          artistUserId,
          userHasProfilePicture: false,
        };
      }

      if (artistProfile.profileImage) {
        return {
          message: 'Artist already has a profile image',
          artistUserId,
          artistAlreadyHasImage: true,
          currentProfileImage: artistProfile.profileImage,
        };
      }

      // Copy user profile picture to artist profile
      await this.artistProfileModel.updateOne(
        { _id: artistProfile._id },
        { profileImage: user.profilePicture },
      );

      return {
        message: 'Successfully synced user profile picture to artist profile',
        artistUserId,
        copiedImageUrl: user.profilePicture,
        success: true,
      };
    } catch (error) {
      console.error('❌ syncUserProfilePictureToArtist error:', error);
      return { error: error.message, artistUserId };
    }
  }

  async getUserBookings(userId: string) {
    try {
      console.log('🔍 getUserBookings called for userId:', userId);
      const userObjectId = new Types.ObjectId(userId);

      const artistBookings = await this.artistBookingModel
        .find({
          bookedBy: userObjectId,
          $or: [
            { combineBookingRef: { $exists: false } },
            { combineBookingRef: null }
          ]
        })
        .populate({
          path: 'artistId',
          select: 'firstName lastName profilePicture avatar email',
        })
        .populate('bookedBy', 'firstName lastName phoneNumber email')
        .sort({ createdAt: -1 })
        .lean();

      const artistUserIds = artistBookings
        .map((booking) => (booking.artistId as any)?._id)
        .filter((id) => id);

      const users = await this.userModel
        .find({ _id: { $in: artistUserIds }, role: 'ARTIST' })
        .select('_id roleProfile')
        .lean();

      const roleProfileIds = users
        .map((user) => user.roleProfile)
        .filter((id) => id);

      users.forEach((user) => {});

      const artistProfiles = await this.artistProfileModel
        .find({ _id: { $in: roleProfileIds } })
        .select(
          '_id user stageName profileImage profileCoverImage pricePerHour about category location country skills yearsOfExperience artistType availability gender',
        )
        .lean();

      const artistProfileMap = new Map();
      artistProfiles.forEach((profile) => {
        artistProfileMap.set(profile.user.toString(), profile);
      });

      const equipmentBookings = await this.equipmentBookingModel
        .find({
          bookedBy: userObjectId,
          $or: [
            { combineBookingRef: { $exists: false } },
            { combineBookingRef: null }
          ]
        })
        .populate({
          path: 'equipments.equipmentId',
          select: 'name images category description pricePerDay specifications',
        })
        .populate({
          path: 'packages',
          select:
            'name description coverImage images totalPrice items createdBy',
          populate: [
            {
              path: 'items.equipmentId',
              select: 'name images category pricePerDay',
            },
            {
              path: 'createdBy',
              select: 'firstName lastName email roleProfile',
              populate: {
                path: 'roleProfile',
                select: 'companyName businessDescription',
              },
            },
          ],
        })
        .populate({
          path: 'customPackages',
          select: 'name description items totalPricePerDay createdBy status',
          populate: {
            path: 'items.equipmentId',
            select: 'name images category pricePerDay',
          },
        })
        .populate('bookedBy', 'firstName lastName phoneNumber email')
        .sort({ createdAt: -1 })
        .lean();

      console.log('🔍 Found equipment bookings:', equipmentBookings.length);
      if (equipmentBookings.length > 0) {
        console.log('🔍 First equipment booking:', JSON.stringify(equipmentBookings[0], null, 2));
      }

      const combinedBookings = await this.combineBookingModel
        .find({ bookedBy: userObjectId })
        .populate({
          path: 'artistBookingId',
          select: 'price date startTime endTime status artistId artistType',
          populate: {
            path: 'artistId',
            select: 'firstName lastName profilePicture avatar email',
          },
        })
        .populate({
          path: 'equipmentBookingId',
          select:
            'totalPrice equipments packages customPackages date startTime endTime status',

          populate: [
            {
              path: 'equipments.equipmentId',
              select:
                'name images category description pricePerDay specifications',
            },
            {
              path: 'packages',
              select:
                'name description coverImage images totalPrice items createdBy',
              populate: [
                {
                  path: 'items.equipmentId',
                  select: 'name images category pricePerDay',
                },
                {
                  path: 'createdBy',
                  select: 'firstName lastName email roleProfile',
                  populate: {
                    path: 'roleProfile',
                    select: 'companyName businessDescription',
                  },
                },
              ],
            },
            {
              path: 'customPackages',
              select:
                'name description items totalPricePerDay createdBy status',
              populate: {
                path: 'items.equipmentId',
                select: 'name images category pricePerDay',
              },
            },
          ],
        })
        .populate('bookedBy', 'firstName lastName phoneNumber email')
        .sort({ createdAt: -1 })
        .lean();

      const combinedArtistUserIds = combinedBookings
        .map((booking) => (booking as any)?.artistBookingId?.artistId?._id)
        .filter((id) => id);

      if (combinedArtistUserIds.length > 0) {
        const combinedUsers = await this.userModel
          .find({ _id: { $in: combinedArtistUserIds }, role: 'ARTIST' })
          .select('_id roleProfile')
          .lean();

        const combinedRoleProfileIds = combinedUsers
          .map((user) => user.roleProfile)
          .filter((id) => id);

        const combinedArtistProfiles = await this.artistProfileModel
          .find({ _id: { $in: combinedRoleProfileIds } })
          .select(
            '_id user stageName profileImage profileCoverImage pricePerHour about category location country skills yearsOfExperience artistType availability gender',
          )
          .lean();

        combinedArtistProfiles.forEach((profile) => {});

        // Add to the same map
        combinedArtistProfiles.forEach((profile) => {
          artistProfileMap.set(profile.user.toString(), profile);
        });

        // Check for missing profiles
        combinedArtistUserIds.forEach((userId) => {
          if (!artistProfileMap.has(userId.toString())) {
            console.log(`❌ No artist profile found for user: ${userId}`);
          }
        });
      }

      const bookings: any[] = [];

      // Add artist bookings
      artistBookings.forEach((booking) => {
        const bookedByUser = booking.bookedBy as any;
        const artistData = booking.artistId as any;
        const artistProfile = artistProfileMap.get(artistData?._id?.toString());

        bookings.push({
          _id: booking._id,
          artistId: booking.artistId,
          bookedBy: booking.bookedBy,
          eventType: booking.artistType,
          eventDate: booking.date,
          startTime: booking.startTime,
          endTime: booking.endTime,
          status: booking.status,
          totalPrice: booking.price,
          artistPrice: booking.price,
          equipmentPrice: 0,
          bookingDate: (booking as any).createdAt,
          bookingType: 'artist_only',
          artist: artistData
            ? {
                _id: artistData._id,
                fullName:
                  `${artistData.firstName || ''} ${artistData.lastName || ''}`.trim(),
                stageName:
                  artistProfile?.stageName ||
                  `${artistData.firstName || ''} ${artistData.lastName || ''}`.trim() ||
                  'Artist',
                artistType: artistProfile?.artistType || booking.artistType,
                profilePicture:
                  artistProfile?.profileImage ||
                  artistProfile?.profileCoverImage ||
                  artistData?.profilePicture ||
                  null,
                profileImage:
                  artistProfile?.profileImage ||
                  artistProfile?.profileCoverImage ||
                  artistData?.profilePicture ||
                  null,
                bio: artistProfile?.about || null,
                skills: artistProfile?.skills || [],
                yearsOfExperience: artistProfile?.yearsOfExperience || 0,
                location: artistProfile?.location
                  ? {
                      city: artistProfile.location.city,
                      state: artistProfile.location.state,
                      country: artistProfile.location.country,
                    }
                  : null,
                pricing: artistProfile?.pricePerHour
                  ? {
                      hourlyRate: artistProfile.pricePerHour,
                      eventRate: artistProfile.pricePerHour,
                    }
                  : undefined,
                availability: artistProfile?.availability || null,
              }
            : undefined,
          userDetails: bookedByUser
            ? {
                name: `${bookedByUser.firstName || ''} ${bookedByUser.lastName || ''}`.trim(),
                email: bookedByUser.email || '',
                phone: bookedByUser.phoneNumber || '',
              }
            : undefined,
          venueDetails: {
            address: booking.address || '',
            city: '',
            state: '',
            country: '',
          },
          selectedEquipmentPackages: [],
          selectedCustomPackages: [],
          equipments: [],
        });
      });

      equipmentBookings.forEach((booking) => {
        const bookedByUser = booking.bookedBy as any;

        const enhancedPackages =
          (booking.packages as any[])?.map((pkg) => ({
            _id: pkg._id,
            name: pkg.name,
            description: pkg.description,
            coverImage: pkg.coverImage,
            images: pkg.images || [],
            totalPrice: pkg.totalPrice,
            provider: pkg.createdBy
              ? {
                  name: `${pkg.createdBy.firstName || ''} ${pkg.createdBy.lastName || ''}`.trim(),
                  companyName: pkg.createdBy.roleProfile?.companyName || '',
                  businessDescription:
                    pkg.createdBy.roleProfile?.businessDescription || '',
                  email: pkg.createdBy.email,
                }
              : null,
            items:
              pkg.items?.map((item) => ({
                equipmentId: item.equipmentId,
                quantity: item.quantity,
                equipment: item.equipmentId
                  ? {
                      name: item.equipmentId.name,
                      images: item.equipmentId.images || [],
                      category: item.equipmentId.category,
                      pricePerDay: item.equipmentId.pricePerDay,
                    }
                  : null,
              })) || [],
          })) || [];

        // Enhanced custom packages
        const enhancedCustomPackages =
          (booking.customPackages as any[])?.map((pkg) => {
            return {
              _id: pkg._id,
              name: pkg.name,
              description: pkg.description,
              totalPrice: pkg.totalPricePerDay || pkg.totalPrice || 0,
              isCustom: true,
              items:
                pkg.items?.map((item) => ({
                  equipmentId: item.equipmentId,
                  quantity: item.quantity,
                  pricePerDay: item.pricePerDay || 0,
                  equipment: item.equipmentId
                    ? {
                        name: item.equipmentId.name,
                        images: item.equipmentId.images || [],
                        category: item.equipmentId.category,
                        pricePerDay: item.equipmentId.pricePerDay,
                      }
                    : null,
                })) || [],
            };
          }) || [];

        // Enhanced individual equipments with calculated totals
        const enhancedEquipments =
          (booking.equipments as any[])?.map((equip) => {
            const equipmentTotal =
              equip.equipmentId && equip.quantity
                ? equip.quantity * (equip.equipmentId.pricePerDay || 0)
                : 0;

            return {
              equipmentId: equip.equipmentId,
              quantity: equip.quantity,
              totalPrice: equipmentTotal,
              equipment: equip.equipmentId
                ? {
                    name: equip.equipmentId.name,
                    images: equip.equipmentId.images || [],
                    category: equip.equipmentId.category,
                    description: equip.equipmentId.description,
                    pricePerDay: equip.equipmentId.pricePerDay,
                    specifications: equip.equipmentId.specifications,
                  }
                : null,
            };
          }) || [];

        const packageTotal = enhancedPackages.reduce(
          (sum, pkg) => sum + (pkg.totalPrice || 0),
          0,
        );
        const customPackageTotal = enhancedCustomPackages.reduce(
          (sum, pkg) => sum + (pkg.totalPrice || 0),
          0,
        );
        const individualEquipmentTotal = enhancedEquipments.reduce(
          (sum, equip) => sum + (equip.totalPrice || 0),
          0,
        );
        const runtimeCalculatedTotal =
          packageTotal + customPackageTotal + individualEquipmentTotal;

        bookings.push({
          _id: booking._id,
          artistId: '',
          bookedBy: booking.bookedBy,
          eventType: 'private',
          eventDate: booking.date,
          startTime: booking.startTime,
          endTime: booking.endTime,
          status: booking.status,
          totalPrice: booking.totalPrice,
          calculatedTotal: runtimeCalculatedTotal,
          artistPrice: 0,
          equipmentPrice: booking.totalPrice,
          bookingDate: (booking as any).createdAt,
          bookingType: 'equipment_only',
          userDetails: bookedByUser
            ? {
                name: `${bookedByUser.firstName || ''} ${bookedByUser.lastName || ''}`.trim(),
                email: bookedByUser.email || '',
                phone: bookedByUser.phoneNumber || '',
              }
            : undefined,
          venueDetails: {
            address: booking.address || '',
            city: '',
            state: '',
            country: '',
          },
          selectedEquipmentPackages: enhancedPackages,
          selectedCustomPackages: enhancedCustomPackages,
          equipments: enhancedEquipments,
        });
      });

      combinedBookings.forEach((booking) => {
        const bookedByUser = booking.bookedBy as any;
        const artistBooking = booking.artistBookingId as any;
        const equipmentBooking = booking.equipmentBookingId as any;

        const isArtistOnly =
          booking.bookingType === 'artist_only' ||
          booking.bookingType === 'artist';
        const hasZeroEquipmentPrice =
          !equipmentBooking?.totalPrice || equipmentBooking.totalPrice === 0;
        const shouldHideEquipment = isArtistOnly || hasZeroEquipmentPrice;

        const enhancedCombinedPackages = shouldHideEquipment
          ? []
          : (equipmentBooking?.packages as any[])?.map((pkg) => ({
              _id: pkg._id,
              name: pkg.name,
              description: pkg.description,
              coverImage: pkg.coverImage,
              images: pkg.images || [],
              totalPrice: pkg.totalPrice,
              provider: pkg.createdBy
                ? {
                    name: `${pkg.createdBy.firstName || ''} ${pkg.createdBy.lastName || ''}`.trim(),
                    companyName: pkg.createdBy.roleProfile?.companyName || '',
                    businessDescription:
                      pkg.createdBy.roleProfile?.businessDescription || '',
                    email: pkg.createdBy.email,
                  }
                : null,
              items:
                pkg.items?.map((item) => ({
                  equipmentId: item.equipmentId,
                  quantity: item.quantity,
                  equipment: item.equipmentId
                    ? {
                        name: item.equipmentId.name,
                        images: item.equipmentId.images || [],
                        category: item.equipmentId.category,
                        pricePerDay: item.equipmentId.pricePerDay,
                      }
                    : null,
                })) || [],
            })) || [];

        // Enhanced custom packages for combined bookings
        const enhancedCombinedCustomPackages = shouldHideEquipment
          ? []
          : (equipmentBooking?.customPackages as any[])?.map((pkg) => {
              return {
                _id: pkg._id,
                name: pkg.name,
                description: pkg.description,
                totalPrice: pkg.totalPricePerDay || pkg.totalPrice || 0,
                isCustom: true,
                items:
                  pkg.items?.map((item) => ({
                    equipmentId: item.equipmentId,
                    quantity: item.quantity,
                    pricePerDay: item.pricePerDay || 0,
                    equipment: item.equipmentId
                      ? {
                          name: item.equipmentId.name,
                          images: item.equipmentId.images || [],
                          category: item.equipmentId.category,
                          pricePerDay: item.equipmentId.pricePerDay,
                        }
                      : null,
                  })) || [],
              };
            }) || [];

        const enhancedCombinedEquipments = shouldHideEquipment
          ? []
          : (equipmentBooking?.equipments as any[])?.map((equip) => {
              const equipmentTotal =
                equip.equipmentId && equip.quantity
                  ? equip.quantity * (equip.equipmentId.pricePerDay || 0)
                  : 0;

              return {
                equipmentId: equip.equipmentId,
                quantity: equip.quantity,
                totalPrice: equipmentTotal,
                equipment: equip.equipmentId
                  ? {
                      name: equip.equipmentId.name,
                      images: equip.equipmentId.images || [],
                      category: equip.equipmentId.category,
                      description: equip.equipmentId.description,
                      pricePerDay: equip.equipmentId.pricePerDay,
                      specifications: equip.equipmentId.specifications,
                    }
                  : null,
              };
            }) || [];

        bookings.push({
          _id: booking._id,
          artistId: artistBooking?.artistId?._id || '',
          bookedBy: booking.bookedBy,
          eventType:
            booking.bookingType === 'artist_only' ? 'private' : 'private',
          // Multi-day booking support
          isMultiDay: booking.isMultiDay || false,
          eventDates: booking.eventDates || [],
          totalHours: booking.totalHours,
          eventDate: booking.date,
          startTime: booking.startTime,
          endTime: booking.endTime,
          status: booking.status,
          totalPrice: booking.totalPrice,
          artistPrice: artistBooking?.price || 0,
          equipmentPrice: shouldHideEquipment
            ? 0
            : equipmentBooking?.totalPrice || 0,
          bookingDate: (booking as any).createdAt,
          bookingType: booking.bookingType,
          artist: artistBooking?.artistId
            ? (() => {
                const combinedArtistData = artistBooking.artistId;
                const combinedArtistProfile = artistProfileMap.get(
                  combinedArtistData._id?.toString(),
                );

                return {
                  _id: combinedArtistData._id,
                  fullName:
                    `${combinedArtistData.firstName || ''} ${combinedArtistData.lastName || ''}`.trim(),
                  stageName:
                    combinedArtistProfile?.stageName ||
                    `${combinedArtistData.firstName || ''} ${combinedArtistData.lastName || ''}`.trim() ||
                    'Artist',
                  artistType:
                    combinedArtistProfile?.artistType ||
                    artistBooking.artistType ||
                    'DANCER',
                  profilePicture:
                    combinedArtistProfile?.profileImage ||
                    combinedArtistProfile?.profileCoverImage ||
                    combinedArtistData?.profilePicture ||
                    null,
                  // Also map profileImage for compatibility
                  profileImage:
                    combinedArtistProfile?.profileImage ||
                    combinedArtistProfile?.profileCoverImage ||
                    combinedArtistData?.profilePicture ||
                    null,
                  bio:
                    combinedArtistProfile?.about ||
                    `Professional ${combinedArtistProfile?.artistType || 'Artist'}`,
                  skills: combinedArtistProfile?.skills || [],
                  yearsOfExperience:
                    combinedArtistProfile?.yearsOfExperience || 0,
                  location: combinedArtistProfile?.location
                    ? {
                        city: combinedArtistProfile.location.city,
                        state: combinedArtistProfile.location.state,
                        country: combinedArtistProfile.location.country,
                      }
                    : null,
                  pricing: combinedArtistProfile?.pricePerHour
                    ? {
                        hourlyRate: combinedArtistProfile.pricePerHour,
                        eventRate: combinedArtistProfile.pricePerHour,
                      }
                    : undefined,
                  availability: combinedArtistProfile?.availability || null,
                };
              })()
            : undefined,
          userDetails:
            booking.userDetails ||
            (bookedByUser
              ? {
                  name: `${bookedByUser.firstName || ''} ${bookedByUser.lastName || ''}`.trim(),
                  email: bookedByUser.email || '',
                  phone: bookedByUser.phoneNumber || '',
                }
              : undefined),
          venueDetails: booking.venueDetails || {
            address: booking.address || '',
            city: '',
            state: '',
            country: '',
          },
          eventDescription: booking.eventDescription,
          specialRequests: booking.specialRequests,
          // Enhanced equipment details
          selectedEquipmentPackages: enhancedCombinedPackages,
          selectedCustomPackages: enhancedCombinedCustomPackages,
          equipments: enhancedCombinedEquipments,
        });
      });

      bookings.sort(
        (a, b) =>
          new Date(b.bookingDate).getTime() - new Date(a.bookingDate).getTime(),
      );

      return bookings;
    } catch (error) {
      throw new BadRequestException('Failed to fetch user bookings');
    }
  }

  // ** handle status updates from payment gateway **
  private readonly bookingHandlers = {
    [BookingType.EQUIPMENT]: async (bookingId: string, status: string) => {
      await this.equipmentBookingModel.updateOne(
        { _id: bookingId },
        { paymentStatus: status, status: status },
      );
    },
  };

  async updateBookingStatus(
    type: BookingType,
    bookingId: string,
    status: UpdatePaymentStatus,
  ): Promise<void> {
    const handler = this.bookingHandlers[type];
    if (!handler) {
      throw new Error(`No handler for booking type: ${type}`);
    }
    await handler(bookingId, status);
  }


  async getEquipmentBookingById(bookingId:string){
     const bookingDetails = await this.equipmentBookingModel.findById(bookingId)
     return bookingDetails
  }

  async updateEquipmentBookingStatus(bookingId:string,bookingstaus:BookingStatus,paymentstatus:UpdatePaymentStatus){
     const booking = await this.equipmentBookingModel.findById(bookingId)
     if(!booking){
      throw new Error("booking not found")
     }
     booking.status = bookingstaus
     booking.paymentStatus = paymentstatus
     await booking.save()
  }

  async getMyEquipmentBookings(
    userId: string,
    status?: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const userObjectId = new Types.ObjectId(userId);

    const query: any = {
      bookedBy: userObjectId,
      $or: [
        { combineBookingRef: { $exists: false } },
        { combineBookingRef: null }
      ]
    };

    if (status && status !== 'all') {
      query.status = status;
    }

    const total = await this.equipmentBookingModel.countDocuments(query);

    const results = await this.equipmentBookingModel
      .find(query)
      .populate({
        path: 'equipments.equipmentId',
        select: 'name images category description pricePerDay specifications',
      })
      .populate({
        path: 'packages',
        select:
          'name description coverImage images totalPrice items createdBy',
        populate: [
          {
            path: 'items.equipmentId',
            select: 'name images category pricePerDay',
          },
          {
            path: 'createdBy',
            select: 'firstName lastName email roleProfile',
            populate: {
              path: 'roleProfile',
              select: 'companyName businessDescription',
            },
          },
        ],
      })
      .populate({
        path: 'customPackages',
        select: 'name description items totalPricePerDay createdBy status',
        populate: {
          path: 'items.equipmentId',
          select: 'name images category pricePerDay',
        },
      })
      .populate('bookedBy', 'firstName lastName phoneNumber email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const bookings = (results || []).map((booking: any) => {
      const isMultiDay = booking.isMultiDay && booking.equipmentDates && booking.equipmentDates.length > 0;
      const numberOfDays = isMultiDay ? booking.equipmentDates.length : 1;
      const startDate = isMultiDay ? booking.equipmentDates[0].date : booking.date;
      const endDate = isMultiDay
        ? booking.equipmentDates[booking.equipmentDates.length - 1].date
        : booking.date;

      const enhancedPackages = (booking.packages || []).map((pkg: any) => ({
        _id: pkg._id,
        name: pkg.name,
        description: pkg.description,
        totalPrice: pkg.totalPrice,
        coverImage: pkg.coverImage,
        items:
          pkg.items?.map((item: any) => ({
            equipmentId: item.equipmentId,
            quantity: item.quantity,
            equipment: item.equipmentId
              ? {
                  name: item.equipmentId.name,
                  images: item.equipmentId.images || [],
                  category: item.equipmentId.category,
                  pricePerDay: item.equipmentId.pricePerDay,
                }
              : null,
          })) || [],
      }));

      const enhancedCustomPackages = (booking.customPackages || []).map((pkg: any) => ({
        _id: pkg._id,
        name: pkg.name,
        description: pkg.description,
        totalPricePerDay: pkg.totalPricePerDay || 0,
        items:
          pkg.items?.map((item: any) => ({
            equipmentId: item.equipmentId,
            quantity: item.quantity,
            pricePerDay: item.pricePerDay || 0,
            equipment: item.equipmentId
              ? {
                  name: item.equipmentId.name,
                  images: item.equipmentId.images || [],
                  category: item.equipmentId.category,
                  pricePerDay: item.equipmentId.pricePerDay,
                }
              : null,
          })) || [],
      }));

      const enhancedEquipments = (booking.equipments || []).map((equip: any) => ({
        equipmentId: equip.equipmentId,
        quantity: equip.quantity,
        equipment: equip.equipmentId
          ? {
              name: equip.equipmentId.name,
              images: equip.equipmentId.images || [],
              category: equip.equipmentId.category,
              description: equip.equipmentId.description,
              pricePerDay: equip.equipmentId.pricePerDay,
              specifications: equip.equipmentId.specifications,
            }
          : null,
      }));

      return {
        _id: booking._id,
        bookedBy: booking.bookedBy?._id || booking.bookedBy,
        startDate,
        endDate,
        numberOfDays,
        totalPrice: booking.totalPrice,
        status: booking.status,
        userDetails: booking.bookedBy
          ? {
              name: `${booking.bookedBy.firstName || ''} ${booking.bookedBy.lastName || ''}`.trim(),
              email: booking.bookedBy.email || '',
              phone: booking.bookedBy.phoneNumber || '',
            }
          : { name: '', email: '', phone: '' },
        venueDetails: {
          address: booking.address || '',
          city: '',
          state: '',
          country: '',
        },
        packages: enhancedPackages,
        customPackages: enhancedCustomPackages,
        equipments: enhancedEquipments,
        bookingDate: booking.createdAt,
        createdAt: booking.createdAt,
        updatedAt: booking.updatedAt,
      };
    });

    return {
      bookings,
      pagination: {
        current: page,
        total,
        count: bookings.length,
        perPage: limit,
      },
    };
  }
}
