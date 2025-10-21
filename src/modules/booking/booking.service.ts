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
  ) {}

  async getArtistAvailability(artistId: string, month?: number, year?: number) {
    try {
      // Validate artist exists and accepts private bookings
      const artistExists = await this.artistProfileModel.findOne({
        _id: new Types.ObjectId(artistId),
        isVisible: true,
      });

      if (!artistExists) {
        throw new BadRequestException('Artist not found');
      }

      // Check if artist accepts private bookings
      const preferenceStrings = artistExists.performPreference.map((p) =>
        p.toString().toLowerCase(),
      );
      const hasPrivatePreference = preferenceStrings.includes('private');

      if (!hasPrivatePreference) {
        throw new BadRequestException(
          'Artist not available for private bookings',
        );
      }

      // Use the artist-availability service to get unavailability data directly
      const unavailabilityData =
        await this.artistAvailabilityService.getArtistUnavailabilityByProfileId(
          artistId,
          month,
          year,
        );

      // Get confirmed bookings to add to unavailable slots
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

      console.log(
        `🔍 Found ${existingBookings.length} existing bookings for artist`,
      );

      // Start with the unavailability data from the service
      const unavailableByDate = { ...unavailabilityData.unavailableSlots };

      // Add confirmed bookings and their cooldown periods to the unavailable slots
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

  // 🧮 NEW: Optimized pricing calculation endpoint
  async calculateBookingPricing(dto: CalculatePricingDto) {
    try {
      console.log('🔄 calculateBookingPricing called with:', dto);

      // Validate that we have either an artist or equipment packages
      if (!dto.artistId && (!dto.selectedEquipmentPackages || dto.selectedEquipmentPackages.length === 0) && 
          (!dto.selectedCustomPackages || dto.selectedCustomPackages.length === 0)) {
        throw new BadRequestException(
          'Either artistId or equipment packages must be provided for pricing calculation',
        );
      }

      let totalHours = 0;
      let breakdown: Array<{ date: string; hours: number; rate: number }> = [];

      if (dto.eventDates && dto.eventDates.length > 0) {
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

      // Calculate artist pricing only if artistId is provided
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

        artistPricingAmount =
          await this.timeSlotService.calculateBookingCost(
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

      // Calculate individual equipment items pricing
      if (dto.equipments && dto.equipments.length > 0) {
        try {
          console.log('🔧 Calculating individual equipment prices:', dto.equipments);
          
          for (const equipmentItem of dto.equipments) {
            const equipmentData = await this.equipmentModel.findById(equipmentItem.equipmentId);
            if (equipmentData) {
              // Calculate: quantity × pricePerDay × totalHours (duration in days)  
              const itemPrice = equipmentItem.quantity * Number(equipmentData.pricePerDay) * totalHours;
              equipmentFee.amount += itemPrice;
              equipmentFee.packages.push({
                id: equipmentData.id,
                name: `${equipmentData.name} (x${equipmentItem.quantity})`,
                price: itemPrice,
                type: 'individual',
              });
              
              console.log(`💰 Equipment: ${equipmentData.name}, Qty: ${equipmentItem.quantity}, Price/Day: ${equipmentData.pricePerDay}, Hours: ${totalHours}, Total: ${itemPrice}`);
            }
          }
        } catch (equipmentError) {
          console.warn('Individual equipment pricing calculation failed:', equipmentError);
        }
      }

      if (dto.selectedEquipmentPackages && dto.selectedEquipmentPackages.length > 0) {
        try {
          for (const packageId of dto.selectedEquipmentPackages) {
            const packageData = await this.equipmentPackageModel.findById(packageId);
            if (packageData) {
              const packagePrice = Number(packageData.totalPrice) * totalHours;
              equipmentFee.amount += packagePrice;
              equipmentFee.packages.push({
                id: packageData.id,
                name: packageData.name || 'Equipment Package',
                price: packagePrice,
                type: 'provider',
              });
            }
          }
        } catch (equipmentError) {
          console.warn('Equipment package pricing calculation failed:', equipmentError);
        }
      }

      if (dto.selectedCustomPackages && dto.selectedCustomPackages.length > 0) {
        try {
          for (const customPackageId of dto.selectedCustomPackages) {
            const customPackageData = await this.customEquipmentPackageModel.findById(customPackageId);
            if (customPackageData) {
              const customPackagePrice = customPackageData.totalPricePerDay * totalHours;
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
          console.warn('Custom equipment package pricing calculation failed:', customEquipmentError);
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
      console.log(`🔍 VERIFY: Checking artist ID: ${artistId}`);

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

      // reserve the spot for artist calendar
      // Parse date consistently using UTC to match the availability storage format
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

  async createEquipmentBooking(dto: CreateEquipmentBookingDto) {
    let finalEquipmentList: any[] = [];
    let userPackages: UserPackage[] = [];
    let listedPackages: ListedPackage[] = [];

    // Add individual equipment items directly from DTO
    if (dto.equipments && dto.equipments.length > 0) {
      console.log('🔧 Adding individual equipment items:', dto.equipments);
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

    // Add equipment items from custom packages
    for (const pkg of userPackages) {
      for (const item of pkg.items) {
        finalEquipmentList.push({
          equipmentId: item.equipmentId,
          quantity: item.quantity,
        });
      }
    }

    // Add equipment items from regular packages
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
        const equipmentData = await this.equipmentModel.findById(equipmentItem.equipmentId);
        if (equipmentData) {
          const itemTotal = equipmentItem.quantity * equipmentData.pricePerDay;
          serverCalculatedTotal += itemTotal;
          console.log(`💰 Equipment ${equipmentData.name}: ${equipmentItem.quantity} × ${equipmentData.pricePerDay} = ${itemTotal}`);
        }
      } catch (error) {
        console.warn(`Failed to calculate price for equipment ${equipmentItem.equipmentId}:`, error);
      }
    }
    
    // Add custom package prices
    for (const pkg of userPackages) {
      serverCalculatedTotal += pkg.totalPricePerDay || 0;
      console.log(`💰 Custom Package ${pkg.name}: ${pkg.totalPricePerDay}`);
    }
    
    // Add regular package prices  
    for (const pkg of listedPackages) {
      serverCalculatedTotal += pkg.totalPrice || 0;
      console.log(`💰 Package ${pkg.name}: ${pkg.totalPrice}`);
    }
    
    console.log(`💰 Server calculated total: ${serverCalculatedTotal}, Client provided: ${dto.totalPrice}`);
    
    // Use server-calculated price if there's a significant discrepancy
    const finalPrice = Math.abs(serverCalculatedTotal - dto.totalPrice) > 1 
      ? serverCalculatedTotal 
      : dto.totalPrice;

    if (finalPrice !== dto.totalPrice) {
      console.warn(`⚠️  Price mismatch detected. Using server-calculated: ${finalPrice} instead of client: ${dto.totalPrice}`);
    }

    // ** database insert goes from here
    try {
      const equipmentBookingResponse = await this.equipmentBookingModel.create({
        bookedBy: new Types.ObjectId(dto.bookedBy),
        address: dto.address,
        equipments: finalEquipmentList.map((eq) => ({
          equipmentId: eq.equipmentId,
          quantity: eq.quantity,
        })),
        date: dto.date,
        startTime: dto.startTime,
        endTime: dto.endTime,
        totalPrice: finalPrice, // Use validated price
        status: 'confirmed',
      });
      return {
        message: 'Equipment booking done sucessfully',
        bookingId: equipmentBookingResponse._id,
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

      // Get the user details
      const artist = await this.userModel.findById(artistProfile.user);
      if (!artist) {
        throw new BadRequestException('Artist user not found');
      }

      // Determine if this is multi-day or single-day booking
      const isMultiDay =
        dto.isMultiDay && dto.eventDates && dto.eventDates.length > 0;

      // Validate input data
      if (isMultiDay) {
        if (!dto.eventDates || dto.eventDates.length === 0) {
          throw new BadRequestException(
            'eventDates is required for multi-day bookings',
          );
        }
      } else {
        if (!dto.eventDate || !dto.startTime || !dto.endTime) {
          throw new BadRequestException(
            'eventDate, startTime, and endTime are required for single-day bookings',
          );
        }
      }

      // Handle availability validation for both single and multi-day
      const allRequestedHours: { date: string; hours: number[] }[] = [];

      if (isMultiDay) {
        for (const eventDate of dto.eventDates!) {
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

      // Create a single artist booking (whether single or multi-day)
      const artistBookings: any[] = [];

      if (isMultiDay) {
        // For multi-day bookings, create ONE artist booking with first day's info
        // The multi-day details will be stored in the CombineBooking
        const firstEventDate = dto.eventDates![0];
        const lastEventDate = dto.eventDates![dto.eventDates!.length - 1];

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
        const equipmentDate = isMultiDay
          ? dto.eventDates![0].date
          : dto.eventDate!;
        const equipmentStartTime = isMultiDay
          ? dto.eventDates![0].startTime
          : dto.startTime!;
        const equipmentEndTime = isMultiDay
          ? dto.eventDates![dto.eventDates!.length - 1].endTime
          : dto.endTime!;

        equipmentBooking = await this.equipmentBookingModel.create(
          [
            {
              bookedBy: new Types.ObjectId(dto.bookedBy),
              equipments: [],
              packages: hasEquipmentPackages
                ? dto.selectedEquipmentPackages?.map(
                    (p) => new Types.ObjectId(p),
                  ) || []
                : [],
              customPackages: hasCustomPackages
                ? dto.selectedCustomPackages?.map(
                    (p) => new Types.ObjectId(p),
                  ) || []
                : [],
              date: equipmentDate,
              startTime: equipmentStartTime,
              endTime: equipmentEndTime,
              totalPrice: dto.equipmentPrice || 0,
              status: 'confirmed',
              address: `${dto.venueDetails.address}, ${dto.venueDetails.city}, ${dto.venueDetails.state}, ${dto.venueDetails.country}`,
            },
          ],
          { session },
        );
      }

      const combinedDate = isMultiDay
        ? dto.eventDates![0].date
        : dto.eventDate!;
      const combinedStartTime = isMultiDay
        ? dto.eventDates![0].startTime
        : dto.startTime!;
      const combinedEndTime = isMultiDay
        ? dto.eventDates![dto.eventDates!.length - 1].endTime
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
            endTime: combinedEndTime,
            totalPrice: dto.totalPrice,
            status: 'confirmed',
            address: `${dto.venueDetails.address}, ${dto.venueDetails.city}, ${dto.venueDetails.state}, ${dto.venueDetails.country}`,
            userDetails: dto.userDetails,
            venueDetails: dto.venueDetails,
            eventDescription: dto.eventDescription,
            specialRequests: dto.specialRequests,
            isMultiDay: isMultiDay || false,
            eventDates: isMultiDay ? dto.eventDates! : undefined,
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
            maxBookedHour + 1 + artistProfile.cooldownPeriodHours; // +1 because maxBookedHour is start of last hour
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
          isMultiDay: isMultiDay || false,
          ...(isMultiDay
            ? {
                eventDates: dto.eventDates!,
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

  private getArtistProfileImage(artistProfile: any, artistUser?: any): string | null {
    // Priority:
    // 1. Artist profile.profileImage (direct from ArtistProfile schema)
    // 2. Artist profile.profileCoverImage 
    // 3. User profilePicture (fallback)
    // 4. User avatar (fallback)
    // 5. Return null (let frontend handle default)

    console.log('🖼️ Artist Profile Image Resolution:', {
      hasArtistProfile: !!artistProfile,
      profileImage: artistProfile?.profileImage,
      profileCoverImage: artistProfile?.profileCoverImage,
      userProfilePicture: artistUser?.profilePicture,
      userAvatar: artistUser?.avatar,
    });

    // First check artist profile image (direct from ArtistProfile schema)
    if (artistProfile?.profileImage && typeof artistProfile.profileImage === 'string' && artistProfile.profileImage.trim() !== '') {
      console.log(`🖼️ ✅ Using ArtistProfile.profileImage: ${artistProfile.profileImage}`);
      return artistProfile.profileImage;
    }

    // Then check artist profile cover image as alternative
    if (artistProfile?.profileCoverImage && typeof artistProfile.profileCoverImage === 'string' && artistProfile.profileCoverImage.trim() !== '') {
      console.log(`🖼️ ✅ Using ArtistProfile.profileCoverImage: ${artistProfile.profileCoverImage}`);
      return artistProfile.profileCoverImage;
    }

    // Check user profile picture as fallback
    if (artistUser?.profilePicture && typeof artistUser.profilePicture === 'string' && artistUser.profilePicture.trim() !== '') {
      console.log(`🖼️ ✅ Using User.profilePicture: ${artistUser.profilePicture}`);
      return artistUser.profilePicture;
    }

    // Check user avatar as final fallback
    if (artistUser?.avatar && typeof artistUser.avatar === 'string' && artistUser.avatar.trim() !== '') {
      console.log(`🖼️ ✅ Using User.avatar: ${artistUser.avatar}`);
      return artistUser.avatar;
    }

    // Return null to let frontend handle default avatar
    console.log(`🖼️ ❌ No profile image found in any location`);
    return null;
  }

  async debugArtistProfileImage(artistUserId: string) {
    try {
      console.log(
        `🔍 DEBUG: Checking profile image for artist user ID: ${artistUserId}`,
      );

      // Get the user first
      const user = await this.userModel.findById(artistUserId);
      if (!user) {
        return { error: 'User not found', artistUserId };
      }

      // Get the artist profile using roleProfile field from User schema
      const artistProfile = user.roleProfile 
        ? await this.artistProfileModel.findById(user.roleProfile)
        : null;
      
      if (!artistProfile) {
        return { 
          error: 'Artist profile not found', 
          artistUserId,
          userHasRoleProfile: !!user.roleProfile,
          roleProfileId: user.roleProfile,
          userRole: user.role
        };
      }

      console.log(`🖼️ Artist Profile Image Data:`, {
        artistProfileId: artistProfile._id,
        stageName: artistProfile.stageName,
        profileImageField: artistProfile.profileImage,
        profileImageExists: !!artistProfile.profileImage,
        profileImageType: typeof artistProfile.profileImage,
        profileImageLength: artistProfile.profileImage?.length,
        allProfileFields: Object.keys(artistProfile.toObject()),
      });

      console.log(`👤 User Profile Data:`, {
        userId: user?._id,
        firstName: user?.firstName,
        lastName: user?.lastName,
        profilePicture: user?.profilePicture,
        profilePictureExists: !!user?.profilePicture,
        allUserFields: user ? Object.keys(user.toObject()) : null,
      });

      return {
        artistUserId,
        artistProfile: {
          _id: artistProfile._id,
          stageName: artistProfile.stageName,
          profileImage: artistProfile.profileImage,
          hasProfileImage: !!artistProfile.profileImage,
        },
        user: user
          ? {
              _id: user._id,
              firstName: user.firstName,
              lastName: user.lastName,
              profilePicture: user.profilePicture,
              hasProfilePicture: !!user.profilePicture,
            }
          : null,
        recommendation:
          !artistProfile.profileImage && user?.profilePicture
            ? 'User has profilePicture that could be copied to artist profile'
            : !artistProfile.profileImage
              ? 'Artist needs to upload a profile image'
              : 'Profile image is set correctly',
      };
    } catch (error) {
      console.error('❌ debugArtistProfileImage error:', error);
      return { error: error.message, artistUserId };
    }
  }

  async checkUserRoleAndProfile(userId: string) {
    try {
      console.log(`🔍 Checking user role and profile for: ${userId}`);

      // Get the user
      const user = await this.userModel.findById(userId);
      if (!user) {
        return { error: 'User not found', userId };
      }

      // Check if artist profile exists using roleProfile field
      const artistProfile = user.roleProfile 
        ? await this.artistProfileModel.findById(user.roleProfile)
        : null;

      console.log(`👤 User Info:`, {
        userId: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isActive: user.isActive,
        hasProfilePicture: !!user.profilePicture,
        profilePicture: user.profilePicture,
      });

      console.log(`🎭 Artist Profile Info:`, {
        hasArtistProfile: !!artistProfile,
        profileId: artistProfile?._id,
        stageName: artistProfile?.stageName,
        profileImage: artistProfile?.profileImage,
        profileCoverImage: artistProfile?.profileCoverImage,
      });

      return {
        userId,
        user: {
          role: user.role,
          firstName: user.firstName,
          lastName: user.lastName,
          isActive: user.isActive,
          profilePicture: user.profilePicture,
        },
        artistProfile: artistProfile ? {
          _id: artistProfile._id,
          stageName: artistProfile.stageName,
          profileImage: artistProfile.profileImage,
          profileCoverImage: artistProfile.profileCoverImage,
        } : null,
        diagnosis: {
          userExists: true,
          isArtistRole: user.role === 'ARTIST',
          hasArtistProfile: !!artistProfile,
          recommendedAction: !artistProfile && user.role === 'ARTIST' 
            ? 'Create missing artist profile'
            : artistProfile 
            ? 'Profile exists - check image population'
            : 'User is not an artist'
        }
      };
    } catch (error) {
      console.error('❌ checkUserRoleAndProfile error:', error);
      return { error: error.message, userId };
    }
  }

  async createMissingArtistProfile(userId: string) {
    try {
      console.log(`🔧 Attempting to create missing artist profile for user: ${userId}`);

      // Get the user first
      const user = await this.userModel.findById(userId);
      if (!user) {
        return { error: 'User not found', userId };
      }

      // Check if profile already exists using roleProfile field
      const existingProfile = user.roleProfile 
        ? await this.artistProfileModel.findById(user.roleProfile)
        : null;
        
      if (existingProfile) {
        return { 
          message: 'Artist profile already exists', 
          userId,
          profileId: existingProfile._id,
          stageName: existingProfile.stageName 
        };
      }

      // Check if user should have an artist profile
      if (user.role !== 'ARTIST') {
        return { 
          error: 'User is not an artist', 
          userId, 
          userRole: user.role 
        };
      }

      // Create basic artist profile
      const newProfile = new this.artistProfileModel({
        user: userId,
        stageName: `${user.firstName} ${user.lastName}`.trim() || 'Artist',
        gender: 'Not Specified',
        artistType: 'DANCER', // Default type
        about: `Professional artist based in Kuwait`,
        yearsOfExperience: 1,
        skills: [],
        musicLanguages: [],
        awards: [],
        pricePerHour: 100, // Default price
        profileImage: user.profilePicture || '', // Use user's profile picture if available
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

      // Update user's roleProfile field to link to the new profile
      await this.userModel.findByIdAndUpdate(userId, {
        roleProfile: savedProfile._id,
        roleProfileRef: 'ArtistProfile'
      });

      console.log(`✅ Created artist profile for ${user.firstName} ${user.lastName} and linked it to user`);

      return {
        message: 'Successfully created artist profile and linked to user',
        userId,
        profileId: savedProfile._id,
        stageName: savedProfile.stageName,
        profileImage: savedProfile.profileImage,
        created: true,
        linkedToUser: true
      };

    } catch (error) {
      console.error('❌ createMissingArtistProfile error:', error);
      return { error: error.message, userId };
    }
  }

  async syncUserProfilePictureToArtist(artistUserId: string) {
    try {
      console.log(
        `🔄 SYNC: Copying user profile picture to artist profile for ID: ${artistUserId}`,
      );

      // Get the user first  
      const user = await this.userModel.findById(artistUserId);
      if (!user) {
        return { error: 'User not found', artistUserId };
      }

      // Get the artist profile by user ID
      const artistProfile = await this.artistProfileModel.findOne({ user: artistUserId });
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

      console.log(
        `✅ SYNC: Successfully copied profile picture from user to artist`,
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

  async debugCooldownAnalysis(artistId: string, month?: number, year?: number) {
    try {
      // Get artist details
      const artistProfile = await this.artistProfileModel.findById(artistId);
      if (!artistProfile) {
        return { error: 'Artist profile not found', artistId };
      }

      // Get date range
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

      // Get existing bookings
      const existingBookings = await this.artistBookingModel.find({
        artistId: artistProfile.user,
        status: { $in: ['pending', 'confirmed'] },
        date: {
          $gte: startDate.toISOString().split('T')[0],
          $lte: endDate.toISOString().split('T')[0],
        },
      });

      // Analyze each booking's cooldown impact
      const cooldownAnalysis: any[] = [];

      existingBookings.forEach((booking) => {
        const startHour = parseInt(booking.startTime.split(':')[0]);
        const endHour = parseInt(booking.endTime.split(':')[0]);

        // Booked hours
        const bookedHours: number[] = [];
        for (let hour = startHour; hour < endHour; hour++) {
          bookedHours.push(hour);
        }

        // Cooldown hours (same day only)
        const cooldownHours: number[] = [];
        if (artistProfile.cooldownPeriodHours > 0) {
          const cooldownEndHour = endHour + artistProfile.cooldownPeriodHours;
          for (
            let hour = endHour;
            hour < cooldownEndHour && hour < 24;
            hour++
          ) {
            cooldownHours.push(hour);
          }
        }

        cooldownAnalysis.push({
          date: booking.date,
          bookingTime: `${booking.startTime} - ${booking.endTime}`,
          bookedHours,
          cooldownPeriodHours: artistProfile.cooldownPeriodHours,
          cooldownHours,
          cooldownTimeRange:
            cooldownHours.length > 0
              ? `${cooldownHours[0]}:00 - ${cooldownHours[cooldownHours.length - 1] + 1}:00`
              : 'No cooldown (end of day)',
          totalUnavailableHours: [...bookedHours, ...cooldownHours],
        });
      });

      return {
        artistId,
        artistName: artistProfile.stageName,
        cooldownPeriodHours: artistProfile.cooldownPeriodHours,
        analysisType: 'Day-wise cooldown calculation',
        dateRange: {
          start: startDate.toISOString().split('T')[0],
          end: endDate.toISOString().split('T')[0],
        },
        totalBookings: existingBookings.length,
        cooldownAnalysis,
        explanation: {
          howItWorks:
            'Each booking creates a cooldown period on the SAME DAY only',
          cooldownRule: `${artistProfile.cooldownPeriodHours} hours after each booking end time`,
          dayWiseLogic:
            'Cooldown periods do not cross midnight - each day is independent',
          example: 'Booking 14:00-18:00 → Cooldown 18:00-20:00 (same day only)',
        },
      };
    } catch (error) {
      console.error('❌ debugCooldownAnalysis error:', error);
      return { error: error.message, artistId };
    }
  }

  async getUserBookings(userId: string) {
    try {
      const userObjectId = new Types.ObjectId(userId);

      // First get artist bookings with user info
      const artistBookings = await this.artistBookingModel
        .find({
          bookedBy: userObjectId,
          combineBookingRef: { $exists: false },
        })
        .populate({
          path: 'artistId',
          select: 'firstName lastName profilePicture avatar email',
        })
        .populate('bookedBy', 'firstName lastName phoneNumber email')
        .sort({ createdAt: -1 })
        .lean();

      // Get artist profiles using the roleProfile field from User schema
      const artistUserIds = artistBookings
        .map(booking => (booking.artistId as any)?._id)
        .filter(id => id);
      
      // Get the roleProfile IDs from users
      const users = await this.userModel
        .find({ _id: { $in: artistUserIds }, role: 'ARTIST' })
        .select('_id roleProfile')
        .lean();
      
      const roleProfileIds = users
        .map(user => user.roleProfile)
        .filter(id => id);
      
      console.log('👥 Users found:', users.length);
      console.log('🎭 RoleProfile IDs to fetch:', roleProfileIds);
      
      users.forEach(user => {
        console.log(`👤 User ${user._id} -> RoleProfile ${user.roleProfile}`);
      });
      
      const artistProfiles = await this.artistProfileModel
        .find({ _id: { $in: roleProfileIds } })
        .select('_id user stageName profileImage profileCoverImage pricePerHour about category location country skills yearsOfExperience artistType availability gender')
        .lean();

      const artistProfileMap = new Map();
      artistProfiles.forEach(profile => {
        artistProfileMap.set(profile.user.toString(), profile);
      });

      const equipmentBookings = await this.equipmentBookingModel
        .find({
          bookedBy: userObjectId,
          combineBookingRef: { $exists: false },
        })
        .populate({
          path: 'equipments.equipmentId',
          select: 'name images category description pricePerDay specifications',
        })
        .populate({
          path: 'packages',
          select: 'name description coverImage images totalPrice items createdBy',
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

      // Get all combined bookings for the user
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
              select: 'name images category description pricePerDay specifications',
            },
            {
              path: 'packages',
              select: 'name description coverImage images totalPrice items createdBy',
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
              select: 'name description items totalPricePerDay createdBy status',
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

      // Get artist profiles for combined bookings as well
      const combinedArtistUserIds = combinedBookings
        .map(booking => (booking as any)?.artistBookingId?.artistId?._id)
        .filter(id => id);
      
      console.log('🔍 Combined artist user IDs found:', combinedArtistUserIds);
      
      if (combinedArtistUserIds.length > 0) {
        // Get roleProfile IDs for combined bookings using the correct User schema approach
        const combinedUsers = await this.userModel
          .find({ _id: { $in: combinedArtistUserIds }, role: 'ARTIST' })
          .select('_id roleProfile')
          .lean();
        
        const combinedRoleProfileIds = combinedUsers
          .map(user => user.roleProfile)
          .filter(id => id);
        
        console.log('👥 Combined users found:', combinedUsers.length);
        console.log('🎭 Combined roleProfile IDs to fetch:', combinedRoleProfileIds);
        
        const combinedArtistProfiles = await this.artistProfileModel
          .find({ _id: { $in: combinedRoleProfileIds } })
          .select('_id user stageName profileImage profileCoverImage pricePerHour about category location country skills yearsOfExperience artistType availability gender')
          .lean();
        
        console.log('🎨 Found combined artist profiles:', combinedArtistProfiles.length);
        combinedArtistProfiles.forEach(profile => {
          console.log(`✅ Profile found for user ${profile.user}:`, {
            stageName: profile.stageName,
            hasImage: !!profile.profileImage
          });
        });
        
        // Add to the same map
        combinedArtistProfiles.forEach(profile => {
          artistProfileMap.set(profile.user.toString(), profile);
        });
        
        // Check for missing profiles
        combinedArtistUserIds.forEach(userId => {
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
        
        // Debug logging for artist profile image
        console.log('🎭 Artist Booking Debug:', {
          bookingId: booking._id,
          artistUserId: artistData?._id,
          hasArtistProfile: !!artistProfile,
          profileImageFromSchema: artistProfile?.profileImage,
          profileCoverImageFromSchema: artistProfile?.profileCoverImage,
          userProfilePicture: artistData?.profilePicture,
          stageName: artistProfile?.stageName,
        });
        
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
                fullName: `${artistData.firstName || ''} ${artistData.lastName || ''}`.trim(),
                stageName: artistProfile?.stageName || `${artistData.firstName || ''} ${artistData.lastName || ''}`.trim() || 'Artist',
                artistType: artistProfile?.artistType || booking.artistType,
                profilePicture: artistProfile?.profileImage || artistProfile?.profileCoverImage || artistData?.profilePicture || null,
                // Also map profileImage for compatibility
                profileImage: artistProfile?.profileImage || artistProfile?.profileCoverImage || artistData?.profilePicture || null,
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
        
        // Enhanced equipment packages with full details
        const enhancedPackages = (booking.packages as any[])?.map(pkg => ({
          _id: pkg._id,
          name: pkg.name,
          description: pkg.description,
          coverImage: pkg.coverImage,
          images: pkg.images || [],
          totalPrice: pkg.totalPrice,
          provider: pkg.createdBy ? {
            name: `${pkg.createdBy.firstName || ''} ${pkg.createdBy.lastName || ''}`.trim(),
            companyName: pkg.createdBy.roleProfile?.companyName || '',
            businessDescription: pkg.createdBy.roleProfile?.businessDescription || '',
            email: pkg.createdBy.email,
          } : null,
          items: pkg.items?.map(item => ({
            equipmentId: item.equipmentId,
            quantity: item.quantity,
            equipment: item.equipmentId ? {
              name: item.equipmentId.name,
              images: item.equipmentId.images || [],
              category: item.equipmentId.category,
              pricePerDay: item.equipmentId.pricePerDay,
            } : null,
          })) || [],
        })) || [];

        // Enhanced custom packages
        const enhancedCustomPackages = (booking.customPackages as any[])?.map(pkg => {
          console.log('🎁 Custom Package Debug:', {
            packageId: pkg._id,
            name: pkg.name,
            totalPricePerDay: pkg.totalPricePerDay,
            totalPrice: pkg.totalPrice,
            itemsCount: pkg.items?.length || 0,
            allFields: Object.keys(pkg),
          });
          
          return {
            _id: pkg._id,
            name: pkg.name,
            description: pkg.description,
            totalPrice: pkg.totalPricePerDay || pkg.totalPrice || 0, // Use correct field from schema
            isCustom: true,
            items: pkg.items?.map(item => ({
              equipmentId: item.equipmentId,
              quantity: item.quantity,
              pricePerDay: item.pricePerDay || 0, // From custom package item
              equipment: item.equipmentId ? {
                name: item.equipmentId.name,
                images: item.equipmentId.images || [],
                category: item.equipmentId.category,
                pricePerDay: item.equipmentId.pricePerDay,
              } : null,
            })) || [],
          };
        }) || [];

        // Enhanced individual equipments with calculated totals
        const enhancedEquipments = (booking.equipments as any[])?.map(equip => {
          const equipmentTotal = equip.equipmentId && equip.quantity 
            ? equip.quantity * (equip.equipmentId.pricePerDay || 0)
            : 0;
            
          console.log(`🔧 Individual Equipment: ${equip.equipmentId?.name || 'Unknown'}, Qty: ${equip.quantity}, Price: ${equip.equipmentId?.pricePerDay || 0}, Total: ${equipmentTotal}`);
            
          return {
            equipmentId: equip.equipmentId,
            quantity: equip.quantity,
            totalPrice: equipmentTotal, // Calculated total for this item
            equipment: equip.equipmentId ? {
              name: equip.equipmentId.name,
              images: equip.equipmentId.images || [],
              category: equip.equipmentId.category,
              description: equip.equipmentId.description,
              pricePerDay: equip.equipmentId.pricePerDay,
              specifications: equip.equipmentId.specifications,
            } : null,
          };
        }) || [];

        // Calculate runtime totals for debugging
        const packageTotal = enhancedPackages.reduce((sum, pkg) => sum + (pkg.totalPrice || 0), 0);
        const customPackageTotal = enhancedCustomPackages.reduce((sum, pkg) => sum + (pkg.totalPrice || 0), 0);
        const individualEquipmentTotal = enhancedEquipments.reduce((sum, equip) => sum + (equip.totalPrice || 0), 0);
        const runtimeCalculatedTotal = packageTotal + customPackageTotal + individualEquipmentTotal;
        
        console.log('💰 Equipment Booking Price Breakdown:', {
          bookingId: booking._id,
          storedTotal: booking.totalPrice,
          runtimeCalculated: runtimeCalculatedTotal,
          packageTotal,
          customPackageTotal, 
          individualEquipmentTotal,
          packagesCount: enhancedPackages.length,
          customPackagesCount: enhancedCustomPackages.length,
          individualEquipmentCount: enhancedEquipments.length,
        });

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
          // Include calculated total for comparison
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

      // Add combined bookings
      combinedBookings.forEach((booking) => {
        const bookedByUser = booking.bookedBy as any;
        const artistBooking = booking.artistBookingId as any;
        const equipmentBooking = booking.equipmentBookingId as any;

        // Determine if this booking should show equipment details
        // Hide equipment if it's artist_only OR if equipment price is 0
        const isArtistOnly =
          booking.bookingType === 'artist_only' ||
          booking.bookingType === 'artist';
        const hasZeroEquipmentPrice =
          !equipmentBooking?.totalPrice || equipmentBooking.totalPrice === 0;
        const shouldHideEquipment = isArtistOnly || hasZeroEquipmentPrice;

        // Enhanced equipment packages for combined bookings
        const enhancedCombinedPackages = shouldHideEquipment ? [] : 
          (equipmentBooking?.packages as any[])?.map(pkg => ({
            _id: pkg._id,
            name: pkg.name,
            description: pkg.description,
            coverImage: pkg.coverImage,
            images: pkg.images || [],
            totalPrice: pkg.totalPrice,
            provider: pkg.createdBy ? {
              name: `${pkg.createdBy.firstName || ''} ${pkg.createdBy.lastName || ''}`.trim(),
              companyName: pkg.createdBy.roleProfile?.companyName || '',
              businessDescription: pkg.createdBy.roleProfile?.businessDescription || '',
              email: pkg.createdBy.email,
            } : null,
            items: pkg.items?.map(item => ({
              equipmentId: item.equipmentId,
              quantity: item.quantity,
              equipment: item.equipmentId ? {
                name: item.equipmentId.name,
                images: item.equipmentId.images || [],
                category: item.equipmentId.category,
                pricePerDay: item.equipmentId.pricePerDay,
              } : null,
            })) || [],
          })) || [];

        // Enhanced custom packages for combined bookings  
        const enhancedCombinedCustomPackages = shouldHideEquipment ? [] :
          (equipmentBooking?.customPackages as any[])?.map(pkg => {
            console.log('🎁 Combined Custom Package Debug:', {
              packageId: pkg._id,
              name: pkg.name,
              totalPricePerDay: pkg.totalPricePerDay,
              totalPrice: pkg.totalPrice,
              itemsCount: pkg.items?.length || 0,
            });
            
            return {
              _id: pkg._id,
              name: pkg.name,
              description: pkg.description,
              totalPrice: pkg.totalPricePerDay || pkg.totalPrice || 0, // Use correct field from schema
              isCustom: true,
              items: pkg.items?.map(item => ({
                equipmentId: item.equipmentId,
                quantity: item.quantity,
                pricePerDay: item.pricePerDay || 0, // From custom package item
                equipment: item.equipmentId ? {
                  name: item.equipmentId.name,
                  images: item.equipmentId.images || [],
                  category: item.equipmentId.category,
                  pricePerDay: item.equipmentId.pricePerDay,
                } : null,
              })) || [],
            };
          }) || [];

        // Enhanced individual equipments for combined bookings
        const enhancedCombinedEquipments = shouldHideEquipment ? [] :
          (equipmentBooking?.equipments as any[])?.map(equip => {
            const equipmentTotal = equip.equipmentId && equip.quantity 
              ? equip.quantity * (equip.equipmentId.pricePerDay || 0)
              : 0;
              
            console.log(`🔧 Combined Individual Equipment: ${equip.equipmentId?.name || 'Unknown'}, Qty: ${equip.quantity}, Price: ${equip.equipmentId?.pricePerDay || 0}, Total: ${equipmentTotal}`);
              
            return {
              equipmentId: equip.equipmentId,
              quantity: equip.quantity,
              totalPrice: equipmentTotal, // Calculated total for this item
              equipment: equip.equipmentId ? {
                name: equip.equipmentId.name,
                images: equip.equipmentId.images || [],
                category: equip.equipmentId.category,
                description: equip.equipmentId.description,
                pricePerDay: equip.equipmentId.pricePerDay,
                specifications: equip.equipmentId.specifications,
              } : null,
            };
          }) || [];

        bookings.push({
          _id: booking._id,
          artistId: artistBooking?.artistId?._id || '',
          bookedBy: booking.bookedBy,
          eventType: booking.bookingType === 'artist_only' ? 'private' : 'private',
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
          equipmentPrice: shouldHideEquipment ? 0 : equipmentBooking?.totalPrice || 0,
          bookingDate: (booking as any).createdAt,
          bookingType: booking.bookingType,
          artist: artistBooking?.artistId
            ? (() => {
                const combinedArtistData = artistBooking.artistId;
                const combinedArtistProfile = artistProfileMap.get(combinedArtistData._id?.toString());
                
                // Debug logging for this specific case
                console.log('🎭 Processing combined artist:', {
                  userId: combinedArtistData._id,
                  firstName: combinedArtistData.firstName,
                  lastName: combinedArtistData.lastName,
                  hasProfile: !!combinedArtistProfile,
                  profileImage: combinedArtistProfile?.profileImage,
                  userProfilePicture: combinedArtistData?.profilePicture,
                });
                
                return {
                  _id: combinedArtistData._id,
                  fullName: `${combinedArtistData.firstName || ''} ${combinedArtistData.lastName || ''}`.trim(),
                  stageName: combinedArtistProfile?.stageName || `${combinedArtistData.firstName || ''} ${combinedArtistData.lastName || ''}`.trim() || 'Artist',
                  artistType: combinedArtistProfile?.artistType || artistBooking.artistType || 'DANCER',
                  profilePicture: combinedArtistProfile?.profileImage || combinedArtistProfile?.profileCoverImage || combinedArtistData?.profilePicture || null,
                  // Also map profileImage for compatibility
                  profileImage: combinedArtistProfile?.profileImage || combinedArtistProfile?.profileCoverImage || combinedArtistData?.profilePicture || null,
                  bio: combinedArtistProfile?.about || `Professional ${combinedArtistProfile?.artistType || 'Artist'}`,
                  skills: combinedArtistProfile?.skills || [],
                  yearsOfExperience: combinedArtistProfile?.yearsOfExperience || 0,
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
          userDetails: booking.userDetails ||
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

      console.log(`📊 Total bookings returned: ${bookings.length}`);
      console.log(`🎭 Artist bookings: ${artistBookings.length}`);
      console.log(`🎬 Equipment bookings: ${equipmentBookings.length}`);
      console.log(`🎪 Combined bookings: ${combinedBookings.length}`);
      console.log(`🎨 Artist profiles loaded: ${artistProfiles.length}`);
      
      // Debug: Show the correct artist profile lookup results
      console.log(`✅ FIXED: Artist profiles fetched using correct User.roleProfile approach`);
      console.log(`🎨 Total artist profiles loaded: ${artistProfiles.length}`);

      // Sample booking for debugging
      if (bookings.length > 0) {
        const sample = bookings[0];
        console.log(
          '🔍 Sample processed booking (NEW STRUCTURE):',
          JSON.stringify(
            {
              id: sample._id,
              bookingType: sample.bookingType,
              hasArtist: !!sample.artist,
              artistId: sample.artistId,
              artistFullName: sample.artist?.fullName,
              artistStageName: sample.artist?.stageName,
              artistProfilePicture: sample.artist?.profilePicture,
              artistProfileImage: sample.artist?.profileImage,
              artistSkills: sample.artist?.skills,
              artistYearsExp: sample.artist?.yearsOfExperience,
            },
            null,
            2,
          ),
        );

        // Log the raw artist profile data for comparison
        if (artistProfiles.length > 0) {
          console.log(
            '� Sample artist profile from database:',
            JSON.stringify(
              {
                profileId: artistProfiles[0]._id,
                userId: artistProfiles[0].user,
                stageName: artistProfiles[0].stageName,
                profileImage: artistProfiles[0].profileImage,
                profileCoverImage: artistProfiles[0].profileCoverImage,
              },
              null,
              2,
            ),
          );
        }
      }

      if (combinedBookings.length > 0) {
        const sampleCombined = combinedBookings[0] as any;
        console.log(
          '🔍 Raw combined booking data:',
          JSON.stringify(
            {
              hasArtistBooking: !!sampleCombined.artistBookingId,
              artistBookingStructure: sampleCombined.artistBookingId
                ? {
                    hasArtistId: !!sampleCombined.artistBookingId.artistId,
                    artistIdStructure: sampleCombined.artistBookingId.artistId
                      ? {
                          firstName:
                            sampleCombined.artistBookingId.artistId.firstName,
                          lastName:
                            sampleCombined.artistBookingId.artistId.lastName,
                          profilePicture:
                            sampleCombined.artistBookingId.artistId
                              .profilePicture,
                          hasRoleProfile:
                            !!sampleCombined.artistBookingId.artistId
                              .roleProfile,
                          roleProfileStructure: sampleCombined.artistBookingId
                            .artistId.roleProfile
                            ? {
                                _id: sampleCombined.artistBookingId.artistId
                                  .roleProfile._id,
                                stageName:
                                  sampleCombined.artistBookingId.artistId
                                    .roleProfile.stageName,
                                profileImage:
                                  sampleCombined.artistBookingId.artistId
                                    .roleProfile.profileImage,
                                hasProfileImage:
                                  !!sampleCombined.artistBookingId.artistId
                                    .roleProfile.profileImage,
                                allFields: Object.keys(
                                  sampleCombined.artistBookingId.artistId
                                    .roleProfile,
                                ),
                              }
                            : null,
                        }
                      : null,
                  }
                : null,
            },
            null,
            2,
          ),
        );
      }

      bookings.sort(
        (a, b) =>
          new Date(b.bookingDate).getTime() - new Date(a.bookingDate).getTime(),
      );

      return bookings;
    } catch (error) {
      throw new BadRequestException('Failed to fetch user bookings');
    }
  }
}
