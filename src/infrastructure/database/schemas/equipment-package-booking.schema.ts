import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EquipmentPackageBookingDocument = EquipmentPackageBooking & Document;

@Schema({ timestamps: true })
export class EquipmentPackageBooking {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true,index:true })
  bookedBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'EquipmentPackage', required: true,index:true })
  packageId: Types.ObjectId;

  @Prop({ required: true })
  startDate: string; // Format: YYYY-MM-DD

  @Prop({ required: true })
  endDate: string; // Format: YYYY-MM-DD

  @Prop({ required: true, min: 1 })
  numberOfDays: number;

  @Prop({ required: true })
  pricePerDay: number;

  @Prop({ required: true })
  totalPrice: number; // pricePerDay * numberOfDays

  @Prop({
    enum: ['pending', 'confirmed', 'cancelled', 'completed'],
    default: 'pending',
  })
  status: string;

  @Prop({
    required: true,
    type: {
      name: { type: String, required: true },
      email: { type: String, required: true },
      phone: { type: String, required: true },
    },
  })
  userDetails: {
    name: string;
    email: string;
    phone: string;
  };

  @Prop({
    required: true,
    type: {
      address: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      country: { type: String, required: true },
      postalCode: { type: String },
      venueType: { type: String },
      additionalInfo: { type: String },
    },
  })
  venueDetails: {
    address: string;
    city: string;
    state: string;
    country: string;
    postalCode?: string;
    venueType?: string;
    additionalInfo?: string;
  };

  @Prop()
  eventDescription?: string;

  @Prop()
  specialRequests?: string;

  @Prop({
    enum: ['pending', 'paid', 'refunded', 'failed'],
    default: 'pending',
  })
  paymentStatus: string;

  @Prop()
  cancellationReason?: string;

  @Prop()
  cancelledAt?: Date;

  @Prop()
  refundAmount?: number;

  @Prop({ default: Date.now })
  bookingDate: Date;

  // NEW FIELDS FOR EVENT INTEGRATION (all optional to maintain backward compatibility)
  
  @Prop({ type: Types.ObjectId, ref: 'Event' })
  eventId?: Types.ObjectId;

  @Prop({ type: Boolean, default: false })
  isAdminCreated?: boolean;
}

export const EquipmentPackageBookingSchema = SchemaFactory.createForClass(EquipmentPackageBooking);
