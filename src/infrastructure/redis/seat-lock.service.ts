import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import Redlock, { Lock } from 'redlock';
import { RedisService } from './redis.service';

interface SeatLockInfo {
  seatId: string;
  userId: string;
  lockedAt: Date;
  expiresAt: Date;
}

@Injectable()
export class SeatLockingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SeatLockingService.name);
  private redlock: Redlock;
  private readonly SEAT_LOCK_PREFIX = 'seat:lock';
  private readonly SEAT_DATA_PREFIX = 'seat:data';
  private readonly DEFAULT_LOCK_TTL = 300000;
  private activeLocks: Map<string, Lock> = new Map();

  constructor(private readonly redisService: RedisService) {}

  async onModuleInit() {
    const redisClient = await this.redisService.getClient();
    this.redlock = new Redlock([redisClient], {
      driftFactor: 0.01,
      retryCount: 3,
      retryDelay: 200,
      retryJitter: 100,
    });
    this.setupRedlockHandlers();
    this.logger.log('SeatLockingService initialized with Redlock');
  }
  async onModuleDestroy() {
    this.logger.log('Cleaning the seat locks shutdown....');
    const lockPromises = Array.from(this.activeLocks.entries()).map(
      async ([seatId, lock]) => {
        try {
          await lock.release();
          const dataKey = `${this.SEAT_DATA_PREFIX}${seatId}`;
          await this.redisService.del(dataKey);
          this.logger.log(`Released lock for seat ${seatId}`);
        } catch (error) {
          this.logger.error(
            `Failed to release lock for seat ${seatId}:`,
            error,
          );
        }
      },
    );

    await Promise.allSettled(lockPromises);
    this.activeLocks.clear();
    this.logger.log('all lock cleared');
  }

  private setupRedlockHandlers() {
    this.redlock.on('error', (error) => {
      this.logger.error('Reddlock error', error);
    });

    this.redlock.on('clientError', (error) => {
      this.logger.error('Redlock client error:', error);
    });
  }

  async lockSeat(
    seatId: string,
    userId: string,
    ttlMs: number = this.DEFAULT_LOCK_TTL,
  ): Promise<Lock> {
    const lockKey = `${this.SEAT_LOCK_PREFIX}${seatId}`;
    const dataKey = `${this.SEAT_DATA_PREFIX}${seatId}`;

    try {
      const existingLock = await this.redisService.get<SeatLockInfo>(dataKey);
      if (existingLock && existingLock.userId !== userId) {
        // if metadata exists but expired, allow new lock
        if (new Date(existingLock.expiresAt) > new Date()) {
          throw new ConflictException(
            `Seat ${seatId} is already locked by user ${existingLock.userId}`,
          );
        }
        // else: metadata is stale, continue to acquire lock
      }

      const lock = await this.redlock.acquire([lockKey], ttlMs);
      this.activeLocks.set(seatId, lock);

      const lockInfo: SeatLockInfo = {
        seatId,
        userId,
        lockedAt: new Date(),
        expiresAt: new Date(Date.now() + ttlMs),
      };

      await this.redisService.set(dataKey, lockInfo, Math.floor(ttlMs / 1000));

      this.logger.log(`Seat ${seatId} locked by user ${userId} for ${ttlMs}ms`);
      return lock;
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      this.logger.error(`Failed to lock seat ${seatId}:`, error);
      throw new ConflictException(
        `Unable to lock seat ${seatId}. It may be locked by another user.`,
      );
    }
  }

  async unlockSeat(lock: Lock, seatId: string): Promise<void> {
    const dataKey = `${this.SEAT_DATA_PREFIX}${seatId}`;

    try {
      await lock.release();
      await this.redisService.del(dataKey);

      this.activeLocks.delete(seatId);

      this.logger.log(`Seat ${seatId} unlocked successfully`);
    } catch (error) {
      this.logger.error(`Failed to unlock seat ${seatId}:`, error);
      throw new BadRequestException(
        `Failed to release lock for seat ${seatId}`,
      );
    }
  }

  async getSeatLockInfo(seatId: string): Promise<SeatLockInfo | null> {
    const dataKey = `${this.SEAT_DATA_PREFIX}${seatId}`;
    return await this.redisService.get<SeatLockInfo>(dataKey);
  }

  async isUserLockOwner(seatId: string, userId: string): Promise<boolean> {
    const lockInfo = await this.getSeatLockInfo(seatId);
    return (
      lockInfo?.userId === userId && new Date(lockInfo.expiresAt) > new Date()
    );
  }

  async lockMultipleSeats(
    seatIds: string[],
    userId: string,
    ttlMs: number = this.DEFAULT_LOCK_TTL,
  ): Promise<Lock> {
    if (seatIds.length === 0) {
      throw new BadRequestException('No seats provided to lock');
    }

    const lockKeys = seatIds.map((id) => `${this.SEAT_LOCK_PREFIX}${id}`);

    // Check metadata first for non-stale locks
    for (const seatId of seatIds) {
      const dataKey = `${this.SEAT_DATA_PREFIX}${seatId}`;
      const existingLock = await this.redisService.get<SeatLockInfo>(dataKey);
      if (
        existingLock &&
        new Date(existingLock.expiresAt) > new Date() &&
        existingLock.userId !== userId
      ) {
        throw new ConflictException(
          `Seat ${seatId} is already locked by user ${existingLock.userId}`,
        );
      }
    }

    // Acquire one atomic lock covering all lockKeys
    try {
      const lock = await this.redlock.acquire(lockKeys, ttlMs);

      // Store the same lock object for each seatId (so releasing it frees all keys)
      for (const seatId of seatIds) {
        this.activeLocks.set(seatId, lock);
        const dataKey = `${this.SEAT_DATA_PREFIX}${seatId}`;
        const lockInfo: SeatLockInfo = {
          seatId,
          userId,
          lockedAt: new Date(),
          expiresAt: new Date(Date.now() + ttlMs),
        };
        // set metadata per-seat
        await this.redisService.set(
          dataKey,
          lockInfo,
          Math.floor(ttlMs / 1000),
        );
      }

      this.logger.log(`${seatIds.length} seats locked by user ${userId}`);
      return lock;
    } catch (error) {
      this.logger.error('Failed to lock multiple seats:', error);
      if (error instanceof ConflictException) throw error;
      throw new ConflictException(
        'Unable to lock all seats. Some seats may be locked by other users.',
      );
    }
  }

  async unlockMultipleSeats(lock: Lock, seatIds: string[]): Promise<void> {
    const errors: string[] = [];

    try {
      try {
        await lock.release();
      } catch (e) {
        // lock might be already expired — log and continue to delete metadata
        this.logger.warn(
          'Lock release failed (might be expired):',
          e?.message ?? e,
        );
      }

      // Always clean metadata and activeLocks map
      for (const seatId of seatIds) {
        try {
          const dataKey = `${this.SEAT_DATA_PREFIX}${seatId}`;
          await this.redisService.del(dataKey);
          this.activeLocks.delete(seatId);
        } catch (err) {
          errors.push(`Seat ${seatId}: ${err?.message ?? String(err)}`);
          this.logger.error(
            `Failed to clean metadata for seat ${seatId}:`,
            err,
          );
        }
      }

      if (errors.length > 0) {
        throw new BadRequestException(
          `Failed to unlock some seats: ${errors.join(', ')}`,
        );
      }
      this.logger.log(`${seatIds.length} seats unlocked successfully`);
    } catch (err) {
      // bubble up
      throw err;
    }
  }

  async isSeatLocked(seatId: string): Promise<boolean> {
    const dataKey = `${this.SEAT_DATA_PREFIX}${seatId}`;
    const obj = await this.redisService.get<SeatLockInfo>(dataKey);
    if (!obj) return false;
    // treat expired metadata as unlocked
    return new Date(obj.expiresAt) > new Date();
  }
}
