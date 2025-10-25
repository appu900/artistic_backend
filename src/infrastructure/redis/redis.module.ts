import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { RedisService } from './redis.service';
import { SeatLockingService } from './seat-lock.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: async (config: ConfigService) => {
        return new Redis({
          host: config.get<string>('REDIS_HOST'),
          port: config.get<number>('REDIS_PORT'),
          username: config.get<string>('REDIS_USERNAME'),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
          db: config.get<number>('REDIS_DB') || 0,
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
          lazyConnect: false,
        });
      },
      inject: [ConfigService],
    },
    RedisService,
    SeatLockingService,
  ],
  exports: ['REDIS_CLIENT', RedisService, SeatLockingService],
})
export class RedisModule {}
