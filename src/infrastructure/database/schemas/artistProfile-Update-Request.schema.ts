import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ArtistProfileUpdateRequestDocument = ArtistProfleUpdateRequest &
  Document;
export enum UpdateStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
}
@Schema({ timestamps: true })
export class ArtistProfleUpdateRequest {
  @Prop({ type: Types.ObjectId, ref: 'ArtistProfile', required: true })
  artistProfile: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true,index:true })
  artistUser: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(UpdateStatus),
    default: UpdateStatus.PENDING,
  })
  status: UpdateStatus;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  reviewedBy?: Types.ObjectId;

  @Prop({ default: '' })
  adminComment?: string;

  @Prop({ type: Object, required: true })
  proposedChanges: Record<string, any>;
}

export const ArtistProfileUpdateRequestSchema = SchemaFactory.createForClass(
  ArtistProfleUpdateRequest,
);
