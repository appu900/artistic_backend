import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ArtistUnavailableDocument = ArtistUnavailable & Document;




@Schema({timestamps:true})
export class ArtistUnavailable {
  @Prop({ type: Types.ObjectId, ref: 'ArtistProfile', required: true })
  artistProfile: Types.ObjectId;

  @Prop({ type: Date, required: true })
  date: Date;

  @Prop({ type: [Number], default: [] })
  hours: number[];
}


export const ArtistUnavailableSchema = SchemaFactory.createForClass(ArtistUnavailable);