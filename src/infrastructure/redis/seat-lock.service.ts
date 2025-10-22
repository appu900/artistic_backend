import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

export interface SeatLockInfo {
  seatId: string;
  userId: string;
  eventId: string;
  lockedAt: number;
  expiresAt: number;
  lockDuration: number;
}

@Injectable()
export class SeatLockService {
  private readonly logger = new Logger(SeatLockService.name);
  
  constructor(private readonly redisService: RedisService) {}

  // Redis key patterns
  private getSeatLockKey(eventId: string, seatId: string): string {
    return `seat_lock:${eventId}:${seatId}`;
  }

  private getUserLocksKey(eventId: string, userId: string): string {
    return `user_locks:${eventId}:${userId}`;
  }

  private getLockInfoKey(eventId: string, seatId: string): string {
    return `lock_info:${eventId}:${seatId}`;
  }

  /**
   * Attempt to lock multiple seats atomically for a user
   * Uses Redis transactions to ensure atomicity
   */
  async lockSeats(
    eventId: string, 
    seatIds: string[], 
    userId: string, 
    lockDurationMinutes: number = 10
  ): Promise<{
    success: boolean;
    lockedSeats: string[];
    failedSeats: string[];
    alreadyHeldByUser: string[];
    lockDuration: number;
  }> {
    const lockDurationMs = lockDurationMinutes * 60 * 1000;
    const expiresAt = Date.now() + lockDurationMs;
    const lockedSeats: string[] = [];
    const failedSeats: string[] = [];
    const alreadyHeldByUser: string[] = [];

    try {
      // Use Redis pipeline for better performance
      const pipeline = this.redisService.getClient().pipeline();
      
      // First, check existing locks
      const existingLocks = await Promise.all(
        seatIds.map(async (seatId) => {
          const lockKey = this.getSeatLockKey(eventId, seatId);
          const existingUserId = await this.redisService.get(lockKey);
          return { seatId, existingUserId };
        })
      );

      // Separate seats by their current lock status
      const availableSeats: string[] = [];
      
      for (const { seatId, existingUserId } of existingLocks) {
        if (!existingUserId) {
          availableSeats.push(seatId);
        } else if (existingUserId === userId) {
          alreadyHeldByUser.push(seatId);
        } else {
          failedSeats.push(seatId);
        }
      }

      // Attempt to lock available seats using SET NX (atomic operation)
      for (const seatId of availableSeats) {
        const lockKey = this.getSeatLockKey(eventId, seatId);
        const infoKey = this.getLockInfoKey(eventId, seatId);
        
        // Use SET with NX (only if not exists) and EX (expiration)
        pipeline.set(lockKey, userId, 'PX', lockDurationMs, 'NX');
        
        // Store detailed lock information
        const lockInfo: SeatLockInfo = {
          seatId,
          userId,
          eventId,
          lockedAt: Date.now(),
          expiresAt,
          lockDuration: lockDurationMs
        };
        
        pipeline.setex(infoKey, lockDurationMinutes * 60, JSON.stringify(lockInfo));
      }

      // Add seats to user's lock set (for easy cleanup)
      if (availableSeats.length > 0) {
        const userLocksKey = this.getUserLocksKey(eventId, userId);
        pipeline.sadd(userLocksKey, ...availableSeats);
        pipeline.expire(userLocksKey, lockDurationMinutes * 60 + 60); // Extra 60s buffer
      }

      // Execute all operations atomically
      const results = await pipeline.exec();
      
      // Check which SET operations succeeded (returned 'OK')
      let resultIndex = 0;
      for (const seatId of availableSeats) {
        const setResult = results?.[resultIndex * 2]?.[1]; // Every second result is SET command
        if (setResult === 'OK') {
          lockedSeats.push(seatId);
        } else {
          failedSeats.push(seatId);
        }
        resultIndex++;
      }

      // Add already held seats to locked seats (user already owns them)
      lockedSeats.push(...alreadyHeldByUser);

      const success = failedSeats.length === 0;

      if (!success) {
        this.logger.warn(
          `Partial seat lock failure for user ${userId} in event ${eventId}. ` +
          `Locked: ${lockedSeats.length}, Failed: ${failedSeats.length}`
        );
      }

      return {
        success,
        lockedSeats,
        failedSeats,
        alreadyHeldByUser,
        lockDuration: lockDurationMs
      };

    } catch (error) {
      this.logger.error('Failed to lock seats', error);
      return {
        success: false,
        lockedSeats: [],
        failedSeats: seatIds,
        alreadyHeldByUser: [],
        lockDuration: lockDurationMs
      };
    }
  }

  /**
   * Release specific seat locks for a user
   */
  async releaseSeats(
    eventId: string, 
    seatIds: string[], 
    userId: string
  ): Promise<{ success: boolean; releasedCount: number }> {
    try {
      const pipeline = this.redisService.getClient().pipeline();
      let releasedCount = 0;

      for (const seatId of seatIds) {
        const lockKey = this.getSeatLockKey(eventId, seatId);
        const infoKey = this.getLockInfoKey(eventId, seatId);
        
        // Use Lua script to ensure atomic check-and-delete
        const script = `
          if redis.call("GET", KEYS[1]) == ARGV[1] then
            redis.call("DEL", KEYS[1])
            redis.call("DEL", KEYS[2])
            return 1
          else
            return 0
          end
        `;
        
        pipeline.eval(script, 2, lockKey, infoKey, userId);
      }

      // Remove from user's lock set
      const userLocksKey = this.getUserLocksKey(eventId, userId);
      pipeline.srem(userLocksKey, ...seatIds);

      const results = await pipeline.exec();
      
      // Count successful releases (first N results are from eval scripts)
      for (let i = 0; i < seatIds.length; i++) {
        if (results?.[i]?.[1] === 1) {
          releasedCount++;
        }
      }

      return { success: true, releasedCount };

    } catch (error) {
      this.logger.error('Failed to release seat locks', error);
      return { success: false, releasedCount: 0 };
    }
  }

  /**
   * Release all locks held by a user for an event
   */
  async releaseAllUserLocks(
    eventId: string, 
    userId: string
  ): Promise<{ success: boolean; releasedCount: number }> {
    try {
      const userLocksKey = this.getUserLocksKey(eventId, userId);
      const seatIds = await this.redisService.getClient().smembers(userLocksKey);
      
      if (seatIds.length === 0) {
        return { success: true, releasedCount: 0 };
      }

      return this.releaseSeats(eventId, seatIds, userId);

    } catch (error) {
      this.logger.error('Failed to release all user locks', error);
      return { success: false, releasedCount: 0 };
    }
  }

  /**
   * Check if seats are currently locked and by whom
   */
  async checkSeatLocks(
    eventId: string, 
    seatIds: string[]
  ): Promise<Array<{
    seatId: string;
    isLocked: boolean;
    lockedBy?: string;
    lockInfo?: SeatLockInfo;
  }>> {
    try {
      const results = await Promise.all(
        seatIds.map(async (seatId) => {
          const lockKey = this.getSeatLockKey(eventId, seatId);
          const infoKey = this.getLockInfoKey(eventId, seatId);
          
          const [lockedBy, lockInfoStr] = await Promise.all([
            this.redisService.get(lockKey),
            this.redisService.get(infoKey)
          ]);

          let lockInfo: SeatLockInfo | undefined;
          if (lockInfoStr) {
            try {
              lockInfo = JSON.parse(lockInfoStr);
            } catch (e) {
              this.logger.warn(`Invalid lock info JSON for seat ${seatId}: ${lockInfoStr}`);
            }
          }

          return {
            seatId,
            isLocked: !!lockedBy,
            lockedBy: lockedBy || undefined,
            lockInfo
          };
        })
      );

      return results;

    } catch (error) {
      this.logger.error('Failed to check seat locks', error);
      return seatIds.map(seatId => ({ seatId, isLocked: false }));
    }
  }

  /**
   * Extend lock duration for seats held by a user
   */
  async extendLocks(
    eventId: string, 
    seatIds: string[], 
    userId: string, 
    additionalMinutes: number = 5
  ): Promise<{ success: boolean; extendedCount: number }> {
    try {
      const pipeline = this.redisService.getClient().pipeline();
      const additionalMs = additionalMinutes * 60 * 1000;
      let extendedCount = 0;

      for (const seatId of seatIds) {
        const lockKey = this.getSeatLockKey(eventId, seatId);
        const infoKey = this.getLockInfoKey(eventId, seatId);
        
        // Lua script to atomically check ownership and extend
        const script = `
          if redis.call("GET", KEYS[1]) == ARGV[1] then
            local ttl = redis.call("TTL", KEYS[1])
            if ttl > 0 then
              redis.call("EXPIRE", KEYS[1], ttl + ARGV[2])
              redis.call("EXPIRE", KEYS[2], ttl + ARGV[2])
              return 1
            end
          end
          return 0
        `;
        
        pipeline.eval(script, 2, lockKey, infoKey, userId, additionalMinutes * 60);
      }

      const results = await pipeline.exec();
      
      for (let i = 0; i < seatIds.length; i++) {
        if (results?.[i]?.[1] === 1) {
          extendedCount++;
        }
      }

      return { success: true, extendedCount };

    } catch (error) {
      this.logger.error('Failed to extend locks', error);
      return { success: false, extendedCount: 0 };
    }
  }

  /**
   * Clean up expired locks (maintenance function)
   */
  async cleanupExpiredLocks(eventId: string): Promise<{ cleanedCount: number }> {
    try {
      // Redis TTL should handle most cleanup automatically
      // This is a backup cleanup for any orphaned lock info keys
      const pattern = `lock_info:${eventId}:*`;
      const keys = await this.redisService.getClient().keys(pattern);
      
      let cleanedCount = 0;
      const pipeline = this.redisService.getClient().pipeline();
      
      for (const key of keys) {
        const lockInfoStr = await this.redisService.get(key);
        if (lockInfoStr) {
          try {
            const lockInfo: SeatLockInfo = JSON.parse(lockInfoStr);
            if (lockInfo.expiresAt < Date.now()) {
              pipeline.del(key);
              cleanedCount++;
            }
          } catch (e) {
            // Invalid JSON, delete it
            pipeline.del(key);
            cleanedCount++;
          }
        }
      }

      if (cleanedCount > 0) {
        await pipeline.exec();
        this.logger.log(`Cleaned up ${cleanedCount} expired lock info keys for event ${eventId}`);
      }

      return { cleanedCount };

    } catch (error) {
      this.logger.error('Failed to cleanup expired locks', error);
      return { cleanedCount: 0 };
    }
  }

  /**
   * Get lock statistics for an event
   */
  async getLockStats(eventId: string): Promise<{
    totalLocks: number;
    locksByUser: Record<string, number>;
  }> {
    try {
      const pattern = `seat_lock:${eventId}:*`;
      const keys = await this.redisService.getClient().keys(pattern);
      
      const locksByUser: Record<string, number> = {};
      
      if (keys.length > 0) {
        const userIds = await this.redisService.getClient().mget(keys);
        
        userIds.forEach(userId => {
          if (userId) {
            locksByUser[userId] = (locksByUser[userId] || 0) + 1;
          }
        });
      }

      return {
        totalLocks: keys.length,
        locksByUser
      };

    } catch (error) {
      this.logger.error('Failed to get lock stats', error);
      return { totalLocks: 0, locksByUser: {} };
    }
  }
}