import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserLikesDocument = UserLikes & Document;

@Schema({ timestamps: true })
export class UserLikes {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true, index: true })
  user: Types.ObjectId;

  @Prop({ 
    type: [{ 
      artist: { type: Types.ObjectId, ref: 'ArtistProfile', required: true },
      likedAt: { type: Date, default: Date.now }
    }], 
    default: [],
    index: true 
  })
  likedArtists: Array<{
    artist: Types.ObjectId;
    likedAt: Date;
  }>;
}

export const UserLikesSchema = SchemaFactory.createForClass(UserLikes);

UserLikesSchema.index({ 'likedArtists.artist': 1 });