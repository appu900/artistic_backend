import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { RedisService } from './redis.service';
import {
  MULTI_SEAT_HOLD_SCRIPT,
  RELEASE_LOCKS_SCRIPT,
} from './lua-scripts/seat-booking.scripts';
import { BOOKING_HOLD_TTL_SECONDS } from 'src/modules/seat-book/booking.constants';

/**
 * Atomic Redis inventory locks using Lua scripts.
 * Prevents TOCTOU race conditions when multiple users book the same seats.
 */
@Injectable()
export class InventoryLockService {
  private readonly logger = new Logger(InventoryLockService.name);

  constructor(private readonly redisService: RedisService) {}

  /**
   * Atomically acquire locks on all keys. All-or-nothing.
   * @returns true if all locks acquired
   */
  async acquireLocks(
    lockKeys: string[],
    userId: string,
    ttlSeconds: number = BOOKING_HOLD_TTL_SECONDS,
  ): Promise<boolean> {
    if (lockKeys.length === 0) return true;

    const result = await this.redisService.evalScript<number>(
      MULTI_SEAT_HOLD_SCRIPT,
      lockKeys,
      [userId, String(ttlSeconds), String(Date.now())],
    );

    if (result === -1) {
      throw new ConflictException('Invalid lock parameters');
    }
    if (result === 0) {
      this.logger.debug(`Lock contention on keys: ${lockKeys.join(', ')}`);
      return false;
    }
    return true;
  }

  /** Release locks owned by userId. */
  async releaseLocks(lockKeys: string[], userId: string): Promise<void> {
    if (lockKeys.length === 0) return;
    await this.redisService.evalScript<number>(
      RELEASE_LOCKS_SCRIPT,
      lockKeys,
      [userId, String(Date.now())],
    );
  }

  /** Unconditional delete — used during cleanup after confirm/cancel. */
  async forceRelease(lockKeys: string[]): Promise<void> {
    if (lockKeys.length === 0) return;
    await Promise.all(lockKeys.map((k) => this.redisService.del(k)));
  }
}
