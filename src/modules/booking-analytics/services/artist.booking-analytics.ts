import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { read } from 'fs';
import { Model, Types } from 'mongoose';
import {
  ArtistBooking,
  ArtistBookingDocument,
} from 'src/infrastructure/database/schemas/artist-booking.schema';
import { ArtistService } from 'src/modules/artist/artist.service';

@Injectable()
export class ArtistBookingAnalytics {
  constructor(
    @InjectModel(ArtistBooking.name)
    private artistBookingModel: Model<ArtistBookingDocument>,
  ) {}

  async getAllBookingsByArtistId(artistId: string) {
    const objectArtistId = new Types.ObjectId(artistId);
    const res = await this.artistBookingModel
      .find({ artistId: objectArtistId })
      .populate({
        path: 'bookedBy',
        select: 'firstName lastName phoneNumber email',
      })
      .exec();
      return res
  } 
  
}
