import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type VenueOwnerApplicationDocument = VenueOwnerApplication & Document;

export enum VenueApplicationStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Schema({ timestamps: true })
export class VenueOwnerApplication {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  email: string;

  @Prop({ required: true })
  phoneNumber: string;

  @Prop({ required: true })
  venue: string;

  @Prop()
  ownerDescription?: string;

  @Prop({ required: true })
  companyName: string;

  @Prop()
  licenseUrl?: string;

  @Prop()
  venueImageUrl?: string;

  @Prop({ type: String, enum: Object.values(VenueApplicationStatus), default: VenueApplicationStatus.PENDING })
  status: VenueApplicationStatus;
}

export const VenueOwnerApplicationSchema = SchemaFactory.createForClass(VenueOwnerApplication);
