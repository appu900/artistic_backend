import { Prop } from '@nestjs/mongoose';
import { Types } from 'mongoose';

export class VenueOwnerProfile {
  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  user: Types.ObjectId;
}  
