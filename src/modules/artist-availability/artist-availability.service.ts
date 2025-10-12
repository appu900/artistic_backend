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

  /**
   * 🔍 Find all artists available for a given date and time range.
   * Excludes artists who are already booked or marked unavailable.
   */
  async findAvailableArtist(date: Date, startHour: number, endHour: number) {
    // Step 1: Find all confirmed bookings that overlap with the requested range
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
      b.artist.toString(),
    );

    // Step 2: Find all artists marked unavailable for overlapping hours
    const unavailableArtists = await this.artistUnavailableModel
      .find({
        date,
        hours: { $elemMatch: { $gte: startHour, $lt: endHour } },
      })
      .select('artistProfile');

    const unavailableArtistIds = unavailableArtists.map((u) =>
      u.artistProfile.toString(),
    );

    // Step 3: Combine both booked + unavailable artists
    const excludedArtistIds = new Set([
      ...bookedArtistIds,
      ...unavailableArtistIds,
    ]);

    // Step 4: Return all artists NOT in the excluded list
    const availableArtists = await this.artistProfileModel.find({
      _id: { $nin: Array.from(excludedArtistIds) },
    });

    return availableArtists;
  }

  /**
   * 🚫 Mark specific dates or hours as unavailable for an artist (bulk update).
   * Uses userId → roleProfile → artistProfile mapping.
   */
  async markUnavailableBulk(userId: string, dto: BulkUnavailabilityDto) {
    const userObjectId = new Types.ObjectId(userId);

    // Step 1: Verify user exists
    const user = await this.userModel.findById(userObjectId);
    if (!user) {
      throw new NotFoundException('Please login again and try again.');
    }

    // Step 2: Verify the user has an ArtistProfile
    if (!user.roleProfile || user.roleProfileRef !== 'ArtistProfile') {
      throw new BadRequestException('You are not registered as an artist.');
    }

    const artistProfileId = user.roleProfile; // points to ArtistProfile _id

    // Step 3: Process each slot in the bulk request
    for (const slot of dto.slots) {
      const date = new Date(slot.date);

      // If no hours specified → mark full day
      const hours =
        slot.hours && slot.hours.length > 0
          ? slot.hours
          : Array.from({ length: 24 }, (_, i) => i);

      // Step 4: Upsert record (merge hours without duplicates)
      await this.artistUnavailableModel.updateOne(
        { artistProfile: artistProfileId, date },
        { $addToSet: { hours: { $each: hours } } },
        { upsert: true },
      );
    }

    return { message: 'Unavailability updated successfully' };
  }
}
