import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TranslationController } from './translation.controller';
import { TranslationService } from './translation.service';

@Module({
  imports: [ConfigModule],
  controllers: [TranslationController],
  providers: [TranslationService],
  exports: [TranslationService],
})
export class TranslationModule {}