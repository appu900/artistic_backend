import { Injectable, Inject, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

@Injectable()
export class S3Service {
  private readonly bucket: string;
  private readonly logger = new Logger(S3Service.name);

  constructor(
    @Inject('S3_CLIENT') private readonly s3Client: S3Client,
    private readonly configService: ConfigService,
  ) {
    this.bucket = this.configService.get<string>('AWS_S3_BUCKET') ?? 'default-bucket-name';
  }

  async uploadFile(file: Express.Multer.File, folder: string): Promise<string> {
    const fileExt = file.originalname.split('.').pop();
    const key = `${folder}/${randomUUID()}.${fileExt}`;

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    this.logger.log(`Uploaded file: ${key}`);
    return `https://${this.bucket}.s3.${this.configService.get('AWS_REGION')}.amazonaws.com/${key}`;
  }
}
