import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ArtistBookingDocument = ArtistBooking & Document;

@Schema({ timestamps: true })
export class ArtistBooking {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true,index:true })
  artistId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index:true })
  bookedBy: Types.ObjectId; 

  @Prop({ required: true })
  date: string;

  @Prop({ required: true })
  startTime: string;

  @Prop({ required: true })
  endTime: string;

  @Prop({
    enum: ['private', 'public'],
    required: true,
  })
  artistType: 'private' | 'public';

  @Prop({
    enum: ['pending', 'confirmed', 'cancelled'],
    default: 'pending',
  })
  status: string;

  @Prop({ type: Number, required: true })
  price: number;

  // NEW: Add totalPrice as alias/additional field for event bookings (optional for backward compatibility)
  @Prop({ type: Number })
  totalPrice?: number;

  @Prop({ type: Types.ObjectId, ref: 'CombineBooking', default: null })
  combineBookingRef?: Types.ObjectId; 

  @Prop({})
  address?: string;

  // NEW FIELDS FOR EVENT INTEGRATION (all optional to maintain backward compatibility)
  
  @Prop({ type: Types.ObjectId, ref: 'Event' })
  eventId?: Types.ObjectId;

  @Prop({
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'pending'
  })
  paymentStatus?: string;

  @Prop({ type: Boolean, default: false })
  isAdminCreated?: boolean;

  @Prop({ type: String })
  eventDescription?: string;

  @Prop({ type: String })
  specialRequests?: string;

  @Prop({
    type: {
      name: { type: String },
      address: { type: String },
      city: { type: String },
      state: { type: String },
      country: { type: String },
    }
  })
  venueDetails?: {
    name?: string;
    address?: string;
    city?: string;
    state?: string;
    country?: string;
  };
}

export const ArtistBookingSchema = SchemaFactory.createForClass(ArtistBooking);
