// seat.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SeatDocument = Seat & Document;

@Schema({ timestamps: true })
export class Seat {
  @Prop({ required: true })
  seatId: string; 

  @Prop({ type: Types.ObjectId, ref: 'OpenBookingLayout', required: true })
  layoutId: Types.ObjectId;

  @Prop({ required: true })
  catId: string;

  @Prop({ required: true })
  price: number;

  @Prop({ default: 'available', enum: ['available', 'booked', 'blocked', 'locked'] })
  bookingStatus: string;
  
  @Prop({default:null})
  lockExpiry?: Date;

  @Prop()
  lockedBy?: string;


  @Prop({
    type: {
      x: { type: Number },
      y: { type: Number },
    },
  })
  pos: { x: number; y: number };

  @Prop({
    type: {
      x: { type: Number },
      y: { type: Number },
    },
  })
  size: { x: number; y: number };

  @Prop()
  rot: number;

  @Prop()
  rl: string; 

  @Prop()
  sn: string; 

  @Prop({type:Types.ObjectId,ref:'Event'})
  eventId:Types.ObjectId

  @Prop({type:Types.ObjectId,ref:"User"})
  userId?:Types.ObjectId
}

export const SeatSchema = SchemaFactory.createForClass(Seat);

// Add compound unique index to prevent duplicate seats within the same layout
SeatSchema.index({ seatId: 1, layoutId: 1 }, { unique: true });

// Add index for efficient querying by booking status
SeatSchema.index({ bookingStatus: 1 });

// Add index for lock expiry cleanup
SeatSchema.index({ lockExpiry: 1 }, { sparse: true });
