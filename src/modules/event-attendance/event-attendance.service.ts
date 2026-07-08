import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { randomBytes, randomInt } from 'crypto';
import { Event, EventDocument, EventStatus } from 'src/infrastructure/database/schemas/event.schema';
import { formatBookingReference } from 'src/common/utils/booking-reference.util';
import {
  EventAttendancePortal,
  EventAttendancePortalDocument,
} from 'src/infrastructure/database/schemas/event-attendance-portal.schema';
import {
  SeatBooking,
  SeatBookingDocument,
} from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/SeatBooking.schema';
import {
  TableBooking,
  TableBookingDocument,
} from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/booth-and-table/table-book-schema';
import {
  BoothBooking,
  BoothBookingDocument,
} from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/booth-and-table/booth-booking.schema';
import {
  VenueOwnerProfile,
  VenueOwnerProfileDocument,
} from 'src/infrastructure/database/schemas/venue-owner-profile.schema';
import { RedisService } from 'src/infrastructure/redis/redis.service';
import {
  CreateAttendancePortalDto,
  UpdateAttendancePortalDto,
  VerifyAttendancePinDto,
} from './dto/event-attendance.dto';

type BookingKind = 'ticket' | 'table' | 'booth';

interface ParsedQrPayload {
  kind?: string;
  bookingId?: string;
  bookingReference?: string;
  eventId?: string;
  seats?: string[];
  tables?: string[];
  booths?: string[];
}

interface AttendanceSession {
  eventId: string;
  portalToken: string;
  operatorName?: string;
  verifiedAt: string;
}

export interface AttendanceBookingRow {
  bookingId: string;
  bookingType: BookingKind;
  bookingReference: string;
  customerName: string;
  customerEmail: string;
  itemsLabel: string;
  status: string;
  attendanceStatus: string;
  validatedAt?: Date;
  validatedBy?: string;
  totalAmount: number;
}

@Injectable()
export class EventAttendanceService {
  private readonly logger = new Logger(EventAttendanceService.name);
  private readonly sessionTtlSeconds = 60 * 60 * 12; // 12 hours
  private readonly pinAttemptLimit = 10;
  private readonly pinAttemptWindowSeconds = 15 * 60;

  constructor(
    @InjectModel(Event.name) private readonly eventModel: Model<EventDocument>,
    @InjectModel(EventAttendancePortal.name)
    private readonly portalModel: Model<EventAttendancePortalDocument>,
    @InjectModel(SeatBooking.name) private readonly seatBookingModel: Model<SeatBookingDocument>,
    @InjectModel(TableBooking.name) private readonly tableBookingModel: Model<TableBookingDocument>,
    @InjectModel(BoothBooking.name) private readonly boothBookingModel: Model<BoothBookingDocument>,
    @InjectModel(VenueOwnerProfile.name)
    private readonly venueOwnerProfileModel: Model<VenueOwnerProfileDocument>,
    private readonly redisService: RedisService,
  ) {}

  private generatePin(): string {
    return String(randomInt(100000, 999999));
  }

  private generatePortalToken(): string {
    return randomBytes(18).toString('base64url');
  }

  private sessionKey(sessionToken: string) {
    return `attendance_session:${sessionToken}`;
  }

  private publicUrl(portalToken: string): string {
    const base = process.env.FRONTEND_URL || 'https://artistic.global';
    return `${base.replace(/\/$/, '')}/attendance/${portalToken}`;
  }

  private referencePrefix(kind: BookingKind): string {
    switch (kind) {
      case 'ticket':
        return 'TKT';
      case 'table':
        return 'TBL';
      case 'booth':
        return 'BTH';
      default:
        return 'BK';
    }
  }

  private pinAttemptKey(portalToken: string, clientIp: string) {
    return `attendance_pin_attempts:${portalToken}:${clientIp}`;
  }

  private async assertPinAttemptsAllowed(portalToken: string, clientIp: string) {
    const key = this.pinAttemptKey(portalToken, clientIp);
    const attempts = await this.redisService.getClient().get(key);
    const count = attempts ? parseInt(attempts, 10) : 0;
    if (count >= this.pinAttemptLimit) {
      throw new HttpException(
        'Too many PIN attempts. Please wait and try again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async recordFailedPinAttempt(portalToken: string, clientIp: string) {
    const key = this.pinAttemptKey(portalToken, clientIp);
    const client = this.redisService.getClient();
    const count = await client.incr(key);
    if (count === 1) {
      await client.expire(key, this.pinAttemptWindowSeconds);
    }
  }

  private async clearPinAttempts(portalToken: string, clientIp: string) {
    await this.redisService.del(this.pinAttemptKey(portalToken, clientIp));
  }

  private assertEventSupportsAttendance(event: { status?: string }, forPortal = false) {
    if (event.status === EventStatus.CANCELLED) {
      throw new BadRequestException('This event has been cancelled');
    }
    if (event.status === EventStatus.DRAFT) {
      throw new BadRequestException(
        forPortal
          ? 'Publish the event before enabling attendance scanning'
          : 'This event is not open for attendance',
      );
    }
  }

  async assertCanManageEvent(eventId: string, userId: string, role: string): Promise<EventDocument> {
    const event = await this.eventModel.findById(eventId);
    if (!event) throw new NotFoundException('Event not found');

    if (role === 'admin' || role === 'super_admin' || role === 'ADMIN' || role === 'SUPER_ADMIN') return event;

    const createdById = String((event as any).createdBy || '');
    if (createdById && createdById === String(userId)) return event;

    const venueOwnerProfile = await this.venueOwnerProfileModel.findOne({ user: userId }).lean();
    const eventVenueOwnerId = String((event as any).venueOwnerId || '');
    if (
      venueOwnerProfile &&
      eventVenueOwnerId &&
      eventVenueOwnerId === String(venueOwnerProfile._id)
    ) {
      return event;
    }

    throw new ForbiddenException('You do not have permission to manage attendance for this event');
  }

  async createOrRegeneratePortal(
    eventId: string,
    userId: string,
    role: string,
    dto: CreateAttendancePortalDto,
  ) {
    const event = await this.assertCanManageEvent(eventId, userId, role);
    this.assertEventSupportsAttendance(event, true);

    const existing = await this.portalModel.findOne({ eventId: new Types.ObjectId(eventId) });
    const pin = dto.pin || this.generatePin();
    const pinHash = await bcrypt.hash(pin, 10);

    if (existing && !dto.regenerate) {
      throw new ConflictException(
        'An attendance portal already exists for this event. Set regenerate=true to create a new link and PIN.',
      );
    }

    const portalToken = this.generatePortalToken();
    const portal = existing
      ? await this.portalModel.findByIdAndUpdate(
          existing._id,
          {
            portalToken,
            pinHash,
            isActive: true,
            label: dto.label ?? existing.label,
            createdBy: new Types.ObjectId(userId),
          },
          { new: true },
        )
      : await this.portalModel.create({
          eventId: new Types.ObjectId(eventId),
          portalToken,
          pinHash,
          isActive: true,
          label: dto.label,
          createdBy: new Types.ObjectId(userId),
        });

    return {
      portalToken: portal!.portalToken,
      pin,
      publicUrl: this.publicUrl(portal!.portalToken),
      isActive: portal!.isActive,
      label: portal!.label,
      message: 'Share the public link and PIN with door staff. The PIN is shown only once — store it securely.',
    };
  }

  async updatePortal(eventId: string, userId: string, role: string, dto: UpdateAttendancePortalDto) {
    const event = await this.assertCanManageEvent(eventId, userId, role);
    if (dto.isActive === true) {
      this.assertEventSupportsAttendance(event, true);
    }
    const portal = await this.portalModel.findOne({ eventId: new Types.ObjectId(eventId) });
    if (!portal) throw new NotFoundException('Attendance portal not found for this event');

    const updates: Partial<EventAttendancePortal> = {};
    let newPin: string | undefined;

    if (typeof dto.isActive === 'boolean') updates.isActive = dto.isActive;
    if (dto.label !== undefined) updates.label = dto.label;
    if (dto.pin) {
      updates.pinHash = await bcrypt.hash(dto.pin, 10);
      newPin = dto.pin;
    }

    const updated = await this.portalModel.findByIdAndUpdate(portal._id, updates, { new: true });
    return {
      portalToken: updated!.portalToken,
      publicUrl: this.publicUrl(updated!.portalToken),
      isActive: updated!.isActive,
      label: updated!.label,
      ...(newPin ? { pin: newPin } : {}),
    };
  }

  async getPortalForEvent(eventId: string, userId: string, role: string) {
    await this.assertCanManageEvent(eventId, userId, role);
    const portal = await this.portalModel.findOne({ eventId: new Types.ObjectId(eventId) }).lean();
    if (!portal) return null;
    return {
      portalToken: portal.portalToken,
      publicUrl: this.publicUrl(portal.portalToken),
      isActive: portal.isActive,
      label: portal.label,
      createdAt: (portal as any).createdAt,
      updatedAt: (portal as any).updatedAt,
    };
  }

  private async getPortalByToken(portalToken: string) {
    const portal = await this.portalModel.findOne({ portalToken, isActive: true }).lean();
    if (!portal) throw new NotFoundException('Attendance portal not found or inactive');
    return portal;
  }

  async verifyPin(portalToken: string, dto: VerifyAttendancePinDto, clientIp?: string) {
    if (clientIp) {
      await this.assertPinAttemptsAllowed(portalToken, clientIp);
    }

    const portal = await this.getPortalByToken(portalToken);
    const valid = await bcrypt.compare(dto.pin, portal.pinHash);
    if (!valid) {
      if (clientIp) {
        await this.recordFailedPinAttempt(portalToken, clientIp);
      }
      throw new ForbiddenException('Invalid PIN');
    }

    if (clientIp) {
      await this.clearPinAttempts(portalToken, clientIp);
    }

    const event = await this.eventModel.findById(portal.eventId).select('name startDate endDate venue status').lean();
    if (!event) throw new NotFoundException('Event not found');
    this.assertEventSupportsAttendance(event);

    const sessionToken = randomBytes(24).toString('base64url');
    const session: AttendanceSession = {
      eventId: String(portal.eventId),
      portalToken,
      operatorName: dto.operatorName?.trim() || undefined,
      verifiedAt: new Date().toISOString(),
    };
    await this.redisService.set(this.sessionKey(sessionToken), session, this.sessionTtlSeconds);

    const stats = await this.getEventAttendanceStats(String(portal.eventId));

    return {
      sessionToken,
      event: {
        _id: String(event._id),
        name: event.name,
        startDate: event.startDate,
        endDate: event.endDate,
        venue: event.venue,
        status: event.status,
      },
      stats,
    };
  }

  async assertSession(sessionToken: string, portalToken: string): Promise<AttendanceSession> {
    if (!sessionToken) throw new ForbiddenException('Attendance session required');
    const session = await this.redisService.get<AttendanceSession>(this.sessionKey(sessionToken));
    if (!session || session.portalToken !== portalToken) {
      throw new ForbiddenException('Invalid or expired attendance session');
    }
    return session;
  }

  private parseQrPayload(raw: string | Record<string, any>): ParsedQrPayload {
    if (typeof raw === 'object' && raw !== null) return raw as ParsedQrPayload;
    const text = String(raw || '').trim();
    if (!text) throw new BadRequestException('Empty QR payload');
    try {
      return JSON.parse(text) as ParsedQrPayload;
    } catch {
      throw new BadRequestException('QR code is not a valid ticket payload');
    }
  }

  private async findBookingById(bookingId: string) {
    if (!Types.ObjectId.isValid(bookingId)) return null;

    const [seat, table, booth] = await Promise.all([
      this.seatBookingModel.findById(bookingId).populate('userId').lean(),
      this.tableBookingModel.findById(bookingId).populate('userId').lean(),
      this.boothBookingModel.findById(bookingId).populate('userId').lean(),
    ]);

    if (seat) return { kind: 'ticket' as BookingKind, booking: seat };
    if (table) return { kind: 'table' as BookingKind, booking: table };
    if (booth) return { kind: 'booth' as BookingKind, booking: booth };

    return null;
  }

  private itemsLabel(kind: BookingKind, booking: any): string {
    if (kind === 'ticket') {
      const seats: string[] = booking.seatNumber || [];
      return seats.length ? `Seats: ${seats.join(', ')}` : 'Ticket booking';
    }
    if (kind === 'table') {
      const tables: string[] = booking.tableNumbers || [];
      return tables.length ? `Tables: ${tables.join(', ')}` : 'Table booking';
    }
    const booths: string[] = booking.boothNumbers || [];
    return booths.length ? `Booths: ${booths.join(', ')}` : 'Booth booking';
  }

  private customerFromBooking(booking: any) {
    const user = booking.userId as any;
    return {
      name:
        booking.customerDetails?.name ||
        [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() ||
        'Guest',
      email: booking.customerDetails?.email || user?.email || '',
    };
  }

  async scanTicket(portalToken: string, sessionToken: string, rawPayload: string | Record<string, any>) {
    const session = await this.assertSession(sessionToken, portalToken);
    const portal = await this.getPortalByToken(portalToken);

    const event = await this.eventModel.findById(portal.eventId).select('status').lean();
    if (!event) throw new NotFoundException('Event not found');
    this.assertEventSupportsAttendance(event);

    const payload = this.parseQrPayload(rawPayload);

    if (payload.kind !== 'event-ticket') {
      throw new BadRequestException('This QR code is not an event ticket');
    }
    if (!payload.bookingId) {
      throw new BadRequestException('Ticket QR is missing booking ID');
    }
    if (payload.eventId && String(payload.eventId) !== String(portal.eventId)) {
      throw new BadRequestException('This ticket belongs to a different event');
    }

    const found = await this.findBookingById(payload.bookingId);
    if (!found) throw new NotFoundException('Booking not found');

    const { kind, booking } = found;
    if (String(booking.eventId) !== String(portal.eventId)) {
      throw new BadRequestException('This ticket is not valid for this event');
    }
    if (booking.status !== 'confirmed') {
      throw new BadRequestException(`Booking is ${booking.status} — only confirmed tickets can be validated`);
    }

    const customer = this.customerFromBooking(booking);
    const itemsLabel = this.itemsLabel(kind, booking);
    const bookingReference =
      payload.bookingReference ||
      formatBookingReference(String(booking._id), this.referencePrefix(kind));
    const operatorName = session.operatorName || 'Scanner';

    if (booking.attendanceStatus === 'validated') {
      return {
        result: 'already_validated',
        message: 'Ticket already validated',
        booking: {
          bookingId: String(booking._id),
          bookingReference,
          bookingType: kind,
          customerName: customer.name,
          customerEmail: customer.email,
          itemsLabel,
          attendanceStatus: 'validated',
          validatedAt: booking.validatedAt,
          validatedBy: booking.validatedBy,
        },
      };
    }

    const updatePayload = {
      attendanceStatus: 'validated',
      validatedAt: new Date(),
      validatedBy: operatorName,
      validatedViaPortal: portalToken,
    };
    const pendingFilter = {
      _id: booking._id,
      status: 'confirmed',
      $or: [{ attendanceStatus: { $exists: false } }, { attendanceStatus: 'pending' }],
    };

    let updated: any = null;

    if (kind === 'ticket') {
      updated = await this.seatBookingModel.findOneAndUpdate(pendingFilter, { $set: updatePayload }, { new: true });
    } else if (kind === 'table') {
      updated = await this.tableBookingModel.findOneAndUpdate(pendingFilter, { $set: updatePayload }, { new: true });
    } else {
      updated = await this.boothBookingModel.findOneAndUpdate(pendingFilter, { $set: updatePayload }, { new: true });
    }

    if (!updated) {
      let latest: any = null;
      if (kind === 'ticket') latest = await this.seatBookingModel.findById(booking._id).lean();
      else if (kind === 'table') latest = await this.tableBookingModel.findById(booking._id).lean();
      else latest = await this.boothBookingModel.findById(booking._id).lean();

      if (latest?.attendanceStatus === 'validated') {
        return {
          result: 'already_validated',
          message: 'Ticket already validated',
          booking: {
            bookingId: String(latest._id),
            bookingReference,
            bookingType: kind,
            customerName: customer.name,
            customerEmail: customer.email,
            itemsLabel,
            attendanceStatus: 'validated',
            validatedAt: latest.validatedAt,
            validatedBy: latest.validatedBy,
          },
        };
      }
      throw new ConflictException('Could not validate ticket — please try again');
    }

    this.logger.log(`Ticket ${booking._id} validated for event ${portal.eventId} by ${operatorName}`);

    const stats = await this.getEventAttendanceStats(String(portal.eventId));

    return {
      result: 'validated',
      message: 'Ticket validated successfully',
      booking: {
        bookingId: String(updated._id),
        bookingReference,
        bookingType: kind,
        customerName: customer.name,
        customerEmail: customer.email,
        itemsLabel,
        attendanceStatus: 'validated',
        validatedAt: updated.validatedAt,
        validatedBy: updated.validatedBy,
      },
      stats,
    };
  }

  async getEventAttendanceStats(eventId: string) {
    const eventOid = new Types.ObjectId(eventId);
    const confirmedFilter = { eventId: eventOid, status: 'confirmed' };

    const [seatBookings, tableBookings, boothBookings] = await Promise.all([
      this.seatBookingModel.find(confirmedFilter).select('attendanceStatus seatIds seatNumber').lean(),
      this.tableBookingModel.find(confirmedFilter).select('attendanceStatus tableIds tableNumbers').lean(),
      this.boothBookingModel.find(confirmedFilter).select('attendanceStatus boothIds boothNumbers').lean(),
    ]);

    const countUnits = (rows: any[], idField: string) =>
      rows.reduce((sum, row) => sum + ((row[idField] as any[])?.length || 1), 0);

    const countValidatedUnits = (rows: any[], idField: string) =>
      rows.reduce((sum, row) => {
        if (row.attendanceStatus !== 'validated') return sum;
        return sum + ((row[idField] as any[])?.length || 1);
      }, 0);

    const ticketUnits = countUnits(seatBookings, 'seatIds');
    const tableUnits = countUnits(tableBookings, 'tableIds');
    const boothUnits = countUnits(boothBookings, 'boothIds');

    const validatedTicketUnits = countValidatedUnits(seatBookings, 'seatIds');
    const validatedTableUnits = countValidatedUnits(tableBookings, 'tableIds');
    const validatedBoothUnits = countValidatedUnits(boothBookings, 'boothIds');

    const totalBookings = seatBookings.length + tableBookings.length + boothBookings.length;
    const validatedBookings =
      seatBookings.filter((b) => b.attendanceStatus === 'validated').length +
      tableBookings.filter((b) => b.attendanceStatus === 'validated').length +
      boothBookings.filter((b) => b.attendanceStatus === 'validated').length;

    const totalUnits = ticketUnits + tableUnits + boothUnits;
    const validatedUnits = validatedTicketUnits + validatedTableUnits + validatedBoothUnits;

    return {
      totalBookings,
      validatedBookings,
      pendingBookings: totalBookings - validatedBookings,
      totalUnits,
      validatedUnits,
      pendingUnits: totalUnits - validatedUnits,
      occupancyRate: totalUnits > 0 ? Math.round((validatedUnits / totalUnits) * 100) : 0,
      breakdown: {
        tickets: { total: ticketUnits, validated: validatedTicketUnits },
        tables: { total: tableUnits, validated: validatedTableUnits },
        booths: { total: boothUnits, validated: validatedBoothUnits },
      },
    };
  }

  async getEventAttendanceDashboard(eventId: string, userId: string, role: string) {
    const event = await this.assertCanManageEvent(eventId, userId, role);
    const eventOid = new Types.ObjectId(eventId);

    const [portalDoc, stats, bookings] = await Promise.all([
      this.portalModel.findOne({ eventId: eventOid }).lean(),
      this.getEventAttendanceStats(eventId),
      this.listEventBookings(eventId),
    ]);

    const portal = portalDoc
      ? {
          portalToken: portalDoc.portalToken,
          publicUrl: this.publicUrl(portalDoc.portalToken),
          isActive: portalDoc.isActive,
          label: portalDoc.label,
          createdAt: (portalDoc as any).createdAt,
          updatedAt: (portalDoc as any).updatedAt,
        }
      : null;

    return {
      event: {
        _id: String(event._id),
        name: event.name,
        startDate: event.startDate,
        endDate: event.endDate,
        startTime: event.startTime,
        endTime: event.endTime,
        venue: event.venue,
        status: event.status,
        totalCapacity: event.totalCapacity,
        soldTickets: event.soldTickets,
      },
      portal,
      stats,
      bookings,
    };
  }

  async listEventBookings(eventId: string): Promise<AttendanceBookingRow[]> {
    const eventOid = new Types.ObjectId(eventId);
    const filter = { eventId: eventOid, status: 'confirmed' };

    const [seats, tables, booths] = await Promise.all([
      this.seatBookingModel.find(filter).populate('userId').sort({ bookedAt: -1 }).lean(),
      this.tableBookingModel.find(filter).populate('userId').sort({ bookedAt: -1 }).lean(),
      this.boothBookingModel.find(filter).populate('userId').sort({ bookedAt: -1 }).lean(),
    ]);

    const rows: AttendanceBookingRow[] = [];

    for (const booking of seats) {
      const customer = this.customerFromBooking(booking);
      rows.push({
        bookingId: String(booking._id),
        bookingType: 'ticket',
        bookingReference: formatBookingReference(String(booking._id), this.referencePrefix('ticket')),
        customerName: customer.name,
        customerEmail: customer.email,
        itemsLabel: this.itemsLabel('ticket', booking),
        status: booking.status,
        attendanceStatus: booking.attendanceStatus || 'pending',
        validatedAt: booking.validatedAt,
        validatedBy: booking.validatedBy,
        totalAmount: booking.totalAmount || 0,
      });
    }

    for (const booking of tables) {
      const customer = this.customerFromBooking(booking);
      rows.push({
        bookingId: String(booking._id),
        bookingType: 'table',
        bookingReference: formatBookingReference(String(booking._id), this.referencePrefix('table')),
        customerName: customer.name,
        customerEmail: customer.email,
        itemsLabel: this.itemsLabel('table', booking),
        status: booking.status,
        attendanceStatus: booking.attendanceStatus || 'pending',
        validatedAt: booking.validatedAt,
        validatedBy: booking.validatedBy,
        totalAmount: booking.totalAmount || 0,
      });
    }

    for (const booking of booths) {
      const customer = this.customerFromBooking(booking);
      rows.push({
        bookingId: String(booking._id),
        bookingType: 'booth',
        bookingReference: formatBookingReference(String(booking._id), this.referencePrefix('booth')),
        customerName: customer.name,
        customerEmail: customer.email,
        itemsLabel: this.itemsLabel('booth', booking),
        status: booking.status,
        attendanceStatus: booking.attendanceStatus || 'pending',
        validatedAt: booking.validatedAt,
        validatedBy: booking.validatedBy,
        totalAmount: booking.totalAmount || 0,
      });
    }

    return rows.sort((a, b) => {
      if (a.attendanceStatus === b.attendanceStatus) return 0;
      if (a.attendanceStatus === 'pending') return -1;
      if (b.attendanceStatus === 'pending') return 1;
      return 0;
    });
  }

  async getPortalStats(portalToken: string, sessionToken: string) {
    const session = await this.assertSession(sessionToken, portalToken);
    return this.getEventAttendanceStats(session.eventId);
  }
}
