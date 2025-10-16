import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CombineBookingDocument = CombineBooking & Document;

export class UserDetails {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  email: string;

  @Prop({ required: true })
  phone: string;
}

export class VenueDetails {
  @Prop({ required: true })
  address: string;

  @Prop({ required: true })
  city: string;

  @Prop({ required: true })
  state: string;

  @Prop({ required: true })
  country: string;

  @Prop()
  postalCode?: string;

  @Prop()
  venueType?: string;

  @Prop()
  additionalInfo?: string;
}

@Schema({ timestamps: true })
export class CombineBooking {
  @Prop({
    enum: ['artist', 'equipment', 'combined', 'artist_only'],
    required: true,
  })
  bookingType: 'artist' | 'equipment' | 'combined' | 'artist_only';

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  bookedBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'ArtistBooking', default: null })
  artistBookingId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'EquipmentBooking', default: null })
  equipmentBookingId?: Types.ObjectId;

  @Prop({ required: true })
  date: string;

  @Prop({ required: true })
  startTime: string;

  @Prop({ required: true })
  endTime: string;

  @Prop({
    enum: ['pending', 'confirmed', 'cancelled'],
    default: 'pending',
  })
  status: string;

  @Prop({ required: true })
  totalPrice: number;

  @Prop({ required: true })
  address: string;

  @Prop({ type: UserDetails })
  userDetails?: UserDetails;

  @Prop({ type: VenueDetails })
  venueDetails?: VenueDetails;

  @Prop()
  eventDescription?: string;

  @Prop()
  specialRequests?: string;
}

export const CombineBookingSchema = SchemaFactory.createForClass(CombineBooking);
