import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ArtistBookingDocument = ArtistBooking & Document;

@Schema({ timestamps: true })
export class ArtistBooking {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'ArtistProfile', required: true })
  artist: Types.ObjectId;

  @Prop({ type: Date, required: true })
  date: Date;

  @Prop({ type: Number, required: true })
  startHour: number;

  @Prop({ type: Number, required: true })
  endHour: number;

  @Prop({ default: 'confirmed', enum: ['pending', 'confirmed', 'cancelled'] })
  status: string;
}


export const ArtistBookingSchema = SchemaFactory.createForClass(ArtistBooking);