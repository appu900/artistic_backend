import { ConflictException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { seatBookingService } from '../seat-book.service';

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------
const oid = () => new Types.ObjectId();

function makeSeat(overrides: Partial<Record<string, any>> = {}) {
  return {
    _id: oid(),
    seatId: `A${Math.floor(Math.random() * 1000)}`,
    price: 100,
    sn: 1,
    bookingStatus: 'available',
    lockExpiry: null,
    lockedBy: null,
    ...overrides,
  };
}

function makeBooking(overrides: Partial<Record<string, any>> = {}) {
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  return {
    _id: oid(),
    userId: oid(),
    eventId: oid(),
    seatIds: [oid()],
    holdId: 'hold-abc',
    status: 'pending',
    paymentStatus: 'pending',
    expiresAt,
    bookedAt: new Date(),
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock factories for dependencies
// ---------------------------------------------------------------------------
function makeInventoryLock({
  acquireResult = true,
}: { acquireResult?: boolean } = {}) {
  return {
    acquireLocks: jest.fn().mockResolvedValue(acquireResult),
    releaseLocks: jest.fn().mockResolvedValue(undefined),
    forceRelease: jest.fn().mockResolvedValue(undefined),
  };
}

function makePaymentService() {
  return {
    initiatePayment: jest.fn().mockResolvedValue({
      paymentLink: 'https://pay.example.com/invoice/123',
      log: { trackId: 'track-001' },
    }),
  };
}

function makeEventGuard(event: any = null) {
  const defaultEvent = {
    _id: oid(),
    openBookingLayoutId: oid(),
    availableTickets: 0,
    maxTicketsPerUser: 0,
  };
  return {
    validateEventForBooking: jest.fn().mockResolvedValue(event ?? defaultEvent),
    incrementSoldTickets: jest.fn().mockResolvedValue(undefined),
  };
}

function makeIdempotencyService() {
  return {
    // Just run the operation — bypass caching for most tests
    execute: jest.fn().mockImplementation((_u: any, _k: any, op: any) => op()),
  };
}

function makeExpiryQueue() {
  return {
    add: jest.fn().mockResolvedValue({ id: 'job-001' }),
    remove: jest.fn().mockResolvedValue(undefined),
  };
}

// Build a properly mocked seatBookingService
function buildService({
  seats = [] as any[],
  updateManyCount = seats.length,
  acquireLocks = true,
  paymentFails = false,
  booking: bookingOverride = null as any,
} = {}) {
  const booking = bookingOverride ?? makeBooking({ seatIds: seats.map((s) => s._id) });

  const seatModel = {
    find: jest.fn().mockResolvedValue(seats),
    findById: jest.fn().mockResolvedValue(null),
    updateMany: jest.fn().mockResolvedValue({ modifiedCount: updateManyCount }),
    // Default: all of the booking's seats are owned+booked (happy confirm path).
    countDocuments: jest.fn().mockResolvedValue(booking.seatIds.length),
  };

  const seatBookingModel = {
    create: jest.fn().mockResolvedValue(booking),
    findById: jest.fn().mockResolvedValue(booking),
    // Winning the pending→confirmed transition returns the doc.
    findOneAndUpdate: jest.fn().mockResolvedValue(booking),
    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
  };

  const inventoryLock = makeInventoryLock({ acquireResult: acquireLocks });
  const payment = makePaymentService();
  if (paymentFails) {
    payment.initiatePayment = jest.fn().mockRejectedValue(new Error('Payment gateway down'));
  }
  const guard = makeEventGuard();
  const idempotency = makeIdempotencyService();
  const queue = makeExpiryQueue();

  const svc = new seatBookingService(
    seatModel as any,
    seatBookingModel as any,
    inventoryLock as any,
    payment as any,
    guard as any,
    idempotency as any,
    queue as any,
  );

  return { svc, seatModel, seatBookingModel, inventoryLock, payment, guard, idempotency, queue, booking };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('seatBookingService', () => {
  const USER_ID = oid().toHexString();
  const USER_EMAIL = 'user@example.com';
  const EVENT_ID = oid().toHexString();

  // ─── bookSeat — happy path ───────────────────────────────────────────────
  describe('bookSeat / executeBookSeat', () => {
    it('returns paymentLink, bookingId and expiresAt on success', async () => {
      const seats = [makeSeat(), makeSeat()];
      const { svc } = buildService({ seats });

      const result = await svc.bookSeat(
        { eventId: EVENT_ID, seatIds: seats.map((s) => s.seatId) },
        USER_ID,
        USER_EMAIL,
      );

      expect(result).toMatchObject({
        paymentLink: expect.any(String),
        bookingId: expect.anything(),
        expiresAt: expect.any(String),
        bookingType: 'ticket',
      });
    });

    it('validates the event before locking seats', async () => {
      const seats = [makeSeat()];
      const { svc, guard } = buildService({ seats });

      await svc.bookSeat({ eventId: EVENT_ID, seatIds: [seats[0].seatId] }, USER_ID, USER_EMAIL);

      expect(guard.validateEventForBooking).toHaveBeenCalledWith(EVENT_ID, USER_ID, 1);
    });

    it('acquires Redis locks before the MongoDB query', async () => {
      const seats = [makeSeat()];
      const { svc, inventoryLock, seatModel } = buildService({ seats });
      const callOrder: string[] = [];
      inventoryLock.acquireLocks.mockImplementation(async (...args: any[]) => {
        callOrder.push('lock');
        return true;
      });
      seatModel.find.mockImplementation(async () => {
        callOrder.push('mongo');
        return seats;
      });

      await svc.bookSeat({ eventId: EVENT_ID, seatIds: [seats[0].seatId] }, USER_ID, USER_EMAIL);

      expect(callOrder.indexOf('lock')).toBeLessThan(callOrder.indexOf('mongo'));
    });

    it('enqueues an expiry job with the correct delay and type', async () => {
      const seats = [makeSeat()];
      const { svc, queue } = buildService({ seats });

      await svc.bookSeat({ eventId: EVENT_ID, seatIds: [seats[0].seatId] }, USER_ID, USER_EMAIL);

      expect(queue.add).toHaveBeenCalledWith(
        'expire-booking',
        expect.objectContaining({ type: 'seat' }),
        expect.objectContaining({ jobId: expect.stringContaining('expire-booking_') }),
      );
    });

    it('enqueues expiry job with BOOKING_HOLD_MS delay', async () => {
      const seats = [makeSeat()];
      const { svc, queue } = buildService({ seats });
      await svc.bookSeat({ eventId: EVENT_ID, seatIds: [seats[0].seatId] }, USER_ID, USER_EMAIL);
      const callArgs = queue.add.mock.calls[0][2];
      // BOOKING_HOLD_MS = 420 * 1000 = 420000
      expect(callArgs.delay).toBe(420 * 1000);
    });

    // ── Conflict / error scenarios ──────────────────────────────────────────
    it('throws ConflictException when Redis lock fails (seats taken by another user)', async () => {
      const seats = [makeSeat()];
      const { svc } = buildService({ seats, acquireLocks: false });

      await expect(
        svc.bookSeat({ eventId: EVENT_ID, seatIds: [seats[0].seatId] }, USER_ID, USER_EMAIL),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when seats are not found in MongoDB (already booked)', async () => {
      const seats = [makeSeat()];
      const { svc } = buildService({ seats: [] }); // find returns empty

      await expect(
        svc.bookSeat({ eventId: EVENT_ID, seatIds: [seats[0].seatId] }, USER_ID, USER_EMAIL),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when updateMany modifiedCount mismatches (race condition)', async () => {
      const seats = [makeSeat(), makeSeat()];
      const { svc } = buildService({ seats, updateManyCount: 1 }); // race: only 1 of 2 updated

      await expect(
        svc.bookSeat({ eventId: EVENT_ID, seatIds: seats.map((s) => s.seatId) }, USER_ID, USER_EMAIL),
      ).rejects.toThrow(ConflictException);
    });

    it('releases Redis locks when booking fails', async () => {
      const seats = [makeSeat()];
      const { svc, inventoryLock } = buildService({ seats, paymentFails: true });

      await expect(
        svc.bookSeat({ eventId: EVENT_ID, seatIds: [seats[0].seatId] }, USER_ID, USER_EMAIL),
      ).rejects.toThrow();

      expect(inventoryLock.releaseLocks).toHaveBeenCalled();
    });

    it('calculates totalAmount by summing seat prices', async () => {
      const seats = [
        makeSeat({ price: 50 }),
        makeSeat({ price: 75 }),
        makeSeat({ price: 100 }),
      ];
      const { svc, seatBookingModel } = buildService({ seats });

      await svc.bookSeat({ eventId: EVENT_ID, seatIds: seats.map((s) => s.seatId) }, USER_ID, USER_EMAIL);

      expect(seatBookingModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ totalAmount: 225 }),
      );
    });
  });

  describe('confirmBooking', () => {
    it('books seats before finalizing the booking record', async () => {
      const booking = makeBooking();
      const { svc, seatModel, seatBookingModel } = buildService({ booking });
      const callOrder: string[] = [];

      seatModel.updateMany.mockImplementation(async () => {
        callOrder.push('seatUpdate');
        return { modifiedCount: booking.seatIds.length };
      });
      seatModel.countDocuments.mockResolvedValue(booking.seatIds.length);
      seatModel.find.mockResolvedValue([makeSeat()]);
      seatBookingModel.findOneAndUpdate.mockImplementation(async () => {
        callOrder.push('finalize');
        return booking;
      });

      await svc.confirmBooking(String(booking._id));

      expect(callOrder.indexOf('seatUpdate')).toBeLessThan(callOrder.indexOf('finalize'));
    });

    it('is idempotent — silently returns when booking is already confirmed', async () => {
      const booking = makeBooking({ status: 'confirmed' });
      const { svc } = buildService({ booking });
      await expect(svc.confirmBooking(String(booking._id))).resolves.not.toThrow();
    });

    it('re-secures seats and confirms for a late payment (booking still pending, hold expired)', async () => {
      const booking = makeBooking({
        status: 'pending',
        seatIds: [oid()],
        expiresAt: new Date(Date.now() - 1000), // hold lapsed
      });
      const { svc, guard, seatModel } = buildService({ booking });
      
      seatModel.countDocuments
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(booking.seatIds.length);
      seatModel.find.mockResolvedValue([makeSeat()]);

      await expect(svc.confirmBooking(String(booking._id))).resolves.not.toThrow();
      expect(guard.incrementSoldTickets).toHaveBeenCalledWith(booking.eventId, 1);
    });

    it('confirms a previously-cancelled booking when the captured payment can re-secure seats', async () => {
      const booking = makeBooking({ status: 'cancelled', seatIds: [oid()] });
      const { svc, seatBookingModel, seatModel } = buildService({ booking });
      seatModel.countDocuments.mockResolvedValue(booking.seatIds.length);
      seatModel.find.mockResolvedValue([makeSeat()]);

      await expect(svc.confirmBooking(String(booking._id))).resolves.not.toThrow();
      expect(seatBookingModel.findOneAndUpdate).toHaveBeenCalled();
    });

    it('throws NotFoundException when booking does not exist', async () => {
      const { svc, seatBookingModel } = buildService({});
      seatBookingModel.findById.mockResolvedValue(null);
      await expect(svc.confirmBooking('nonexistent-id')).rejects.toThrow(NotFoundException);
    });

    it('flags needsRefund (no throw) when seats cannot be secured after payment', async () => {
      const booking = makeBooking({ seatIds: [oid(), oid()] });
      const { svc, seatBookingModel, seatModel, guard } = buildService({ booking });
      // Never reaches expected count; nothing re-securable (all taken by others).
      seatModel.countDocuments.mockResolvedValue(0);
      seatModel.find.mockResolvedValue([]); // no re-securable seats
      seatModel.updateMany.mockResolvedValue({ modifiedCount: 0 });

      await expect(svc.confirmBooking(String(booking._id))).resolves.not.toThrow();
      expect(guard.incrementSoldTickets).not.toHaveBeenCalled();
      expect(seatBookingModel.updateOne).toHaveBeenCalledWith(
        expect.objectContaining({ _id: booking._id }),
        expect.objectContaining({
          $set: expect.objectContaining({ needsRefund: true }),
        }),
      );
    });

    it('increments soldTickets exactly once on successful confirmation', async () => {
      const booking = makeBooking({ seatIds: [oid(), oid()] });
      const { svc, guard, seatModel } = buildService({ booking });
      seatModel.countDocuments.mockResolvedValue(2);
      seatModel.find.mockResolvedValue([makeSeat(), makeSeat()]);

      await svc.confirmBooking(String(booking._id));

      expect(guard.incrementSoldTickets).toHaveBeenCalledTimes(1);
      expect(guard.incrementSoldTickets).toHaveBeenCalledWith(booking.eventId, 2);
    });

    it('does NOT increment soldTickets when it did not win the confirm transition (retry)', async () => {
      const booking = makeBooking({ seatIds: [oid()] });
      const { svc, guard, seatModel, seatBookingModel } = buildService({ booking });
      seatModel.countDocuments.mockResolvedValue(1);
      seatModel.find.mockResolvedValue([makeSeat()]);
      // Another worker already flipped to confirmed → findOneAndUpdate returns null.
      seatBookingModel.findOneAndUpdate.mockResolvedValue(null);

      await svc.confirmBooking(String(booking._id));

      expect(guard.incrementSoldTickets).not.toHaveBeenCalled();
    });

    it('removes the expiry job from the queue on confirmation', async () => {
      const booking = makeBooking({ seatIds: [oid()] });
      const { svc, queue, seatModel } = buildService({ booking });
      seatModel.countDocuments.mockResolvedValue(1);
      seatModel.find.mockResolvedValue([makeSeat()]);

      await svc.confirmBooking(String(booking._id));

      expect(queue.remove).toHaveBeenCalledWith(`expire-booking_${booking._id}`);
    });

    it('force-releases Redis locks after confirmation', async () => {
      const booking = makeBooking({ seatIds: [oid()] });
      const seat = makeSeat();
      const { svc, inventoryLock, seatModel } = buildService({ booking });
      seatModel.countDocuments.mockResolvedValue(1);
      seatModel.find.mockResolvedValue([seat]);

      await svc.confirmBooking(String(booking._id));

      expect(inventoryLock.forceRelease).toHaveBeenCalled();
    });
  });

  // ─── cancelBooking ───────────────────────────────────────────────────────
  describe('cancelBooking', () => {
    it('sets status to cancelled and releases seats', async () => {
      const booking = makeBooking({ status: 'pending' });
      const seat = makeSeat();
      const { svc, seatModel } = buildService({ booking });
      seatModel.find.mockResolvedValue([seat]);

      await svc.cancelBooking(String(booking._id));

      expect(booking.save).toHaveBeenCalled();
      expect(seatModel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ bookingStatus: { $ne: 'booked' } }),
        expect.objectContaining({ $set: { bookingStatus: 'available' } }),
      );
    });

    it('is idempotent — returns early when already cancelled', async () => {
      const booking = makeBooking({ status: 'cancelled' });
      const { svc } = buildService({ booking });
      const result = await svc.cancelBooking(String(booking._id));
      expect(booking.save).not.toHaveBeenCalled();
      expect(result).toBeTruthy();
    });

    it('is idempotent — returns early when already expired', async () => {
      const booking = makeBooking({ status: 'expired' });
      const { svc } = buildService({ booking });
      await svc.cancelBooking(String(booking._id));
      expect(booking.save).not.toHaveBeenCalled();
    });

    it('throws ConflictException when trying to cancel a confirmed booking', async () => {
      const booking = makeBooking({ status: 'confirmed' });
      const { svc } = buildService({ booking });
      await expect(svc.cancelBooking(String(booking._id))).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException when booking does not exist', async () => {
      const { svc, seatBookingModel } = buildService({});
      seatBookingModel.findById.mockResolvedValue(null);
      await expect(svc.cancelBooking('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('releases Redis locks on cancel', async () => {
      const booking = makeBooking({ status: 'pending' });
      const { svc, inventoryLock, seatModel } = buildService({ booking });
      seatModel.find.mockResolvedValue([makeSeat()]);

      await svc.cancelBooking(String(booking._id));

      expect(inventoryLock.forceRelease).toHaveBeenCalled();
    });
  });

  // ─── idempotency delegation ──────────────────────────────────────────────
  describe('idempotency key forwarding', () => {
    it('passes the idempotency key to the idempotency service', async () => {
      const seats = [makeSeat()];
      const { svc, idempotency } = buildService({ seats });

      await svc.bookSeat(
        { eventId: EVENT_ID, seatIds: [seats[0].seatId] },
        USER_ID,
        USER_EMAIL,
        'my-idem-key',
      );

      expect(idempotency.execute).toHaveBeenCalledWith(
        USER_ID,
        'my-idem-key',
        expect.any(Function),
      );
    });

    it('passes undefined when no idempotency key is given', async () => {
      const seats = [makeSeat()];
      const { svc, idempotency } = buildService({ seats });

      await svc.bookSeat(
        { eventId: EVENT_ID, seatIds: [seats[0].seatId] },
        USER_ID,
        USER_EMAIL,
      );

      expect(idempotency.execute).toHaveBeenCalledWith(
        USER_ID,
        undefined,
        expect.any(Function),
      );
    });
  });
});
