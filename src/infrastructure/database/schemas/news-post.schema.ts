import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type NewsPostDocument = NewsPost & Document;

export enum PostStatus {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  PUBLISHED = 'PUBLISHED',
  REJECTED = 'REJECTED',
}

export enum PostType {
  ANNOUNCEMENT = 'ANNOUNCEMENT',
  NEWS = 'NEWS',
  FEATURE_UPDATE = 'FEATURE_UPDATE',
  BLOG = 'BLOG',
}

export enum PostAuthorRole {
  ADMIN = 'ADMIN',
  ARTIST = 'ARTIST',
}

@Schema({ timestamps: true })
export class NewsPost {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true })
  content: string;

  @Prop({ required: false })
  excerpt: string;

  @Prop({ required: false })
  coverImage: string;

  @Prop({
    type: String,
    enum: Object.values(PostType),
    default: PostType.NEWS,
  })
  type: PostType;

  @Prop({
    type: String,
    enum: Object.values(PostStatus),
    default: PostStatus.PENDING_APPROVAL,
  })
  status: PostStatus;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  author: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(PostAuthorRole),
    required: true,
  })
  authorRole: PostAuthorRole;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  reviewedBy: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  rejectionReason: string | null;

  @Prop({ type: Date, default: null })
  publishedAt: Date | null;
}

export const NewsPostSchema = SchemaFactory.createForClass(NewsPost);

NewsPostSchema.index({ status: 1, type: 1 });
NewsPostSchema.index({ author: 1, status: 1 });
NewsPostSchema.index({ publishedAt: -1 });
