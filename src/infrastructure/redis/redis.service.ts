import { Injectable, Inject, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async set(key: string, value: any, ttlSeconds?: number) {
    const val = typeof value === 'object' ? JSON.stringify(value) : value;
    if (ttlSeconds) await this.redis.set(key, val, 'EX', ttlSeconds);
    else await this.redis.set(key, val);
  }

  async get<T = string>(key: string): Promise<T | null> {
    const data = await this.redis.get(key);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch {
      return data as T;
    }
  }

  async del(key: string) {
    await this.redis.del(key);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.redis.exists(key)) === 1;
  }

  async flush() {
    await this.redis.flushall();
  }
}
