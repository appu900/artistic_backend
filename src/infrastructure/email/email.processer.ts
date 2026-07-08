import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';


@Injectable()
export class EmailProcessor implements OnModuleInit, OnModuleDestroy {
  private worker: Worker | null = null;
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  onModuleInit() {
    const redisConfig = {
      host: this.configService.get<string>('REDIS_HOST', '127.0.0.1'),
      port: Number(this.configService.get<number>('REDIS_PORT', 6379)),
      username: this.configService.get<string>('REDIS_USERNAME') || undefined,
      password: this.configService.get<string>('REDIS_PASSWORD') || undefined,
      tls: {},
    };

    this.worker = new Worker(
      'email-queue', 
      async (job: Job) => {
        try {
          const { template, to, subject, context } = job.data;
          this.logger.log(`📨 Processing job ${job.id}: sending ${template} → ${to}`);
          await this.emailService.sendMail(template,to,subject,context)
          this.logger.log(`Job ${job.id} completed`);
        } catch (err) {
          this.logger.error(`Job ${job.id} failed: ${err.message}`);
          throw err; 
        }
      },
      {
        connection: redisConfig,
        concurrency: 5, 
        autorun: true,
      },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.id} failed after attempts: ${err.message}`);
    });

    this.worker.on('completed', (job) => {
      this.logger.debug(`Job ${job.id} completed successfully`);
    });

    this.logger.log('🚀 EmailProcessor Worker initialized and listening for jobs');
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
      this.logger.log('🧹 EmailProcessor Worker shut down cleanly');
    }
  }
}
