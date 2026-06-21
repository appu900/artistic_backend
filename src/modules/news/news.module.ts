import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NewsController } from './news.controller';
import { NewsService } from './news.service';
import {
  NewsPost,
  NewsPostSchema,
  User,
  UserSchema,
} from '../../infrastructure/database/schemas';
import { S3Module } from '../../infrastructure/s3/s3.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: NewsPost.name, schema: NewsPostSchema },
      { name: User.name, schema: UserSchema },
    ]),
    S3Module,
  ],
  controllers: [NewsController],
  providers: [NewsService],
  exports: [NewsService],
})
export class NewsModule {}
