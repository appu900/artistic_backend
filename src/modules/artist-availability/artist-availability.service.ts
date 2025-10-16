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
    const bookedArtists = await this.bookingModel
      .find({
        date,
        status: 'confirmed',
        $expr: {
          $and: [
            { $lt: ['$startHour', endHour] },
            { $gt: ['$endHour', startHour] },
          ],
        },
      })
      .select('artist');

    const bookedArtistIds = bookedArtists.map((b) =>
      b.artistId.toString(),
    );

    const unavailableArtists = await this.artistUnavailableModel
      .find({
        date,
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
      const date = new Date(slot.date);

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
      startDate = new Date(year, month - 1, 1);
      endDate = new Date(year, month, 0);
    } else {
      startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
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
      const date = new Date(slot.date);

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
}
