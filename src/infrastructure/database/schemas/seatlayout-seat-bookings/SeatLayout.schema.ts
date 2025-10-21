import { Prop } from '@nestjs/mongoose';
import { Types } from 'mongoose';

export class SeatLayout {
  @Prop({ required: true, enum: ['rectangle', 'circle'] })
  layoutCategory: string;

  @Prop({ required: true })
  totalSeats: number;

  @Prop({ required: true })
  totalSections: number;

  @Prop({
    type: {
      screenPosition: {
        type: String,
        enum: ['top', 'bottom'],
        default: 'bottom',
      },
      screenWidth: { type: Number, default: 100 },
      screenHeight: { type: Number, default: 10 },
    },
  })
  screenConfig: {
    screenPosition: 'top' | 'bottom';
    screenWidth: number;
    screenHeight: number;
  };

  @Prop({ type: Types.ObjectId, ref: 'Section' })
  sections: Types.ObjectId[];

  @Prop({ required: true })
  eventId: string;
}
