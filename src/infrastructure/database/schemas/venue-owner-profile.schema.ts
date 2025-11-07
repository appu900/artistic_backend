import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type VenueOwnerProfileDocument = VenueOwnerProfile & Document;

@Schema({ timestamps: true })
export class VenueOwnerProfile {
  @Prop({ type: Types.ObjectId, ref: 'User', index: true, required: true })
  user: Types.ObjectId;

  @Prop({ required: true, trim: true })
  address: string;

  @Prop()
  coverPhoto?: string;

  @Prop({ required: true, trim: true })
  category: string;

  @Prop()
  profileImage?: string;

  // Reference layouts owned by this venue provider (denormalized for fast access)
  @Prop({ type: [{ type: Types.ObjectId, ref: 'SeatLayout' }], default: [] })
  layouts?: Types.ObjectId[];

  // Optional default layout for quick selection
  @Prop({ type: Types.ObjectId, ref: 'SeatLayout' })
  defaultLayout?: Types.ObjectId;

  // Permission to create new layouts (requires admin approval)
  @Prop({ type: Boolean, default: false })
  canCreateLayouts?: boolean;
}

export const VenueOwnerProfileSchema = SchemaFactory.createForClass(VenueOwnerProfile);
