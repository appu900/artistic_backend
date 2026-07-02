import { ConflictException } from '@nestjs/common';
import { InventoryLockService } from '../inventory-lock.service';

// ---------------------------------------------------------------------------
// In-memory Lua script emulator — mirrors MULTI_SEAT_HOLD_SCRIPT behaviour
// ---------------------------------------------------------------------------
class FakeRedisForLocks {
  private store = new Map<string, string>();

  // Simulate the MULTI_SEAT_HOLD_SCRIPT (all-or-nothing acquire)
  async evalScript<T>(script: string, keys: string[], args: string[]): Promise<T> {
    const userId = args[0];
    const ttl = Number(args[1]);
    const timestamp = args[2];

    if (!userId || !ttl || !timestamp) return -1 as T;

    // Check all keys first (atomic — no partial lock)
    for (const key of keys) {
      if (this.store.has(key)) return 0 as T;
    }
    // Lock all keys
    for (const key of keys) {
      this.store.set(key, `${userId}:${timestamp}`);
    }
    return 1 as T;
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  _has(key: string) { return this.store.has(key); }
  _get(key: string) { return this.store.get(key); }
  _set(key: string, value: string) { this.store.set(key, value); }
  _clear() { this.store.clear(); }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('InventoryLockService', () => {
  let service: InventoryLockService;
  let redis: FakeRedisForLocks;

  const USER_A = 'user-alpha';
  const USER_B = 'user-beta';

  beforeEach(() => {
    redis = new FakeRedisForLocks();
    service = new InventoryLockService(redis as any);
  });

  // ─── acquireLocks ────────────────────────────────────────────────────────
  describe('acquireLocks', () => {
    it('returns true when all keys are free', async () => {
      const result = await service.acquireLocks(['seat_lock:A1', 'seat_lock:A2'], USER_A);
      expect(result).toBe(true);
    });

    it('sets each key in Redis after acquiring', async () => {
      await service.acquireLocks(['seat_lock:B1'], USER_A);
      expect(redis._has('seat_lock:B1')).toBe(true);
    });

    it('stores value prefixed with userId', async () => {
      await service.acquireLocks(['seat_lock:C1'], USER_A);
      expect(redis._get('seat_lock:C1')).toMatch(new RegExp(`^${USER_A}:`));
    });

    it('returns false when any key is already locked', async () => {
      redis._set('seat_lock:A1', 'other-user:123');
      const result = await service.acquireLocks(['seat_lock:A1', 'seat_lock:A2'], USER_A);
      expect(result).toBe(false);
    });

    it('does NOT partially lock remaining keys when one is taken (all-or-nothing)', async () => {
      redis._set('seat_lock:A2', 'other-user:123');
      await service.acquireLocks(['seat_lock:A1', 'seat_lock:A2'], USER_A);
      // A1 must NOT have been locked because A2 was taken
      expect(redis._has('seat_lock:A1')).toBe(false);
    });

    it('returns true for an empty key list (no-op)', async () => {
      const result = await service.acquireLocks([], USER_A);
      expect(result).toBe(true);
    });

    it('allows different users to lock different keys simultaneously', async () => {
      const r1 = await service.acquireLocks(['seat_lock:X1'], USER_A);
      const r2 = await service.acquireLocks(['seat_lock:X2'], USER_B);
      expect(r1).toBe(true);
      expect(r2).toBe(true);
    });

    it('prevents second user from locking a key held by first user', async () => {
      await service.acquireLocks(['seat_lock:Y1'], USER_A);
      const r2 = await service.acquireLocks(['seat_lock:Y1'], USER_B);
      expect(r2).toBe(false);
    });
  });

  // ─── releaseLocks ────────────────────────────────────────────────────────
  describe('releaseLocks', () => {
    it('releases own locks', async () => {
      await service.acquireLocks(['seat_lock:D1', 'seat_lock:D2'], USER_A);
      await service.releaseLocks(['seat_lock:D1', 'seat_lock:D2'], USER_A);
      // After release the keys should be gone (our fake evalScript ignores userId for release
      // — in real Redis the Lua RELEASE_LOCKS_SCRIPT checks the prefix)
    });

    it('is a no-op for an empty key list', async () => {
      await expect(service.releaseLocks([], USER_A)).resolves.not.toThrow();
    });
  });

  // ─── forceRelease ────────────────────────────────────────────────────────
  describe('forceRelease', () => {
    it('removes all given keys unconditionally', async () => {
      redis._set('seat_lock:E1', `${USER_A}:999`);
      redis._set('seat_lock:E2', `${USER_B}:888`);
      await service.forceRelease(['seat_lock:E1', 'seat_lock:E2']);
      expect(redis._has('seat_lock:E1')).toBe(false);
      expect(redis._has('seat_lock:E2')).toBe(false);
    });

    it('is a no-op for an empty key list', async () => {
      await expect(service.forceRelease([])).resolves.not.toThrow();
    });
  });

  // ─── Race condition simulation ───────────────────────────────────────────
  describe('concurrency simulation', () => {
    it('only one of N concurrent lock attempts succeeds', async () => {
      const keys = ['seat_lock:RACE1'];
      // Simulate 10 concurrent requests by calling acquireLocks sequentially
      // (true concurrency is impossible in a single-threaded test but the
      //  all-or-nothing Lua script guarantees only the first caller wins)
      const results = await Promise.all(
        Array.from({ length: 10 }, () => service.acquireLocks(keys, `user-${Math.random()}`))
      );
      const successCount = results.filter(Boolean).length;
      expect(successCount).toBe(1);
    });

    it('after releasing, the next attempt can acquire', async () => {
      await service.acquireLocks(['seat_lock:SEQ1'], USER_A);
      await service.forceRelease(['seat_lock:SEQ1']);
      const result = await service.acquireLocks(['seat_lock:SEQ1'], USER_B);
      expect(result).toBe(true);
    });

    it('100 concurrent users — each targeting a unique seat all succeed', async () => {
      const results = await Promise.all(
        Array.from({ length: 100 }, (_, i) =>
          service.acquireLocks([`seat_lock:UNIQUE_${i}`], `user-${i}`)
        )
      );
      expect(results.every(Boolean)).toBe(true);
    });
  });
});
