import { Injectable, Inject, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async set(key: string, value: any, ttlSeconds?: number) {
    const val = typeof value === 'object' ? JSON.stringify(value) : value;
    if (ttlSeconds) {
      // Use SETEX for atomic operation (faster than SET + EX)
      await this.redis.setex(key, ttlSeconds, val);
    } else {
      await this.redis.set(key, val);
    }
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

  // Get Redis client for advanced operations like pipelines, transactions, etc.
  getClient(): Redis {
    return this.redis;
  }

  // Safe pattern-based deletion using SCAN (non-blocking)
  async deleteByPattern(pattern: string): Promise<number> {
    let cursor = '0';
    let deletedCount = 0;
    
    do {
      // SCAN is non-blocking and safe for production
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100 // Process 100 keys at a time
      );
      
      cursor = nextCursor;
      
      if (keys.length > 0) {
        await this.redis.del(...keys);
        deletedCount += keys.length;
      }
    } while (cursor !== '0');
    
    return deletedCount;
  }
}
