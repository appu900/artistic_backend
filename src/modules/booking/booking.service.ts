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
} from './dto/booking.dto';
import { endWith, startWith } from 'rxjs';
import { User, UserDocument } from 'src/infrastructure/database/schemas';
import { Type } from 'class-transformer';

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
      
   
      const preferenceStrings = artistExists.performPreference.map(p => p.toString().toLowerCase());
      const hasPrivatePreference = preferenceStrings.includes('private');
      
      if (!hasPrivatePreference) {
        throw new BadRequestException('Artist not available for private bookings');
      }
      
      const artistProfile = artistExists;

      const currentDate = new Date();
      let startDate: Date;
      let endDate: Date;

      if (month && year) {
        startDate = new Date(year, month - 1, 1);
        endDate = new Date(year, month, 0);
      } else {
        startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      }

      const unavailableSlots = await this.artistUnavailableModel.find({
        artistProfile: artistProfile._id,
        date: {
          $gte: startDate,
          $lte: endDate,
        },
      });

     
      const existingBookings = await this.artistBookingModel.find({
        artistId: artistProfile.user, // Use user ID, not profile ID
        status: { $in: ['pending', 'confirmed'] }, // Include pending and confirmed bookings
        date: {
          $gte: startDate.toISOString().split('T')[0],
          $lte: endDate.toISOString().split('T')[0],
        },
      });

      console.log(`🔍 Found ${existingBookings.length} existing bookings for artist ${artistId}`);

      // Transform the data into the expected format
      const unavailableByDate: { [date: string]: number[] } = {};
      
      // Add manually marked unavailable slots
      unavailableSlots.forEach((slot) => {
        const dateKey = slot.date.toISOString().split('T')[0]; // YYYY-MM-DD format
        unavailableByDate[dateKey] = [...slot.hours]; // Create a copy of the hours array
      });

      // Add booked slots as unavailable
      existingBookings.forEach((booking) => {
        const dateKey = booking.date; // Already in YYYY-MM-DD format
        
        // Parse start and end times to get hour ranges
        const startHour = parseInt(booking.startTime.split(':')[0]);
        const endHour = parseInt(booking.endTime.split(':')[0]);
        
        // Generate array of booked hours
        const bookedHours: number[] = [];
        for (let hour = startHour; hour < endHour; hour++) {
          bookedHours.push(hour);
        }
        
        // Merge with existing unavailable hours for this date
        if (unavailableByDate[dateKey]) {
          // Combine and remove duplicates
          const combined = [...unavailableByDate[dateKey], ...bookedHours];
          unavailableByDate[dateKey] = [...new Set(combined)].sort((a, b) => a - b);
        } else {
          unavailableByDate[dateKey] = bookedHours;
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

  // Test method to create unavailable slots for testing
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
    //   ** fetch artist details
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

  //   ** create artist booking code
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

      // Check against manually marked unavailable slots
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

      // Also check against existing bookings to prevent double booking
      const existingBookings = await this.artistBookingModel.find({
        artistId: new Types.ObjectId(dto.artistId), // This method receives user ID directly
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
      await this.artistUnavailableModel.updateOne(
        {
          artistProfile: new Types.ObjectId(artist.roleProfile),
          date: new Date(dto.date),
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
      // First get the artist profile
      const artistProfile = await this.artistProfileModel.findOne({
        _id: new Types.ObjectId(dto.artistId),
        isVisible: true,
      });

      if (!artistProfile) {
        throw new BadRequestException('Artist not found');
      }

      // Check if artist has private performance preference
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

      // Validate artist availability
      const startHour = parseInt(dto.startTime.split(':')[0]);
      const endHour = parseInt(dto.endTime.split(':')[0]);
      const requestedHours: number[] = [];
      for (let h = startHour; h < endHour; h++) {
        requestedHours.push(h);
      }

      // Check against manually marked unavailable slots
      const unavailable = await this.artistUnavailableModel.findOne({
        artistProfile: artistProfile._id,
        date: new Date(dto.eventDate),
      });

      if (unavailable) {
        const conflict = requestedHours.some((hour) =>
          unavailable.hours.includes(hour),
        );
        if (conflict) {
          throw new ConflictException('Artist not available for selected time.');
        }
      }

      // Also check against existing bookings to prevent double booking
      const existingBookings = await this.artistBookingModel.find({
        artistId: artistProfile.user, // Use user ID, not profile ID
        date: dto.eventDate,
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

      // Create artist booking
      const artistBooking = await this.artistBookingModel.create(
        [
          {
            artistId: artistProfile.user, // Use the user ID for the booking
            bookedBy: new Types.ObjectId(dto.bookedBy),
            artistType: dto.eventType,
            date: dto.eventDate,
            startTime: dto.startTime,
            endTime: dto.endTime,
            price: dto.artistPrice,
            status: 'confirmed',
            address: `${dto.venueDetails.address}, ${dto.venueDetails.city}, ${dto.venueDetails.state}, ${dto.venueDetails.country}`,
          },
        ],
        { session },
      );

      let equipmentBooking: any = null;
      
      // Create equipment booking only if equipment packages are selected
      if (dto.selectedEquipmentPackages && dto.selectedEquipmentPackages.length > 0) {
        equipmentBooking = await this.equipmentBookingModel.create(
          [
            {
              bookedBy: new Types.ObjectId(dto.bookedBy),
              equipments: [], // No individual equipment items, only packages
              packages: dto.selectedEquipmentPackages.map((p) => new Types.ObjectId(p)),
              date: dto.eventDate,
              startTime: dto.startTime,
              endTime: dto.endTime,
              totalPrice: dto.equipmentPrice || 0,
              status: 'confirmed',
              address: `${dto.venueDetails.address}, ${dto.venueDetails.city}, ${dto.venueDetails.state}, ${dto.venueDetails.country}`,
            },
          ],
          { session },
        );
      }

      // Create combined booking
      const combineBooking = await this.combineBookingModel.create(
        [
          {
            bookingType: dto.selectedEquipmentPackages && dto.selectedEquipmentPackages.length > 0 ? 'combined' : 'artist_only',
            bookedBy: new Types.ObjectId(dto.bookedBy),
            artistBookingId: artistBooking[0]._id,
            equipmentBookingId: equipmentBooking ? equipmentBooking[0]._id : null,
            date: dto.eventDate,
            startTime: dto.startTime,
            endTime: dto.endTime,
            totalPrice: dto.totalPrice,
            status: 'confirmed',
            address: `${dto.venueDetails.address}, ${dto.venueDetails.city}, ${dto.venueDetails.state}, ${dto.venueDetails.country}`,
            // Store additional booking details
            userDetails: dto.userDetails,
            venueDetails: dto.venueDetails,
            eventDescription: dto.eventDescription,
            specialRequests: dto.specialRequests,
          },
        ],
        { session },
      );

      // Mark artist as unavailable for the selected time slots
      await this.artistUnavailableModel.updateOne(
        {
          artistProfile: artistProfile._id,
          date: new Date(dto.eventDate),
        },
        {
          $addToSet: { hours: { $each: requestedHours } },
        },
        { upsert: true, session },
      );

      // Link artist booking to combined booking
      await this.artistBookingModel.updateOne(
        { _id: artistBooking[0]._id },
        { combineBookingRef: combineBooking[0]._id },
        { session },
      );

      // Link equipment booking to combined booking if it exists
      if (equipmentBooking) {
        await this.equipmentBookingModel.updateOne(
          { _id: equipmentBooking[0]._id },
          { combineBookingRef: combineBooking[0]._id },
          { session },
        );
      }

      await session.commitTransaction();

      return {
        message: 'Booking created successfully',
        data: {
          _id: combineBooking[0]._id,
          artistId: dto.artistId, // Return the artist profile ID as originally requested
          bookedBy: dto.bookedBy,
          eventType: dto.eventType,
          eventDate: dto.eventDate,
          startTime: dto.startTime,
          endTime: dto.endTime,
          status: 'confirmed',
          totalPrice: dto.totalPrice,
          bookingDate: new Date().toISOString(),
        },
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }
}
