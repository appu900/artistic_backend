import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import { S3Service } from './s3.service';

@Global()
@Module({
  imports:[ConfigModule],  
  providers: [
    {
      provide: 'S3_CLIENT',
      useFactory: (config: ConfigService) => {
        const accessKeyId = config.get<string>('AWS_ACCESS_KEY_ID');
        const secretAccessKey = config.get<string>('AWS_SECRET_ACCESS_KEY');
        const region = config.get<string>('AWS_REGION');

        if (!accessKeyId || !secretAccessKey || !region) {
          throw new Error('Missing AWS configuration values');
        }

        return new S3Client({
          region,
          credentials: {
            accessKeyId,
            secretAccessKey,
          },
        });
      },
      inject: [ConfigService],
    },
    S3Service,
  ],
  exports: [S3Service,'S3_CLIENT'],
})
export class S3Module {}
