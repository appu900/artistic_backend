import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { PerformancePreference } from 'src/common/enums/roles.enum';

export type ArtistApplicationDocument = ArtistApplication & Document


export enum ApplicationType{
    SOLO="SOLO",
    GROUP="GROUP"
}

export enum ApplicationStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Schema({ timestamps: true })
export class ArtistApplication {
  @Prop({ required: true })
  fullName: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  gender: string;

  @Prop({ type: Number, required: true, min: 10, max: 100 })
  age: number;

  @Prop({
    type: String,
    enum: Object.values(ApplicationType),
    required: true,
  })
  applicationType: ApplicationType;

  @Prop({ required: false })
  resume: string; 

  @Prop({ required: false })
  videoLink: string; 

  @Prop({
    type: [String],
    enum: Object.values(PerformancePreference),
    default: [],
  })
  performPreference: PerformancePreference[];

  @Prop({ required: false })
  profileImage: string;

  @Prop({
    type: String,
    enum: Object.values(ApplicationStatus),
    default: ApplicationStatus.PENDING,
  })
  status: ApplicationStatus;
}

export const ArtistApplicationSchema =
  SchemaFactory.createForClass(ArtistApplication);