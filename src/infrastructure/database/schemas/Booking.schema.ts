import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CombineBookingDocument = CombineBooking & Document;

@Schema({ timestamps: true })
export class CombineBooking {
  @Prop({
    enum: ['artist', 'equipment', 'combined'],
    required: true,
  })
  bookingType: 'artist' | 'equipment' | 'combined';

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
}

export const CombineBookingSchema = SchemaFactory.createForClass(CombineBooking);
