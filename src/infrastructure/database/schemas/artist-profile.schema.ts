import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ArtistType = 'solo' | 'band';
export type CategoryType = 'music' | 'dance' | 'theatre' | 'other' | 'band' | 'art';

export type ArtistProfileDocument = ArtistProfile & Document;

@Schema({ timestamps: true })
export class ArtistProfile {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user: Types.ObjectId;

  @Prop({ required: true })
  stageName: string;

  @Prop()
  about?: string;

  @Prop()
  yearsOfExperience?: number;

  @Prop({ type: [String], default: [] })
  skills: string[];

  @Prop({ type: [String], default: [] })
  musicLanguages: string[];

  @Prop({ type: [String], default: [] })
  awards: string[];

  @Prop({ required: true })
  pricePerHour: number;

  @Prop({ type: String, enum: ['solo', 'band'], required: true })
  artistType: ArtistType;

  @Prop({ default: true })
  isAvailable: boolean;

  @Prop()
  profileImage?: string;

  @Prop()
  profileCoverImage?: string;

  @Prop()
  demoVideo?: string;

  @Prop({ type: Number, min: 0, max: 5, default: 0 })
  rating: number;

  // 🆕 Additional fields
  @Prop({ type: String, enum: ['music', 'dance', 'theatre', 'other', 'band'], default: 'music' })
  category: CategoryType;

  @Prop({
    type: [String],
    default: [],
    validate: {
      validator: (arr: string[]) => Array.isArray(arr) && arr.every((g) => typeof g === 'string'),
      message: 'Genres must be an array of strings',
    },
  })
  genres: string[];

  @Prop({ default: false })
  performsInternationally: boolean;

  @Prop({ default: 'Kuwait' })
  baseCountry: string;
}

export const ArtistProfileSchema = SchemaFactory.createForClass(ArtistProfile);
