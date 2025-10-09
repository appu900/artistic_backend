// import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
// import { Document, Types } from 'mongoose';

// export type ArtistProfileDocument = ArtistProfile & Document;

// @Schema({ timestamps: true })
// export class ArtistProfile {
//   @Prop({ type: Types.ObjectId, required: true })
//   createdByUserId: Types.ObjectId; // user who represents the artist (admin-created)

//   @Prop({ required: true })
//   stageName: string;

//   @Prop({ default: '' })
//   genre: string;

//   @Prop({ default: '' })
//   bio: string;

//   @Prop({ type: [String], default: [] })
//   socialLinks: string[];

//   @Prop({ default: 0 })
//   pricePerEvent: number;

//   @Prop({ default: true })
//   available: boolean;
// }

// export const ArtistProfileSchema = SchemaFactory.createForClass(ArtistProfile);
