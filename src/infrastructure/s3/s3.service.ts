import { Injectable, Inject, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
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

  async deleteFile(fileUrl: string): Promise<void> {
    try {
      // Extract the key from the S3 URL
      const urlParts = fileUrl.split('/');
      const key = urlParts.slice(3).join('/'); // Remove the domain part

      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );

      this.logger.log(`Deleted file: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to delete file from S3: ${error.message}`);
      throw error;
    }
  }
}
