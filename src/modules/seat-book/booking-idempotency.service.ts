import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { RedisService } from 'src/infrastructure/redis/redis.service';
import {
  BOOKING_IDEMPOTENCY_TTL_SECONDS,
} from './booking.constants';

const PROCESSING_MARKER = '__PROCESSING__';
const PROCESSING_TTL_SECONDS = 120;

@Injectable()
export class BookingIdempotencyService {
  private readonly logger = new Logger(BookingIdempotencyService.name);

  constructor(private readonly redisService: RedisService) {}

  private key(userId: string, idempotencyKey: string): string {
    return `booking:idempotency:${userId}:${idempotencyKey}`;
  }

  async execute<T>(
    userId: string,
    idempotencyKey: string | undefined,
    operation: () => Promise<T>,
  ): Promise<T> {
    if (!idempotencyKey?.trim()) {
      return operation();
    }

    const redisKey = this.key(userId, idempotencyKey.trim());

    const cached = await this.redisService.get<T | string>(redisKey);
    if (cached !== null) {
      if (cached === PROCESSING_MARKER) {
        const result = await this.waitForResult<T>(redisKey);
        if (result !== null) return result;
        throw new ConflictException(
          'A booking with this idempotency key is already in progress. Please wait.',
        );
      }
      this.logger.log(`Returning cached idempotent response for key ${idempotencyKey}`);
      return cached as T;
    }

    const acquired = await this.redisService.setNX(
      redisKey,
      PROCESSING_MARKER,
      PROCESSING_TTL_SECONDS,
    );
    if (!acquired) {
      const result = await this.waitForResult<T>(redisKey);
      if (result !== null) return result;
      throw new ConflictException(
        'A booking with this idempotency key is already in progress. Please wait.',
      );
    }

    try {
      const result = await operation();
      await this.redisService.set(
        redisKey,
        JSON.stringify(result),
        BOOKING_IDEMPOTENCY_TTL_SECONDS,
      );
      return result;
    } catch (error) {
      await this.redisService.del(redisKey);
      throw error;
    }
  }

  private async waitForResult<T>(redisKey: string, maxAttempts = 20): Promise<T | null> {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 300));
      const val = await this.redisService.get<T | string>(redisKey);
      if (val === null) return null;
      if (val !== PROCESSING_MARKER) return val as T;
    }
    return null;
  }
}
