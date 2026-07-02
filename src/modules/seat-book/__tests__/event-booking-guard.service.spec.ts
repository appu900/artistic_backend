import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { EventBookingGuardService } from '../event-booking-guard.service';
import { EventStatus } from 'src/infrastructure/database/schemas/event.schema';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const makeOid = () => new Types.ObjectId();
const oid = (id?: string) => new Types.ObjectId(id);

function makeEvent(overrides: Partial<Record<string, any>> = {}) {
  return {
    _id: makeOid(),
    status: EventStatus.PUBLISHED,
    allowBooking: true,
    openBookingLayoutId: makeOid(),
    bookingStartDate: null,
    bookingEndDate: null,
    availableTickets: 0,  // 0 = unlimited
    maxTicketsPerUser: 0, // 0 = no limit
    soldTickets: 0,
    ...overrides,
  };
}

function makeAggResult(total: number) {
  return total > 0 ? [{ total }] : [];
}

// ---------------------------------------------------------------------------
// Minimal model mocks
// ---------------------------------------------------------------------------
function makeEventModel(event: any) {
  const mock: any = {
    findById: jest.fn().mockResolvedValue(event),
    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
  };
  return mock;
}

function makeSeatBookingModel(total = 0) {
  return {
    aggregate: jest.fn().mockResolvedValue(makeAggResult(total)),
  };
}
function makeTableBookingModel(total = 0) {
  return {
    aggregate: jest.fn().mockResolvedValue(makeAggResult(total)),
  };
}
function makeBoothBookingModel(total = 0) {
  return {
    aggregate: jest.fn().mockResolvedValue(makeAggResult(total)),
  };
}

function buildService(event: any, seatTotal = 0, tableTotal = 0, boothTotal = 0) {
  return new EventBookingGuardService(
    makeEventModel(event) as any,
    makeSeatBookingModel(seatTotal) as any,
    makeTableBookingModel(tableTotal) as any,
    makeBoothBookingModel(boothTotal) as any,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('EventBookingGuardService', () => {
  const VALID_EVENT_ID = makeOid().toHexString();
  const USER_ID = makeOid().toHexString();

  // ─── validateEventForBooking ─────────────────────────────────────────────
  describe('validateEventForBooking', () => {

    it('throws BadRequestException for an invalid ObjectId', async () => {
      const svc = buildService(makeEvent());
      await expect(svc.validateEventForBooking('not-an-id', USER_ID, 1))
        .rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when event does not exist', async () => {
      const svc = new EventBookingGuardService(
        { findById: jest.fn().mockResolvedValue(null), updateOne: jest.fn() } as any,
        makeSeatBookingModel() as any,
        makeTableBookingModel() as any,
        makeBoothBookingModel() as any,
      );
      await expect(svc.validateEventForBooking(VALID_EVENT_ID, USER_ID, 1))
        .rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when event is not PUBLISHED', async () => {
      const svc = buildService(makeEvent({ status: 'draft' }));
      await expect(svc.validateEventForBooking(VALID_EVENT_ID, USER_ID, 1))
        .rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when allowBooking is false', async () => {
      const svc = buildService(makeEvent({ allowBooking: false }));
      await expect(svc.validateEventForBooking(VALID_EVENT_ID, USER_ID, 1))
        .rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when openBookingLayoutId is missing', async () => {
      const svc = buildService(makeEvent({ openBookingLayoutId: null }));
      await expect(svc.validateEventForBooking(VALID_EVENT_ID, USER_ID, 1))
        .rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when booking has not started yet', async () => {
      const future = new Date(Date.now() + 86_400_000).toISOString();
      const svc = buildService(makeEvent({ bookingStartDate: future }));
      await expect(svc.validateEventForBooking(VALID_EVENT_ID, USER_ID, 1))
        .rejects.toThrow('not opened yet');
    });

    it('throws ConflictException when booking period has ended', async () => {
      const past = new Date(Date.now() - 86_400_000).toISOString();
      const svc = buildService(makeEvent({ bookingEndDate: past }));
      await expect(svc.validateEventForBooking(VALID_EVENT_ID, USER_ID, 1))
        .rejects.toThrow('period has ended');
    });

    it('throws BadRequestException when requestedCount < 1', async () => {
      const svc = buildService(makeEvent());
      await expect(svc.validateEventForBooking(VALID_EVENT_ID, USER_ID, 0))
        .rejects.toThrow(BadRequestException);
    });

    // ── availableTickets ────────────────────────────────────────────────────
    it('allows booking when availableTickets === 0 (unlimited event)', async () => {
      const svc = buildService(makeEvent({ availableTickets: 0 }));
      await expect(svc.validateEventForBooking(VALID_EVENT_ID, USER_ID, 100))
        .resolves.toBeDefined();
    });

    it('throws ConflictException when request exceeds availableTickets', async () => {
      const svc = buildService(makeEvent({ availableTickets: 2 }));
      await expect(svc.validateEventForBooking(VALID_EVENT_ID, USER_ID, 3))
        .rejects.toThrow('tickets remaining');
    });

    it('allows booking exactly equal to availableTickets', async () => {
      const svc = buildService(makeEvent({ availableTickets: 5 }));
      await expect(svc.validateEventForBooking(VALID_EVENT_ID, USER_ID, 5))
        .resolves.toBeDefined();
    });

    // ── maxTicketsPerUser ───────────────────────────────────────────────────
    it('allows booking when maxTicketsPerUser === 0 (no per-user limit)', async () => {
      const svc = buildService(makeEvent({ maxTicketsPerUser: 0 }));
      await expect(svc.validateEventForBooking(VALID_EVENT_ID, USER_ID, 50))
        .resolves.toBeDefined();
    });

    it('throws ConflictException when user would exceed maxTicketsPerUser', async () => {
      // User already has 3 tickets, limit is 5, requesting 3 more → total 6 > 5
      const svc = buildService(makeEvent({ maxTicketsPerUser: 5 }), 3);
      await expect(svc.validateEventForBooking(VALID_EVENT_ID, USER_ID, 3))
        .rejects.toThrow('Maximum 5 tickets per user');
    });

    it('allows booking when user is exactly at the limit boundary', async () => {
      // Limit = 5, already has 3, requesting 2 → total exactly 5
      const svc = buildService(makeEvent({ maxTicketsPerUser: 5 }), 3);
      await expect(svc.validateEventForBooking(VALID_EVENT_ID, USER_ID, 2))
        .resolves.toBeDefined();
    });

    it('counts tickets across all three booking types for maxTicketsPerUser', async () => {
      // 2 seats + 2 tables + 1 booth = 5 existing; limit = 6; requesting 2 → 7 > 6
      const svc = buildService(makeEvent({ maxTicketsPerUser: 6 }), 2, 2, 1);
      await expect(svc.validateEventForBooking(VALID_EVENT_ID, USER_ID, 2))
        .rejects.toThrow('Maximum 6 tickets');
    });

    it('returns the event document on success', async () => {
      const event = makeEvent();
      const svc = buildService(event);
      const result = await svc.validateEventForBooking(VALID_EVENT_ID, USER_ID, 1);
      expect(result).toBe(event);
    });
  });

  // ─── incrementSoldTickets ────────────────────────────────────────────────
  describe('incrementSoldTickets', () => {
    let eventModel: any;
    let svc: EventBookingGuardService;

    beforeEach(() => {
      eventModel = {
        findById: jest.fn(),
        updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      };
      svc = new EventBookingGuardService(
        eventModel as any,
        makeSeatBookingModel() as any,
        makeTableBookingModel() as any,
        makeBoothBookingModel() as any,
      );
    });

    it('is a no-op when count <= 0', async () => {
      const eventId = makeOid();
      await svc.incrementSoldTickets(eventId, 0);
      expect(eventModel.updateOne).not.toHaveBeenCalled();
    });

    it('increments soldTickets unconditionally', async () => {
      const eventId = makeOid();
      await svc.incrementSoldTickets(eventId, 3);
      expect(eventModel.updateOne).toHaveBeenCalledWith(
        { _id: eventId },
        { $inc: { soldTickets: 3 } },
      );
    });

    it('decrements availableTickets only when > 0 (limited event)', async () => {
      const eventId = makeOid();
      await svc.incrementSoldTickets(eventId, 2);
      expect(eventModel.updateOne).toHaveBeenCalledWith(
        { _id: eventId, availableTickets: { $gt: 0 } },
        { $inc: { availableTickets: -2 } },
      );
    });

    it('does NOT go negative — unlimited event (availableTickets=0) not matched by $gt 0', async () => {
      // The filter { availableTickets: { $gt: 0 } } won't match 0, so no decrement
      const eventId = makeOid();
      await svc.incrementSoldTickets(eventId, 5);
      const decCall = eventModel.updateOne.mock.calls.find(
        (c: any[]) => c[1]?.$inc?.availableTickets !== undefined
      );
      // The call must include the $gt 0 guard
      expect(decCall[0]).toHaveProperty('availableTickets', { $gt: 0 });
    });

    it('issues exactly two updateOne calls per invocation', async () => {
      await svc.incrementSoldTickets(makeOid(), 1);
      expect(eventModel.updateOne).toHaveBeenCalledTimes(2);
    });
  });
});
