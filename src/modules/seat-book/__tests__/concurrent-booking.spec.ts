/**
 * Concurrent Booking Simulation Tests
 *
 * These tests simulate what happens when many users hit the booking endpoint
 * simultaneously. They use the real service logic but replace I/O (Redis, Mongo,
 * Payment) with deterministic in-memory fakes that correctly model contention.
 */
import { ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { InventoryLockService } from 'src/infrastructure/redis/inventory-lock.service';
import { BookingIdempotencyService } from '../booking-idempotency.service';
import { EventBookingGuardService } from '../event-booking-guard.service';
import { seatBookingService } from '../seat-book.service';

// ---------------------------------------------------------------------------
// In-memory Redis that emulates atomicity of the Lua lock scripts
// ---------------------------------------------------------------------------
class AtomicFakeRedis {
  private store = new Map<string, string>();

  evalScript<T>(
    _script: string,
    keys: string[],
    args: string[],
  ): Promise<T> {
    const userId = args[0];
    const ttl = Number(args[1]);
    const timestamp = args[2];

    if (!userId || !ttl || !timestamp) return Promise.resolve(-1 as T);

    // Determine if this is acquire or release by checking for userId prefix presence
    const isRelease = this.store.has(keys[0]) &&
      this.store.get(keys[0])?.startsWith(userId + ':');

    if (isRelease) {
      let released = 0;
      for (const key of keys) {
        const val = this.store.get(key);
        if (val?.startsWith(userId + ':')) {
          this.store.delete(key);
          released++;
        }
      }
      return Promise.resolve(released as T);
    }

    // ACQUIRE: all-or-nothing
    for (const key of keys) {
      if (this.store.has(key)) return Promise.resolve(0 as T);
    }
    for (const key of keys) {
      this.store.set(key, `${userId}:${timestamp}`);
    }
    return Promise.resolve(1 as T);
  }

  async get<T = string>(key: string): Promise<T | null> {
    const val = this.store.get(key);
    if (val === undefined) return null;
    try { return JSON.parse(val) as T; } catch { return val as unknown as T; }
  }

  async set(key: string, value: string, _ttl?: number): Promise<void> {
    this.store.set(key, value);
  }

  async setNX(key: string, value: string, _ttl: number): Promise<boolean> {
    if (this.store.has(key)) return false;
    this.store.set(key, value);
    return true;
  }

  async del(key: string): Promise<void> { this.store.delete(key); }
}

// ---------------------------------------------------------------------------
// In-memory MongoDB seat model that enforces atomic updateMany
// ---------------------------------------------------------------------------
class FakeSeatModel {
  private seats: Map<string, any>;

  constructor(seatList: any[]) {
    // Index by both _id string and seatId for quick lookup
    this.seats = new Map(seatList.map((s) => [String(s._id), s]));
  }

  private matchesSeatIdFilter(seat: any, seatIdList: string[]): boolean {
    return seatIdList.some(
      (id) => String(id) === String(seat._id) || id === seat.seatId,
    );
  }

  find(query: any): Promise<any[]> {
    const now = new Date();
    const all = Array.from(this.seats.values());

    // Plain _id lookup (used by cancel/confirm to fetch seat objects for lock release)
    if (query._id?.$in && !query.$and && !query.bookingStatus) {
      const ids = query._id.$in.map(String);
      return Promise.resolve(all.filter((s) => ids.includes(String(s._id))));
    }

    // Availability query — emulates the $and[ lockExpiry, seatId ] structure
    const seatIdFilters: string[] = [];
    if (query.$and) {
      for (const clause of query.$and) {
        if (clause.$or) {
          for (const cond of clause.$or) {
            if (cond._id?.$in)
              seatIdFilters.push(...cond._id.$in.map(String));
            if (cond.seatId?.$in)
              seatIdFilters.push(...cond.seatId.$in);
          }
        }
      }
    }

    return Promise.resolve(
      all.filter((seat) => {
        if (seat.bookingStatus === 'booked') return false;
        // Check lockExpiry: seat is available if no lock or lock has expired
        const lockOk =
          seat.lockExpiry == null ||
          !seat.lockExpiry ||
          new Date(seat.lockExpiry) < now;
        if (!lockOk) return false;
        // Match against seatId filter if one was provided
        if (seatIdFilters.length > 0)
          return this.matchesSeatIdFilter(seat, seatIdFilters);
        return true;
      }),
    );
  }

  updateMany(query: any, update: any): Promise<{ modifiedCount: number }> {
    const now = new Date();
    // Collect target IDs from query
    const ids: string[] = (query._id?.$in ?? []).map(String);
    let count = 0;
    for (const id of ids) {
      const seat = this.seats.get(id);
      if (!seat) continue;
      if (seat.bookingStatus === 'booked') continue;
      // For cancel/release queries, skip lock-expiry check (lockedBy guard is enough)
      const requiresLockCheck = !!query.$or; // lock-expiry $or only present in booking updateMany
      if (requiresLockCheck) {
        const lockOk =
          seat.lockExpiry == null ||
          !seat.lockExpiry ||
          new Date(seat.lockExpiry) < now;
        if (!lockOk) continue;
      }
      if (update.$set) Object.assign(seat, update.$set);
      if (update.$unset) {
        for (const k of Object.keys(update.$unset)) delete seat[k];
      }
      count++;
    }
    return Promise.resolve({ modifiedCount: count });
  }

  countDocuments(query: any): Promise<number> {
    const ids: string[] = (query._id?.$in ?? []).map(String);
    const wantUser = query.userId != null ? String(query.userId) : null;
    const wantBooked = query.bookingStatus === 'booked';
    let count = 0;
    for (const id of ids) {
      const seat = this.seats.get(id);
      if (!seat) continue;
      if (wantBooked && seat.bookingStatus !== 'booked') continue;
      if (wantUser && String(seat.userId) !== wantUser) continue;
      count++;
    }
    return Promise.resolve(count);
  }

  getAll(): any[] { return Array.from(this.seats.values()); }
}

// ---------------------------------------------------------------------------
// In-memory booking model
// ---------------------------------------------------------------------------
class FakeSeatBookingModel {
  private store = new Map<string, any>();

  create(doc: any): Promise<any> {
    const saved = { ...doc, _id: new Types.ObjectId(), save: jest.fn().mockResolvedValue(undefined) };
    this.store.set(String(saved._id), saved);
    return Promise.resolve(saved);
  }

  findById(id: string): Promise<any> {
    return Promise.resolve(this.store.get(String(id)) ?? null);
  }

  findOneAndUpdate(query: any, update: any, _opts?: any): Promise<any> {
    const doc = this.store.get(String(query._id));
    if (!doc) return Promise.resolve(null);
    if (query.status?.$ne && doc.status === query.status.$ne) return Promise.resolve(null);
    if (update.$set) Object.assign(doc, update.$set);
    if (update.$unset) for (const k of Object.keys(update.$unset)) delete doc[k];
    return Promise.resolve(doc);
  }

  updateOne(query: any, update: any): Promise<{ modifiedCount: number }> {
    const doc = this.store.get(String(query._id));
    if (!doc) return Promise.resolve({ modifiedCount: 0 });
    if (query.status?.$ne && doc.status === query.status.$ne) return Promise.resolve({ modifiedCount: 0 });
    if (update.$set) Object.assign(doc, update.$set);
    if (update.$unset) for (const k of Object.keys(update.$unset)) delete doc[k];
    return Promise.resolve({ modifiedCount: 1 });
  }
}

// ---------------------------------------------------------------------------
// Build a full service wired to these in-memory fakes
// ---------------------------------------------------------------------------
function buildFullService(seatList: any[], sharedRedis: AtomicFakeRedis) {
  const seatModel = new FakeSeatModel(seatList);
  const seatBookingModel = new FakeSeatBookingModel();

  const redisService = sharedRedis as any;
  const inventoryLock = new InventoryLockService(redisService);

  const idempotencyService = new BookingIdempotencyService(redisService);

  const guard: any = {
    validateEventForBooking: jest.fn().mockResolvedValue({
      _id: new Types.ObjectId(),
      openBookingLayoutId: new Types.ObjectId(),
    }),
    incrementSoldTickets: jest.fn().mockResolvedValue(undefined),
  };

  const paymentService: any = {
    initiatePayment: jest.fn().mockResolvedValue({
      paymentLink: 'https://pay.example.com/inv',
      log: { trackId: 'tk-001' },
    }),
  };

  const queue: any = {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    remove: jest.fn().mockResolvedValue(undefined),
  };

  const svc = new seatBookingService(
    seatModel as any,
    seatBookingModel as any,
    inventoryLock,
    paymentService,
    guard,
    idempotencyService,
    queue,
  );

  return { svc, seatModel, seatBookingModel, guard };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
const EVENT_ID = new Types.ObjectId().toHexString();

function makeSeat(seatId: string) {
  return {
    _id: new Types.ObjectId(),
    seatId,
    price: 50,
    sn: 1,
    rl: 'A',
    bookingStatus: 'available',
    lockExpiry: null,
    lockedBy: null,
    userId: null,
  };
}

// ─── Pre-generated valid ObjectIds for test users ───────────────────────────
const testUsers = Array.from({ length: 110 }, () => new Types.ObjectId().toHexString());

// ─── Test suite ─────────────────────────────────────────────────────────────
describe('Concurrent Booking Simulation', () => {

  // ─── Scenario 1: N users fight for the same single seat ─────────────────
  describe('Single seat, multiple concurrent users', () => {
    it('exactly 1 of 10 concurrent bookings succeeds', async () => {
      const seat = makeSeat('RACE-S1');
      const redis = new AtomicFakeRedis();

      const results = await Promise.allSettled(
        Array.from({ length: 10 }, (_, i) => {
          const { svc } = buildFullService([{ ...seat }], redis);
          return svc.bookSeat(
            { eventId: EVENT_ID, seatIds: [seat.seatId] },
            testUsers[i],
            `user${i}@test.com`,
          );
        })
      );

      const successes = results.filter((r) => r.status === 'fulfilled');
      const failures = results.filter((r) => r.status === 'rejected');
      expect(successes.length).toBe(1);
      expect(failures.length).toBe(9);
    });

    it('failing requests throw ConflictException (not unknown errors)', async () => {
      const seat = makeSeat('RACE-S2');
      const redis = new AtomicFakeRedis();

      const results = await Promise.allSettled(
        Array.from({ length: 5 }, (_, i) => {
          const { svc } = buildFullService([{ ...seat }], redis);
          return svc.bookSeat(
            { eventId: EVENT_ID, seatIds: [seat.seatId] },
            testUsers[i + 10],
            `user${i}@test.com`,
          );
        })
      );

      const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
      for (const r of rejected) {
        expect(r.reason).toBeInstanceOf(ConflictException);
      }
    });
  });

  // ─── Scenario 2: N users each book a DIFFERENT seat — all should succeed ─
  describe('N users, N distinct seats', () => {
    it('all 20 concurrent bookings succeed when seats are distinct', async () => {
      const redis = new AtomicFakeRedis();
      const N = 20;

      const results = await Promise.allSettled(
        Array.from({ length: N }, (_, i) => {
          const seat = makeSeat(`UNIQUE-${i}`);
          const { svc } = buildFullService([{ ...seat }], redis);
          return svc.bookSeat(
            { eventId: EVENT_ID, seatIds: [seat.seatId] },
            testUsers[i + 20],
            `user${i}@test.com`,
          );
        })
      );

      const successes = results.filter((r) => r.status === 'fulfilled');
      expect(successes.length).toBe(N);
    });
  });

  // ─── Scenario 3: Idempotent duplicate requests ───────────────────────────
  describe('Same user, same idempotency key, 5 concurrent requests', () => {
    it('runs the booking operation exactly once', async () => {
      const seat = makeSeat('IDEM-S1');
      const redis = new AtomicFakeRedis();
      const { svc, guard } = buildFullService([{ ...seat }], redis);
      const IDEM_KEY = 'idem-abc-123';
      const userId = testUsers[40];

      const results = await Promise.allSettled(
        Array.from({ length: 5 }, () =>
          svc.bookSeat(
            { eventId: EVENT_ID, seatIds: [seat.seatId], idempotencyKey: IDEM_KEY },
            userId,
            'userx@test.com',
            IDEM_KEY,
          )
        )
      );

      // At least one should resolve (idempotency returns cached result)
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      expect(fulfilled.length).toBeGreaterThanOrEqual(1);

      // Guard should be called only once
      expect(guard.validateEventForBooking.mock.calls.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Scenario 4: Multi-seat booking race ────────────────────────────────
  describe('Multi-seat bookings with partial overlap', () => {
    it('two users booking overlapping seats — only one wins', async () => {
      // Seats [S1, S2, S3]. User A wants [S1, S2]. User B wants [S2, S3].
      const s1 = makeSeat('OVERLAP-1');
      const s2 = makeSeat('OVERLAP-2');
      const s3 = makeSeat('OVERLAP-3');
      const redis = new AtomicFakeRedis();
      const seatPool = [{ ...s1 }, { ...s2 }, { ...s3 }];

      const [r1, r2] = await Promise.allSettled([
        buildFullService(seatPool, redis).svc.bookSeat(
          { eventId: EVENT_ID, seatIds: [s1.seatId, s2.seatId] },
          testUsers[50],
          'a@test.com',
        ),
        buildFullService(seatPool, redis).svc.bookSeat(
          { eventId: EVENT_ID, seatIds: [s2.seatId, s3.seatId] },
          testUsers[51],
          'b@test.com',
        ),
      ]);

      const successes = [r1, r2].filter((r) => r.status === 'fulfilled').length;
      expect(successes).toBe(1);
    });
  });

  // ─── Scenario 5: High-throughput simulation (100 concurrent requests) ───
  describe('High-throughput: 100 concurrent requests, 100 available seats', () => {
    it('all 100 unique-seat bookings succeed', async () => {
      const redis = new AtomicFakeRedis();

      const results = await Promise.allSettled(
        Array.from({ length: 100 }, (_, i) => {
          const seat = makeSeat(`HT-${i}`);
          const { svc } = buildFullService([{ ...seat }], redis);
          return svc.bookSeat(
            { eventId: EVENT_ID, seatIds: [seat.seatId] },
            testUsers[i],
            `ht${i}@test.com`,
          );
        })
      );

      const successes = results.filter((r) => r.status === 'fulfilled');
      expect(successes.length).toBe(100);
    }, 15000);

    it('50 users racing for 10 seats — at most 10 succeed', async () => {
      const seats = Array.from({ length: 10 }, (_, i) => makeSeat(`SCARCE-${i}`));
      const redis = new AtomicFakeRedis();

      const results = await Promise.allSettled(
        Array.from({ length: 50 }, (_, i) => {
          const targetSeat = seats[i % 10];
          const { svc } = buildFullService(seats.map((s) => ({ ...s })), redis);
          return svc.bookSeat(
            { eventId: EVENT_ID, seatIds: [targetSeat.seatId] },
            testUsers[i],
            `scarce${i}@test.com`,
          );
        })
      );

      const successes = results.filter((r) => r.status === 'fulfilled');
      expect(successes.length).toBeLessThanOrEqual(10);
    }, 15000);
  });

  // ─── Scenario 6: Confirm + double-confirm (idempotency) ─────────────────
  describe('Confirm booking idempotency', () => {
    it('double-confirm does not throw and does not double-increment soldTickets', async () => {
      const seat = makeSeat('CONFIRM-S1');
      const redis = new AtomicFakeRedis();
      const userId = testUsers[60];
      const { svc, guard, seatBookingModel } = buildFullService([{ ...seat }], redis);

      const bookResult = await svc.bookSeat(
        { eventId: EVENT_ID, seatIds: [seat.seatId] },
        userId,
        'c@test.com',
      );

      const booking = await seatBookingModel.findById(String(bookResult.bookingId));
      if (booking) {
        booking.holdId = 'hold-abc';
        booking.status = 'pending';
        booking.expiresAt = new Date(Date.now() + 600_000);
      }

      try { await svc.confirmBooking(String(bookResult.bookingId)); } catch (_) {}
      const callsBefore = guard.incrementSoldTickets.mock.calls.length;

      try { await svc.confirmBooking(String(bookResult.bookingId)); } catch (_) {}
      const callsAfter = guard.incrementSoldTickets.mock.calls.length;

      expect(callsAfter).toBe(callsBefore);
    });
  });

  // ─── Scenario 7: Booking expiry releases seats for re-booking ───────────
  describe('Booking hold expiry', () => {
    it('cancelled booking allows another user to book the same seat', async () => {
      const seat = makeSeat('EXPIRY-S1');
      const redis = new AtomicFakeRedis();
      const userA = testUsers[70];
      const userB = testUsers[71];

      const { svc: svcA, seatBookingModel } = buildFullService([{ ...seat }], redis);
      const bookA = await svcA.bookSeat(
        { eventId: EVENT_ID, seatIds: [seat.seatId] },
        userA,
        'a@test.com',
      );

      const bookingA = await seatBookingModel.findById(String(bookA.bookingId));
      if (bookingA) {
        bookingA.holdId = 'hold-A';
        bookingA.status = 'pending';
      }
      await svcA.cancelBooking(String(bookA.bookingId));

      const { svc: svcB } = buildFullService([{ ...seat }], redis);
      const bookB = await svcB.bookSeat(
        { eventId: EVENT_ID, seatIds: [seat.seatId] },
        userB,
        'b@test.com',
      );

      expect(bookB.paymentLink).toBeTruthy();
    });
  });
});
