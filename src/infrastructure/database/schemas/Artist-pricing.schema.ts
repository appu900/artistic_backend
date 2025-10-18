import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ArtistPricingDocument = ArtistPricing & Document;

export interface TimeSlotPricing {
  hour: number; 
  rate: number; 
}

export interface DurationPricing {
  hours: number;
  amount: number;
}

@Schema({ timestamps: true })
export class ArtistPricing {
  @Prop({
    required: true,
    ref: 'ArtistProfile',
    type: Types.ObjectId,
    index: true,
  })
  artistProfileId: Types.ObjectId;

  // Legacy duration-based pricing (for backward compatibility)
  @Prop({ type: [{ hours: Number, amount: Number }], default: [] })
  privatePricing: DurationPricing[];

  @Prop({ type: [{ hours: Number, amount: Number }], default: [] })
  publicPricing: DurationPricing[];

  @Prop({ type: [{ hours: Number, amount: Number }], default: [] })
  workshopPricing: DurationPricing[];

  @Prop({ type: [{ hours: Number, amount: Number }], default: [] })
  internationalPricing: DurationPricing[];

  // New dynamic time-slot based pricing
  @Prop({ type: [{ hour: Number, rate: Number }], default: [] })
  privateTimeSlotPricing: TimeSlotPricing[];

  @Prop({ type: [{ hour: Number, rate: Number }], default: [] })
  publicTimeSlotPricing: TimeSlotPricing[];

  @Prop({ type: [{ hour: Number, rate: Number }], default: [] })
  workshopTimeSlotPricing: TimeSlotPricing[];

  @Prop({ type: [{ hour: Number, rate: Number }], default: [] })
  internationalTimeSlotPricing: TimeSlotPricing[];

  // Pricing mode: 'duration' for legacy, 'timeslot' for new dynamic pricing
  @Prop({ type: String, enum: ['duration', 'timeslot'], default: 'duration' })
  pricingMode: 'duration' | 'timeslot';

  // Base rates for time slots (when no specific slot pricing is set)
  @Prop({ type: Number, default: 0 })
  basePrivateRate: number;

  @Prop({ type: Number, default: 0 })
  basePublicRate: number;

  @Prop({ type: Number, default: 0 })
  baseWorkshopRate: number;

  @Prop({ type: Number, default: 0 })
  baseInternationalRate: number;
}

export const ArtistPricingSchema = SchemaFactory.createForClass(ArtistPricing);
