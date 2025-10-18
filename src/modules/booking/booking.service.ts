import {
  BadRequestException,
  ConflictException,
  Injectable,
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
      const preferenceStrings = artistExists.performPreference.map(p => p.toString().toLowerCase());
      const hasPrivatePreference = preferenceStrings.includes('private');
      
      if (!hasPrivatePreference) {
        throw new BadRequestException('Artist not available for private bookings');
      }
      
      
      // Use the artist-availability service to get unavailability data directly
      const unavailabilityData = await this.artistAvailabilityService.getArtistUnavailabilityByProfileId(artistId, month, year);
      
      
      // Get confirmed bookings to add to unavailable slots
      const currentDate = new Date();
      let startDate: Date;
      let endDate: Date;

      if (month && year) {
        startDate = new Date(Date.UTC(year, month - 1, 1));
        endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
      } else {
        startDate = new Date(Date.UTC(currentDate.getFullYear(), currentDate.getMonth(), 1));
        endDate = new Date(Date.UTC(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59, 999));
      }
     
      const existingBookings = await this.artistBookingModel.find({
        artistId: artistExists.user, 
        status: { $in: ['pending', 'confirmed'] }, 
        date: {
          $gte: startDate.toISOString().split('T')[0],
          $lte: endDate.toISOString().split('T')[0],
        },
      });

      console.log(`🔍 Found ${existingBookings.length} existing bookings for artist`);

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
          for (let hour = endHour; hour < cooldownEndHour && hour < 24; hour++) {
            cooldownHours.push(hour);
          }
        }
        
        // Combine booked hours and cooldown hours
        const allUnavailableHours = [...bookedHours, ...cooldownHours];
        
        if (unavailableByDate[dateKey]) {
          const combined = [...unavailableByDate[dateKey], ...allUnavailableHours];
          unavailableByDate[dateKey] = [...new Set(combined)].sort((a, b) => a - b);
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
            rate: 0 
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
          rate: 0
        });
      } else {
        throw new BadRequestException('Either eventDates or eventDate with times must be provided');
      }

      console.log(`📊 Total hours calculated: ${totalHours}`);

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

      const artistPricingAmount = await this.timeSlotService.calculateBookingCost(
        dto.artistId,
        performanceType,
        8, 
        totalHours 
      );


      const ratePerHour = artistPricingAmount / totalHours;
      breakdown.forEach(day => {
        day.rate = day.hours * ratePerHour;
      });

      const equipmentFee = {
        amount: 0,
        packages: []
      };

      const result = {
        artistFee: {
          amount: artistPricingAmount,
          totalHours,
          pricingTier: `${totalHours}-hour`,
          breakdown
        },
        equipmentFee,
        totalAmount: artistPricingAmount + equipmentFee.amount,
        currency: 'KWD',
        calculatedAt: new Date().toISOString()
      };

      return result;

    } catch (error) {
      console.error('❌ calculateBookingPricing error:', error);
      throw new BadRequestException(`Pricing calculation failed: ${error.message}`);
    }
  }

  async debugArtistUnavailableData(artistId: string) {
    try {
      
      const artistProfile = await this.artistProfileModel.findById(artistId);
     
      if (!artistProfile) {
        return { error: 'Artist profile not found', artistId };
      }
      
      const unavailableData = await this.artistUnavailableModel.find({
        artistProfile: artistProfile._id
      }).sort({ date: 1 });
      

      
      const existingBookings = await this.artistBookingModel.find({
        artistId: artistProfile.user
      }).sort({ date: 1 });
      
      
      return {
        artistId,
        artistProfile: {
          _id: artistProfile._id,
          stageName: artistProfile.stageName,
          user: artistProfile.user,
          isVisible: artistProfile.isVisible
        },
        unavailableRecords: unavailableData.map(record => ({
          date: record.date.toISOString().split('T')[0],
          hours: record.hours
        })),
        existingBookings: existingBookings.map(booking => ({
          date: booking.date,
          startTime: booking.startTime,
          endTime: booking.endTime,
          status: booking.status
        }))
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
          isValidProfile: false 
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
          isVisible: artistProfile.isVisible
        },
        user: user ? {
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          roleProfile: user.roleProfile,
          roleProfileRef: user.roleProfileRef
        } : null,
        idMatches: user?.roleProfile?.toString() === artistId
      };
    } catch (error) {
      console.error('❌ Verify error:', error);
      return { error: error.message, artistId, isValidProfile: false };
    }
  }

  async createTestUnavailableSlots(artistProfileId: string, date: string, hours: number[]) {
    try {
      // Find the artist profile first
      const artistProfile = await this.artistProfileModel.findById(artistProfileId);
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
    return requestedHours
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

      //   reserve the spot for artist calendar
      // Parse date consistently using UTC to match the availability storage format
      const dateParts = dto.date.split('-');
      const bookingDate = new Date(Date.UTC(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2])));
      
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

  //** book only equipment code

  async createEquipmentBooking(dto: CreateEquipmentBookingDto) {
    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      const equipmentBooking = await this.equipmentBookingModel.create(
        [
          {
            bookedBy: new Types.ObjectId(dto.bookedBy),
            equipments: dto.equipments?.map((e) => ({
              equipmentId: new Types.ObjectId(e.equipmentId),
              quantity: e.quantity,
            })),
            packages: dto.packages?.map((p) => new Types.ObjectId(p)),
            date: dto.date,
            startTime: dto.startTime,
            endTime: dto.endTime,
            totalPrice: dto.totalPrice,
            status: 'confirmed',
            address: dto.address,
          },
        ],
        { session },
      );
      await session.commitTransaction();
      return {
        message: 'Equipment booked sucessfully',
        equipmentBooking,
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
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

      const preferenceStrings = artistProfile.performPreference.map(p => p.toString().toLowerCase());
      const hasPrivatePreference = preferenceStrings.includes('private');
      
      if (!hasPrivatePreference) {
        throw new BadRequestException('Artist not available for private bookings');
      }

      // Get the user details
      const artist = await this.userModel.findById(artistProfile.user);
      if (!artist) {
        throw new BadRequestException('Artist user not found');
      }

      // Determine if this is multi-day or single-day booking
      const isMultiDay = dto.isMultiDay && dto.eventDates && dto.eventDates.length > 0;
      
      // Validate input data
      if (isMultiDay) {
        if (!dto.eventDates || dto.eventDates.length === 0) {
          throw new BadRequestException('eventDates is required for multi-day bookings');
        }
      } else {
        if (!dto.eventDate || !dto.startTime || !dto.endTime) {
          throw new BadRequestException('eventDate, startTime, and endTime are required for single-day bookings');
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
            hours: requestedHours
          });
          
          await this.validateSingleDayAvailability(
            artistProfile._id as Types.ObjectId,
            artistProfile.user,
            eventDate.date,
            requestedHours
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
          hours: requestedHours
        });
        
        await this.validateSingleDayAvailability(
          artistProfile._id as Types.ObjectId,
          artistProfile.user,
          dto.eventDate!,
          requestedHours
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
      
      const hasEquipmentPackages = dto.selectedEquipmentPackages && dto.selectedEquipmentPackages.length > 0;
      const hasCustomPackages = dto.selectedCustomPackages && dto.selectedCustomPackages.length > 0;
      const hasEquipmentPrice = dto.equipmentPrice && dto.equipmentPrice > 0;
      
      // Only create equipment booking if there are packages AND a price > 0
      if ((hasEquipmentPackages || hasCustomPackages) && hasEquipmentPrice) {
        const equipmentDate = isMultiDay ? dto.eventDates![0].date : dto.eventDate!;
        const equipmentStartTime = isMultiDay ? dto.eventDates![0].startTime : dto.startTime!;
        const equipmentEndTime = isMultiDay ? dto.eventDates![dto.eventDates!.length - 1].endTime : dto.endTime!;
        
        equipmentBooking = await this.equipmentBookingModel.create(
          [
            {
              bookedBy: new Types.ObjectId(dto.bookedBy),
              equipments: [],
              packages: hasEquipmentPackages ? dto.selectedEquipmentPackages?.map((p) => new Types.ObjectId(p)) || [] : [],
              customPackages: hasCustomPackages ? dto.selectedCustomPackages?.map((p) => new Types.ObjectId(p)) || [] : [],
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

      const combinedDate = isMultiDay ? dto.eventDates![0].date : dto.eventDate!;
      const combinedStartTime = isMultiDay ? dto.eventDates![0].startTime : dto.startTime!;
      const combinedEndTime = isMultiDay ? dto.eventDates![dto.eventDates!.length - 1].endTime : dto.endTime!;
      
      const combineBooking = await this.combineBookingModel.create(
        [
          {
            bookingType: ((hasEquipmentPackages || hasCustomPackages) && hasEquipmentPrice) ? 'combined' : 'artist_only',
            bookedBy: new Types.ObjectId(dto.bookedBy),
            artistBookingId: artistBookings[0]._id, 
            equipmentBookingId: equipmentBooking ? equipmentBooking[0]._id : null,
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
          const cooldownEndHour = maxBookedHour + 1 + artistProfile.cooldownPeriodHours; // +1 because maxBookedHour is start of last hour
          for (let hour = maxBookedHour + 1; hour < cooldownEndHour && hour < 24; hour++) {
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
          ...(isMultiDay ? {
            eventDates: dto.eventDates!,
            totalHours: dto.totalHours
          } : {
            eventDate: dto.eventDate!,
            startTime: dto.startTime!,
            endTime: dto.endTime!
          })
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
    requestedHours: number[]
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
        throw new ConflictException(`Artist not available for selected time on ${eventDate}.`);
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

  private getArtistProfileImage(artistUser: any): string | null {
    // Priority: 
    // 1. Artist roleProfile.profileImage
    // 2. User profilePicture 
    // 3. User avatar (if exists)
    // 4. Default avatar URL
    
    if (artistUser?.roleProfile?.profileImage) {
      console.log(`🖼️ Using artist roleProfile.profileImage: ${artistUser.roleProfile.profileImage}`);
      return artistUser.roleProfile.profileImage;
    }
    
    if (artistUser?.profilePicture) {
      console.log(`🖼️ Using user profilePicture: ${artistUser.profilePicture}`);
      return artistUser.profilePicture;
    }

    if (artistUser?.avatar) {
      console.log(`🖼️ Using user avatar: ${artistUser.avatar}`);
      return artistUser.avatar;
    }
    
    // Professional fallback avatar
    const fallbackAvatar = 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face';
    console.log(`🖼️ Using fallback avatar: ${fallbackAvatar}`);
    return fallbackAvatar;
  }

  async debugArtistProfileImage(artistId: string) {
    try {
      console.log(`🔍 DEBUG: Checking profile image for artist ID: ${artistId}`);
      
      // Get the artist profile directly
      const artistProfile = await this.artistProfileModel.findById(artistId);
      if (!artistProfile) {
        return { error: 'Artist profile not found', artistId };
      }

      // Get the user details
      const user = await this.userModel.findById(artistProfile.user);
      
      console.log(`🖼️ Artist Profile Image Data:`, {
        artistProfileId: artistProfile._id,
        stageName: artistProfile.stageName,
        profileImageField: artistProfile.profileImage,
        profileImageExists: !!artistProfile.profileImage,
        profileImageType: typeof artistProfile.profileImage,
        profileImageLength: artistProfile.profileImage?.length,
        allProfileFields: Object.keys(artistProfile.toObject())
      });

      console.log(`👤 User Profile Data:`, {
        userId: user?._id,
        firstName: user?.firstName,
        lastName: user?.lastName,
        profilePicture: user?.profilePicture,
        profilePictureExists: !!user?.profilePicture,
        allUserFields: user ? Object.keys(user.toObject()) : null
      });

      return {
        artistId,
        artistProfile: {
          _id: artistProfile._id,
          stageName: artistProfile.stageName,
          profileImage: artistProfile.profileImage,
          hasProfileImage: !!artistProfile.profileImage
        },
        user: user ? {
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          profilePicture: user.profilePicture,
          hasProfilePicture: !!user.profilePicture
        } : null,
        recommendation: !artistProfile.profileImage && user?.profilePicture 
          ? 'User has profilePicture that could be copied to artist profile' 
          : !artistProfile.profileImage 
            ? 'Artist needs to upload a profile image'
            : 'Profile image is set correctly'
      };
    } catch (error) {
      console.error('❌ debugArtistProfileImage error:', error);
      return { error: error.message, artistId };
    }
  }

  async syncUserProfilePictureToArtist(artistId: string) {
    try {
      console.log(`🔄 SYNC: Copying user profile picture to artist profile for ID: ${artistId}`);
      
      const artistProfile = await this.artistProfileModel.findById(artistId);
      if (!artistProfile) {
        return { error: 'Artist profile not found', artistId };
      }

      const user = await this.userModel.findById(artistProfile.user);
      if (!user) {
        return { error: 'User not found', artistId };
      }

      if (!user.profilePicture) {
        return { 
          error: 'User does not have a profile picture to copy', 
          artistId,
          userHasProfilePicture: false 
        };
      }

      if (artistProfile.profileImage) {
        return { 
          message: 'Artist already has a profile image', 
          artistId,
          artistAlreadyHasImage: true,
          currentProfileImage: artistProfile.profileImage
        };
      }

      // Copy user profile picture to artist profile
      await this.artistProfileModel.updateOne(
        { _id: artistProfile._id },
        { profileImage: user.profilePicture }
      );

      console.log(`✅ SYNC: Successfully copied profile picture from user to artist`);

      return {
        message: 'Successfully synced user profile picture to artist profile',
        artistId,
        copiedImageUrl: user.profilePicture,
        success: true
      };
    } catch (error) {
      console.error('❌ syncUserProfilePictureToArtist error:', error);
      return { error: error.message, artistId };
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
        startDate = new Date(Date.UTC(currentDate.getFullYear(), currentDate.getMonth(), 1));
        endDate = new Date(Date.UTC(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59, 999));
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
          for (let hour = endHour; hour < cooldownEndHour && hour < 24; hour++) {
            cooldownHours.push(hour);
          }
        }
        
        cooldownAnalysis.push({
          date: booking.date,
          bookingTime: `${booking.startTime} - ${booking.endTime}`,
          bookedHours,
          cooldownPeriodHours: artistProfile.cooldownPeriodHours,
          cooldownHours,
          cooldownTimeRange: cooldownHours.length > 0 
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
          howItWorks: 'Each booking creates a cooldown period on the SAME DAY only',
          cooldownRule: `${artistProfile.cooldownPeriodHours} hours after each booking end time`,
          dayWiseLogic: 'Cooldown periods do not cross midnight - each day is independent',
          example: 'Booking 14:00-18:00 → Cooldown 18:00-20:00 (same day only)'
        }
      };
    } catch (error) {
      console.error('❌ debugCooldownAnalysis error:', error);
      return { error: error.message, artistId };
    }
  }

  async getUserBookings(userId: string) {
    try {
      const userObjectId = new Types.ObjectId(userId);

      const artistBookings = await this.artistBookingModel
        .find({ 
          bookedBy: userObjectId,
          combineBookingRef: { $exists: false } 
        })
        .populate({
          path: 'artistId',
          select: 'firstName lastName profilePicture avatar roleProfile',
          populate: {
            path: 'roleProfile',
            select: 'pricePerHour stageName about category location profileImage profileCoverImage country'
          }
        })
        .populate('bookedBy', 'firstName lastName phoneNumber email')
        .sort({ createdAt: -1 })
        .lean();

      // Get all equipment bookings for the user (exclude those that are part of combined bookings)
      const equipmentBookings = await this.equipmentBookingModel
        .find({ 
          bookedBy: userObjectId,
          combineBookingRef: { $exists: false } 
        })
        .populate({
          path: 'equipments.equipmentId',
          select: 'name images',
        })
        .populate({
          path: 'packages',
          select: 'name images',
        })
        .populate('bookedBy', 'firstName lastName phoneNumber email')
        .sort({ createdAt: -1 })
        .lean();

      // Get all combined bookings for the user
      const combinedBookings = await this.combineBookingModel
        .find({ bookedBy: userObjectId })
        .populate({
          path: 'artistBookingId',
          select: 'price date startTime endTime status artistId', 
          populate: {
            path: 'artistId',
            select: 'firstName lastName profilePicture avatar roleProfile',
            populate: {
              path: 'roleProfile',
              select: 'pricePerHour stageName about category location profileImage profileCoverImage country'
            }
          }
        })
        .populate({
          path: 'equipmentBookingId',
          select: 'totalPrice equipments packages date startTime endTime status', 

          populate: [
            {
              path: 'equipments.equipmentId',
              select: 'name images',
            },
            {
              path: 'packages',
              select: 'name images',
            }
          ]
        })
        .populate('bookedBy', 'firstName lastName phoneNumber email')
        .sort({ createdAt: -1 })
        .lean();

      const bookings: any[] = [];

      // Add artist bookings
      artistBookings.forEach((booking) => {
        const bookedByUser = booking.bookedBy as any;
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
          bookingDate: (booking as any).createdAt,
          artist: booking.artistId ? {
            _id: (booking.artistId as any)?._id,
            fullName: `${(booking.artistId as any)?.firstName || ''} ${(booking.artistId as any)?.lastName || ''}`.trim(),
            artistType: (booking.artistId as any)?.roleProfile?.category || booking.artistType,
            profilePicture: this.getArtistProfileImage(booking.artistId as any),
            bio: (booking.artistId as any)?.roleProfile?.about || null,
            location: (booking.artistId as any)?.roleProfile?.location ? {
              city: (booking.artistId as any).roleProfile.location.city,
              state: (booking.artistId as any).roleProfile.location.state,
              country: (booking.artistId as any).roleProfile.location.country
            } : null,
            pricing: (booking.artistId as any)?.roleProfile?.pricePerHour ? {
              hourlyRate: (booking.artistId as any).roleProfile.pricePerHour,
              eventRate: (booking.artistId as any).roleProfile.pricePerHour
            } : undefined
          } : undefined,
          userDetails: bookedByUser ? {
            name: `${bookedByUser.firstName || ''} ${bookedByUser.lastName || ''}`.trim(),
            email: bookedByUser.email || '',
            phone: bookedByUser.phoneNumber || '',
          } : undefined,
          venueDetails: {
            address: booking.address || '',
            city: '',
            state: '',
            country: '',
          },
        });
      });

      equipmentBookings.forEach((booking) => {
        const bookedByUser = booking.bookedBy as any;
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
          equipmentPrice: booking.totalPrice,
          bookingDate: (booking as any).createdAt,
          userDetails: bookedByUser ? {
            name: `${bookedByUser.firstName || ''} ${bookedByUser.lastName || ''}`.trim(),
            email: bookedByUser.email || '',
            phone: bookedByUser.phoneNumber || '',
          } : undefined,
          venueDetails: {
            address: booking.address || '',
            city: '',
            state: '',
            country: '',
          },
          selectedEquipmentPackages: booking.packages,
          equipments: booking.equipments,
        });
      });

      // Add combined bookings
      combinedBookings.forEach((booking) => {
        const bookedByUser = booking.bookedBy as any;
        const artistBooking = booking.artistBookingId as any;
        const equipmentBooking = booking.equipmentBookingId as any;
        

        
        // Determine if this booking should show equipment details
        // Hide equipment if it's artist_only OR if equipment price is 0
        const isArtistOnly = booking.bookingType === 'artist_only' || booking.bookingType === 'artist';
        const hasZeroEquipmentPrice = !equipmentBooking?.totalPrice || equipmentBooking.totalPrice === 0;
        const shouldHideEquipment = isArtistOnly || hasZeroEquipmentPrice;
        
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
          equipmentPrice: shouldHideEquipment ? 0 : (equipmentBooking?.totalPrice || 0), 
          bookingDate: (booking as any).createdAt,
          artist: artistBooking?.artistId ? {
            _id: artistBooking.artistId._id,
            fullName: `${artistBooking.artistId.firstName || ''} ${artistBooking.artistId.lastName || ''}`.trim(),
            artistType: artistBooking.artistId.roleProfile?.category || 'Artist',
            profilePicture: this.getArtistProfileImage(artistBooking.artistId),
            bio: artistBooking.artistId.roleProfile?.about || null,
            location: artistBooking.artistId.roleProfile?.location ? {
              city: artistBooking.artistId.roleProfile.location.city,
              state: artistBooking.artistId.roleProfile.location.state,
              country: artistBooking.artistId.roleProfile.location.country
            } : null,
            pricing: artistBooking.artistId.roleProfile?.pricePerHour ? {
              hourlyRate: artistBooking.artistId.roleProfile.pricePerHour,
              eventRate: artistBooking.artistId.roleProfile.pricePerHour
            } : undefined
          } : undefined,
          userDetails: booking.userDetails || (bookedByUser ? {
            name: `${bookedByUser.firstName || ''} ${bookedByUser.lastName || ''}`.trim(),
            email: bookedByUser.email || '',
            phone: bookedByUser.phoneNumber || '',
          } : undefined),
          venueDetails: booking.venueDetails || {
            address: booking.address || '',
            city: '',
            state: '',
            country: '',
          },
          eventDescription: booking.eventDescription,
          specialRequests: booking.specialRequests,
          bookingType: booking.bookingType,
          // Only include equipment details if equipment price > 0
          selectedEquipmentPackages: shouldHideEquipment ? [] : (equipmentBooking?.packages || []),
          equipments: shouldHideEquipment ? [] : (equipmentBooking?.equipments || []),
        });
      });

      

        // Sample booking for debugging
        if (bookings.length > 0) {
          const sample = bookings[0];
          console.log('🔍 Sample processed booking:', JSON.stringify({
            id: sample._id,
            hasArtist: !!sample.artist,
            artistProfilePicture: sample.artist?.profilePicture,
            artistFullName: sample.artist?.fullName
          }, null, 2));
        }

        if (combinedBookings.length > 0) {
          const sampleCombined = combinedBookings[0] as any;
          console.log('🔍 Raw combined booking data:', JSON.stringify({
            hasArtistBooking: !!sampleCombined.artistBookingId,
            artistBookingStructure: sampleCombined.artistBookingId ? {
              hasArtistId: !!sampleCombined.artistBookingId.artistId,
              artistIdStructure: sampleCombined.artistBookingId.artistId ? {
                firstName: sampleCombined.artistBookingId.artistId.firstName,
                lastName: sampleCombined.artistBookingId.artistId.lastName,
                profilePicture: sampleCombined.artistBookingId.artistId.profilePicture,
                hasRoleProfile: !!sampleCombined.artistBookingId.artistId.roleProfile,
                roleProfileStructure: sampleCombined.artistBookingId.artistId.roleProfile ? {
                  _id: sampleCombined.artistBookingId.artistId.roleProfile._id,
                  stageName: sampleCombined.artistBookingId.artistId.roleProfile.stageName,
                  profileImage: sampleCombined.artistBookingId.artistId.roleProfile.profileImage,
                  hasProfileImage: !!sampleCombined.artistBookingId.artistId.roleProfile.profileImage,
                  allFields: Object.keys(sampleCombined.artistBookingId.artistId.roleProfile)
                } : null
              } : null
            } : null
          }, null, 2));
        }

      bookings.sort((a, b) => new Date(b.bookingDate).getTime() - new Date(a.bookingDate).getTime());

      return bookings;
    } catch (error) {
      throw new BadRequestException('Failed to fetch user bookings');
    }
  }
}
