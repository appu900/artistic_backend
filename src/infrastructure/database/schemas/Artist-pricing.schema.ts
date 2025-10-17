import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ArtistPricingDocument = ArtistPricing & Document;

@Schema({ timestamps: true })
export class ArtistPricing {
  @Prop({
    required: true,
    ref: 'ArtistProfile',
    type: Types.ObjectId,
    index: true,
  })
  artistProfileId: Types.ObjectId;

  @Prop({ type: [{ hours: Number, amount: Number }], default: [] })
  privatePricing: {
    hours: number;
    amount: number;
  }[];

  @Prop({ type: [{ hours: Number, amount: Number }], default: [] })
  publicPricing: {
    hours: number;
    amount: number;
  }[];

  @Prop({ type: [{ hours: Number, amount: Number }], default: [] })
  workshopPricing: {
    hours: number;
    amount: number;
  }[];

  @Prop({ type: [{ hours: Number, amount: Number }], default: [] })
  internationalPricing: {
    hours: number;
    amount: number;
  }[];
}

export const ArtistPricingSchema = SchemaFactory.createForClass(ArtistPricing);
