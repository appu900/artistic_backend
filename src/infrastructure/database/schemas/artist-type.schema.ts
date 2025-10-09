import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ArtistTypeDocument = ArtistType & Document;

@Schema({ timestamps: true })
export class ArtistType {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  description: string;
}



export const ArtistTypeSchema = SchemaFactory.createForClass(ArtistType)