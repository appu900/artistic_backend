

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailService } from './email.service'; 
import { BullMqModule } from '../redis/queue/bullmq.module';
import { EmailController } from './emai.controller';
import { EmailProcessor } from './email.processer';

@Module({
  imports: [ConfigModule, BullMqModule],
  providers: [EmailService, EmailProcessor],
  controllers: [EmailController],
  exports: [EmailService],
})
export class EmailModule {}
