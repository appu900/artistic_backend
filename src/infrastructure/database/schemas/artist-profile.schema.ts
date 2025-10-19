import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { PerformancePreference } from 'src/common/enums/roles.enum';

export type ArtistProfileDocument = ArtistProfile & Document;

@Schema({ timestamps: true })
export class ArtistProfile {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  addedBy: Types.ObjectId;

  @Prop({ required: true })
  gender: string;

  @Prop({ required: true })
  artistType: string;

  @Prop({ required: true })
  stageName: string;

  @Prop({ default: '' })
  about: string;

  @Prop({ type: Number, min: 0, default: 0 })
  yearsOfExperience: number;

  @Prop({ type: [String], default: [] })
  skills: string[];

  @Prop({ type: [String], default: [] })
  musicLanguages: string[];

  @Prop({ type: [String], default: [] })
  awards: string[];

  @Prop({ type: Number, required: true, min: 0 })
  pricePerHour: number;

  @Prop({ default: '' })
  profileImage: string;

  @Prop({ default: '' })
  profileCoverImage: string;

  @Prop({ default: '' })
  youtubeLink?: string;

  @Prop({ type: Number, default: 0 })
  likeCount: number;

  @Prop({ default: '' })
  category: string;

  @Prop({ default: '' })
  country: string;

  // Performance settings
  @Prop({ type: Number, default: 2, min: 1, max: 24 })
  cooldownPeriodHours: number; // Hours to wait after a booking before next availability

  @Prop({ type: Number, default: 4, min: 1, max: 12 })
  maximumPerformanceHours: number; // Maximum consecutive hours per booking

  @Prop({ type: Types.ObjectId, ref: 'ArtistPricing' })
  pricingInformation?: Types.ObjectId;



  @Prop({ type: [String], default: [] })
  genres: string[];

  @Prop({
    type: [String],
    enum: Object.values(PerformancePreference),
    default: [PerformancePreference.PRIVATE],
  })
  performPreference: PerformancePreference[];

  @Prop({ type: Boolean, default: true })
  isVisible: boolean;
}

export const ArtistProfileSchema = SchemaFactory.createForClass(ArtistProfile);
