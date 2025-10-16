import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ArtistBooking,
  ArtistBookingDocument,
} from 'src/infrastructure/database/schemas/artist-booking.schema';
import {
  ArtistProfile,
  ArtistProfileDocument,
} from 'src/infrastructure/database/schemas/artist-profile.schema';

import { BulkUnavailabilityDto } from './dto/create-unavailability.dto';
import { User, UserDocument } from 'src/infrastructure/database/schemas';
import { ArtistUnavailable, ArtistUnavailableDocument } from 'src/infrastructure/database/schemas/Artist-Unavailable.schema';

@Injectable()
export class ArtistAvailabilityService {
  constructor(
    @InjectModel(ArtistProfile.name)
    private readonly artistProfileModel: Model<ArtistProfileDocument>,

    @InjectModel(ArtistBooking.name)
    private readonly bookingModel: Model<ArtistBookingDocument>,

    @InjectModel(ArtistUnavailable.name)
    private readonly artistUnavailableModel: Model<ArtistUnavailableDocument>,

    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  
  async findAvailableArtist(date: Date, startHour: number, endHour: number) {
    // Convert date to string format to match booking schema
    const dateStr = date.toISOString().split('T')[0];
    
    const bookedArtists = await this.bookingModel
      .find({
        date: dateStr,
        status: 'confirmed',
      })
      .select('artistId startTime endTime');

    // Filter bookings that overlap with requested time
    const overlappingBookings = bookedArtists.filter(booking => {
      const bookingStartHour = parseInt(booking.startTime.split(':')[0]);
      const bookingEndHour = parseInt(booking.endTime.split(':')[0]);
      
      // Check if there's time overlap
      return bookingStartHour < endHour && bookingEndHour > startHour;
    });

    const bookedArtistIds = overlappingBookings.map((b) =>
      b.artistId.toString(),
    );

    const unavailableArtists = await this.artistUnavailableModel
      .find({
        date: date,
        hours: { $elemMatch: { $gte: startHour, $lt: endHour } },
      })
      .select('artistProfile');

    const unavailableArtistIds = unavailableArtists.map((u) =>
      u.artistProfile.toString(),
    );

    const excludedArtistIds = new Set([
      ...bookedArtistIds,
      ...unavailableArtistIds,
    ]);

    const availableArtists = await this.artistProfileModel.find({
      _id: { $nin: Array.from(excludedArtistIds) },
    });

    return availableArtists;
  }


  async markUnavailableBulk(userId: string, dto: BulkUnavailabilityDto) {
    const userObjectId = new Types.ObjectId(userId);

    const user = await this.userModel.findById(userObjectId);
    if (!user) {
      throw new NotFoundException('Please login again and try again.');
    }

    if (!user.roleProfile || user.roleProfileRef !== 'ArtistProfile') {
      throw new BadRequestException('You are not registered as an artist.');
    }

    const artistProfileId = user.roleProfile; 

    for (const slot of dto.slots) {
      const dateParts = slot.date.split('-');
      const date = new Date(Date.UTC(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2])));

      const hours =
        slot.hours && slot.hours.length > 0
          ? slot.hours
          : Array.from({ length: 24 }, (_, i) => i);

      await this.artistUnavailableModel.updateOne(
        { artistProfile: artistProfileId, date },
        { $addToSet: { hours: { $each: hours } } },
        { upsert: true },
      );
    }

    return { message: 'Unavailability updated successfully' };
  }

  async getArtistUnavailability(userId: string) {
    const userObjectId = new Types.ObjectId(userId);

    const user = await this.userModel.findById(userObjectId);
    
    if (!user) {
      throw new NotFoundException('Please login again and try again.');
    }

    if (!user.roleProfile || user.roleProfileRef !== 'ArtistProfile') {
      throw new BadRequestException('You are not registered as an artist.');
    }

    const artistProfileId = user.roleProfile;

    const unavailabilityRecords = await this.artistUnavailableModel
      .find({
        artistProfile: artistProfileId
      })
      .select('date hours')
      .sort({ date: 1 });

    return unavailabilityRecords;
  }


  async getArtistUnavailabilityByProfileId(artistProfileId: string, month?: number, year?: number) {
    const artistObjectId = new Types.ObjectId(artistProfileId);

    const artistProfile = await this.artistProfileModel.findById(artistObjectId);
    if (!artistProfile) {
      throw new NotFoundException('Artist profile not found.');
    }

    const currentDate = new Date();
    let startDate: Date;
    let endDate: Date;

    if (month && year) {
      // Use UTC dates to match the unavailability storage format
      startDate = new Date(Date.UTC(year, month - 1, 1));
      endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    } else {
      // Use UTC dates to match the unavailability storage format
      startDate = new Date(Date.UTC(currentDate.getFullYear(), currentDate.getMonth(), 1));
      endDate = new Date(Date.UTC(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59, 999));
    }

    const unavailabilityRecords = await this.artistUnavailableModel
      .find({
        artistProfile: artistObjectId,
        date: {
          $gte: startDate,
          $lte: endDate,
        }
      })
      .select('date hours')
      .sort({ date: 1 });

    const unavailableSlots: { [date: string]: number[] } = {};
    
    unavailabilityRecords.forEach((record) => {
      const dateKey = record.date.toISOString().split('T')[0]; 
      unavailableSlots[dateKey] = record.hours;
    });

    return {
      artistProfileId,
      month: month || currentDate.getMonth() + 1,
      year: year || currentDate.getFullYear(),
      unavailableSlots,
    };
  }


  async removeUnavailability(userId: string, dto: BulkUnavailabilityDto) {
    const userObjectId = new Types.ObjectId(userId);

    // Step 1: Verify user exists and has artist profile
    const user = await this.userModel.findById(userObjectId);
    if (!user) {
      throw new NotFoundException('Please login again and try again.');
    }

    if (!user.roleProfile || user.roleProfileRef !== 'ArtistProfile') {
      throw new BadRequestException('You are not registered as an artist.');
    }

    const artistProfileId = user.roleProfile;

    for (const slot of dto.slots) {
      // Parse date consistently - treat as local date, not UTC
      const dateParts = slot.date.split('-');
      // Create date at midnight UTC to ensure consistent storage and retrieval
      const date = new Date(Date.UTC(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2])));

      if (!slot.hours || slot.hours.length === 0) {
        await this.artistUnavailableModel.deleteOne({
          artistProfile: artistProfileId,
          date
        });
      } else {
        await this.artistUnavailableModel.updateOne(
          { artistProfile: artistProfileId, date },
          { $pullAll: { hours: slot.hours } }
        );

        await this.artistUnavailableModel.deleteOne({
          artistProfile: artistProfileId,
          date,
          hours: { $size: 0 }
        });
      }
    }

    return { message: 'Availability updated successfully' };
  }

  async getCalendarAvailability(artistProfileId: string, month?: number, year?: number) {
    try {
      console.log(`🔍 getCalendarAvailability called with artistProfileId: ${artistProfileId}, month: ${month}, year: ${year}`);
      
      const artistObjectId = new Types.ObjectId(artistProfileId);

      const artistProfile = await this.artistProfileModel.findById(artistObjectId);
      if (!artistProfile) {
        throw new NotFoundException('Artist profile not found.');
      }

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

      console.log(`📅 Searching date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);

      // Get unavailable slots
      const unavailableRecords = await this.artistUnavailableModel
        .find({
          artistProfile: artistObjectId,
          date: {
            $gte: startDate,
            $lte: endDate,
          }
        })
        .select('date hours')
        .sort({ date: 1 });

      console.log(`🚫 Found ${unavailableRecords.length} unavailable records`);

      // Get confirmed bookings
      const confirmedBookings = await this.bookingModel
        .find({
          artistId: artistProfile.user,
          status: { $in: ['pending', 'confirmed'] },
          date: {
            $gte: startDate.toISOString().split('T')[0],
            $lte: endDate.toISOString().split('T')[0],
          },
        })
        .select('date startTime endTime')
        .sort({ date: 1 });

      console.log(`📋 Found ${confirmedBookings.length} confirmed bookings`);

      // Combine unavailable slots
      const unavailableSlots: { [date: string]: number[] } = {};
      
      // Add manually marked unavailable slots
      unavailableRecords.forEach((record) => {
        const dateKey = record.date.toISOString().split('T')[0];
        unavailableSlots[dateKey] = [...record.hours];
        console.log(`🚫 Manual unavailable: ${dateKey} -> Hours: [${record.hours.join(', ')}]`);
      });

      // Add booking hours
      confirmedBookings.forEach((booking) => {
        const dateKey = booking.date;
        const startHour = parseInt(booking.startTime.split(':')[0]);
        const endHour = parseInt(booking.endTime.split(':')[0]);
        
        const bookedHours: number[] = [];
        for (let hour = startHour; hour < endHour; hour++) {
          bookedHours.push(hour);
        }
        
        if (unavailableSlots[dateKey]) {
          const combined = [...unavailableSlots[dateKey], ...bookedHours];
          unavailableSlots[dateKey] = [...new Set(combined)].sort((a, b) => a - b);
        } else {
          unavailableSlots[dateKey] = bookedHours;
        }
        
        console.log(`📋 Booking unavailable: ${dateKey} -> Hours: [${bookedHours.join(', ')}]`);
      });

      console.log('📋 Final calendar availability response:', {
        artistId: artistProfileId,
        month: month || currentDate.getMonth() + 1,
        year: year || currentDate.getFullYear(),
        unavailableSlots: unavailableSlots,
      });

      return {
        artistId: artistProfileId,
        month: month || currentDate.getMonth() + 1,
        year: year || currentDate.getFullYear(),
        unavailableSlots: unavailableSlots,
      };
    } catch (error) {
      console.error('❌ Error in getCalendarAvailability:', error);
      throw error;
    }
  }

  async getDateAvailability(artistProfileId: string, dateStr: string) {
    try {
      const artistObjectId = new Types.ObjectId(artistProfileId);

      // Validate artist exists
      const artistProfile = await this.artistProfileModel.findById(artistObjectId);
      if (!artistProfile) {
        throw new NotFoundException('Artist profile not found.');
      }

      // Parse the date string (YYYY-MM-DD) and create UTC date
      const dateParts = dateStr.split('-');
      const year = parseInt(dateParts[0]);
      const month = parseInt(dateParts[1]) - 1; // JavaScript months are 0-indexed
      const day = parseInt(dateParts[2]);

      // Get unavailable hours for this specific date
      const unavailableRecord = await this.artistUnavailableModel.findOne({
        artistProfile: artistProfileId, // Use string directly as it works
        date: {
          $gte: new Date(Date.UTC(year, month, day, 0, 0, 0)),
          $lte: new Date(Date.UTC(year, month, day, 23, 59, 59))
        }
      });

      let unavailableHours: number[] = [];
      if (unavailableRecord) {
        unavailableHours = [...unavailableRecord.hours];
      }

      // Get confirmed bookings for this specific date
      const confirmedBookings = await this.bookingModel.find({
        artistId: artistProfile.user,
        status: { $in: ['pending', 'confirmed'] },
        date: dateStr, // booking date is stored as string
      });

      // Add booking hours to unavailable hours
      confirmedBookings.forEach((booking) => {
        const startHour = parseInt(booking.startTime.split(':')[0]);
        const endHour = parseInt(booking.endTime.split(':')[0]);
        
        for (let hour = startHour; hour < endHour; hour++) {
          if (!unavailableHours.includes(hour)) {
            unavailableHours.push(hour);
          }
        }
      });

      // Sort unavailable hours
      unavailableHours.sort((a, b) => a - b);
      
      // Create available hours (all hours not in unavailable list)
      const allHours = Array.from({ length: 24 }, (_, i) => i);
      const availableHours = allHours.filter(hour => !unavailableHours.includes(hour));

      return {
        date: dateStr,
        unavailableHours,
        availableHours,
        totalAvailableHours: availableHours.length,
        totalUnavailableHours: unavailableHours.length,
        isCompletelyUnavailable: unavailableHours.length >= 24,
        isCompletelyAvailable: unavailableHours.length === 0,
      };
    } catch (error) {
      console.error('❌ Error in getDateAvailability:', error);
      throw error;
    }
  }
}
