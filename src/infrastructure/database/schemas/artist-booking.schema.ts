import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ArtistBookingDocument = ArtistBooking & Document;

@Schema({ timestamps: true })
export class ArtistBooking {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true,index:true })
  artistId: Types.ObjectId;

<<<<<<< HEAD
  @Prop({ type: Types.ObjectId, ref: 'User', required: true,index:true })
  bookedBy: Types.ObjectId; // user or venue owner both can book
=======
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  bookedBy: Types.ObjectId; 
>>>>>>> 74d5b56f0cc14a209eb1857888a942f0f0d09d4a

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

  @Prop({ type: Types.ObjectId, ref: 'CombineBooking', default: null })
  combineBookingRef?: Types.ObjectId; 

  @Prop({})
  address?:string
}

export const ArtistBookingSchema = SchemaFactory.createForClass(ArtistBooking);
