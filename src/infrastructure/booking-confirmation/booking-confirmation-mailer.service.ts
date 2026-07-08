import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EmailService } from '../email/email.service';
import { TicketService, TicketLineItem } from '../ticket/ticket.service';
import { PaymentlogsService } from 'src/modules/paymentlogs/paymentlogs.service';
import { BookingType } from 'src/modules/booking/interfaces/bookingType';
import { formatBookingReference } from 'src/common/utils/booking-reference.util';
import { ArtistBooking, ArtistBookingDocument } from 'src/infrastructure/database/schemas/artist-booking.schema';
import { EquipmentBooking, EquipmentBookingDocument } from 'src/infrastructure/database/schemas/Equipment-booking.schema';
import { EquipmentPackageBooking, EquipmentPackageBookingDocument } from 'src/infrastructure/database/schemas/equipment-package-booking.schema';
import { CombineBooking, CombineBookingDocument } from 'src/infrastructure/database/schemas/Booking.schema';
import { SeatBooking, SeatBookingDocument } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/SeatBooking.schema';
import { TableBooking, TableBookingDocument } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/booth-and-table/table-book-schema';
import { BoothBooking, BoothBookingDocument } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/booth-and-table/booth-booking.schema';

interface NormalizedBookingData {
  recipients: string[];
  customerName: string;
  bookingTypeLabel: string;
  eventOrServiceName: string;
  venueName?: string;
  venueAddress?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  items: TicketLineItem[];
  total: number;
  qrPayload: Record<string, any>;
}

function dedupeEmails(emails: Array<string | undefined | null>): string[] {
  return Array.from(
    new Set(
      emails
        .filter((e): e is string => Boolean(e && e.trim()))
        .map((e) => e.trim().toLowerCase()),
    ),
  );
}

function bookingRecipients(
  registeredEmail?: string | null,
  bookingEmail?: string | null,
): string[] {
  return dedupeEmails([registeredEmail, bookingEmail]);
}

function customerDisplayName(
  bookingName?: string | null,
  registeredUser?: any,
  fallback = 'Guest',
): string {
  return bookingName?.trim() || fullName(registeredUser) || fallback;
}

function fullName(user: any): string {
  if (!user) return '';
  return [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
}

function formatDate(value: any): string | undefined {
  if (!value) return undefined;
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return String(value);
  }
}

/**
 * Orchestrates the "booking confirmed" email + m-ticket PDF flow for every
 * booking type (seat/table/booth tickets, artist, equipment, equipment
 * package, combo). Called from both PaymentService (synchronous confirms)
 * and BookingStatusWorker (async seat/table/booth confirms).
 */
@Injectable()
export class BookingConfirmationMailerService {
  private readonly logger = new Logger(BookingConfirmationMailerService.name);

  constructor(
    private readonly emailService: EmailService,
    private readonly ticketService: TicketService,
    private readonly paymentLogService: PaymentlogsService,
    @InjectModel(ArtistBooking.name) private readonly artistBookingModel: Model<ArtistBookingDocument>,
    @InjectModel(EquipmentBooking.name) private readonly equipmentBookingModel: Model<EquipmentBookingDocument>,
    @InjectModel(EquipmentPackageBooking.name)
    private readonly equipmentPackageBookingModel: Model<EquipmentPackageBookingDocument>,
    @InjectModel(CombineBooking.name) private readonly combineBookingModel: Model<CombineBookingDocument>,
    @InjectModel(SeatBooking.name) private readonly seatBookingModel: Model<SeatBookingDocument>,
    @InjectModel(TableBooking.name) private readonly tableBookingModel: Model<TableBookingDocument>,
    @InjectModel(BoothBooking.name) private readonly boothBookingModel: Model<BoothBookingDocument>,
  ) {}

  /**
   * Fetches booking + payment data, renders the m-ticket PDF, and emails the
   * unified confirmation. Never throws — failures are logged so they never
   * break the payment/booking-confirmation flow that calls this.
   */
  async sendTicketConfirmation(bookingId: string, type: BookingType, transactionData?: any): Promise<void> {
    try {
      const normalized = await this.buildNormalizedData(bookingId, type);
      if (!normalized) return;

      if (!normalized.recipients.length) {
        this.logger.warn(`No recipient email found for booking ${bookingId} (type=${type}); skipping ticket email.`);
        return;
      }

      const paymentLog = await this.paymentLogService.findPaymentLogByBookingId(bookingId).catch(() => null);
      const currency = transactionData?.currency_type || (paymentLog as any)?.currency || 'KWD';
      const paymentMethod =
        transactionData?.paymentMethodLabel || (paymentLog as any)?.resultPaymentMethodLabel || 'Credit/Debit Card';
      const transactionId = transactionData?.track_id || (paymentLog as any)?.trackId || 'N/A';
      const paymentDate = formatDate(transactionData?.transaction_date || (paymentLog as any)?.updatedAt || new Date());
      const total = Number((paymentLog as any)?.amount ?? normalized.total ?? 0);

      const bookingReference = formatBookingReference(bookingId, this.referencePrefix(type));

      const pdfBuffer = await this.ticketService
        .generateTicketPdf({
          bookingReference,
          bookingTypeLabel: normalized.bookingTypeLabel,
          status: 'CONFIRMED',
          customerName: normalized.customerName,
          eventOrServiceName: normalized.eventOrServiceName,
          venueName: normalized.venueName,
          venueAddress: normalized.venueAddress,
          date: normalized.date,
          startTime: normalized.startTime,
          endTime: normalized.endTime,
          items: normalized.items,
          total,
          currency,
          paymentMethod,
          transactionId,
          paymentDate,
          qrPayload: normalized.qrPayload,
        })
        .catch((err) => {
          this.logger.error(`Failed to generate m-ticket PDF for booking ${bookingId}: ${err.message}`);
          return null;
        });

      await this.emailService.sendBookingTicketConfirmation(
        normalized.recipients,
        {
          customerName: normalized.customerName,
          bookingId,
          bookingReference,
          bookingType: normalized.bookingTypeLabel,
          eventOrServiceName: normalized.eventOrServiceName,
          eventDate: normalized.date,
          startTime: normalized.startTime,
          endTime: normalized.endTime,
          venueName: normalized.venueName,
          venueAddress: normalized.venueAddress,
          items: normalized.items,
          totalAmount: `${total.toFixed(2)} ${currency}`,
          currency,
          transactionId,
          paymentMethod,
          paymentDate,
        },
        pdfBuffer || undefined,
        pdfBuffer ? `Artistic-ETicket-${bookingReference}.pdf` : undefined,
      );
    } catch (error: any) {
      this.logger.error(`sendTicketConfirmation failed for booking ${bookingId} (type=${type}): ${error.message}`, error.stack);
    }
  }

  private referencePrefix(type: BookingType): string {
    switch (type) {
      case BookingType.TICKET:
        return 'TKT';
      case BookingType.TABLE:
        return 'TBL';
      case BookingType.BOOTH:
        return 'BTH';
      case BookingType.ARTIST:
        return 'ART';
      case BookingType.EQUIPMENT:
      case BookingType.CUSTOM_EQUIPMENT_PACKAGE:
        return 'EQP';
      case BookingType.EQUIPMENT_PACKAGE:
        return 'PKG';
      case BookingType.COMBO:
        return 'CMB';
      default:
        return 'BK';
    }
  }

  private async buildNormalizedData(bookingId: string, type: BookingType): Promise<NormalizedBookingData | null> {
    switch (type) {
      case BookingType.TICKET:
        return this.normalizeSeatBooking(bookingId);
      case BookingType.TABLE:
        return this.normalizeTableBooking(bookingId);
      case BookingType.BOOTH:
        return this.normalizeBoothBooking(bookingId);
      case BookingType.ARTIST:
        return this.normalizeArtistBooking(bookingId);
      case BookingType.EQUIPMENT:
      case BookingType.CUSTOM_EQUIPMENT_PACKAGE:
        return this.normalizeEquipmentBooking(bookingId);
      case BookingType.EQUIPMENT_PACKAGE:
        return this.normalizeEquipmentPackageBooking(bookingId);
      case BookingType.COMBO:
        return this.normalizeComboBooking(bookingId);
      default:
        this.logger.warn(`No ticket-email normalizer for booking type: ${type}`);
        return null;
    }
  }

  private async normalizeSeatBooking(bookingId: string): Promise<NormalizedBookingData | null> {
    const booking: any = await this.seatBookingModel.findById(bookingId).populate('userId').populate('eventId').lean();
    if (!booking) {
      this.logger.warn(`SeatBooking ${bookingId} not found for ticket email`);
      return null;
    }
    const user = booking.userId;
    const event = booking.eventId;
    const seats: string[] = booking.seatNumber || [];
    const currency = 'KWD';

    return {
      recipients: bookingRecipients(user?.email, booking.customerDetails?.email),
      customerName: customerDisplayName(booking.customerDetails?.name, user),
      bookingTypeLabel: 'Event Ticket',
      eventOrServiceName: event?.name || 'Event',
      venueName: event?.venue?.name,
      venueAddress: [event?.venue?.address, event?.venue?.city].filter(Boolean).join(', '),
      date: formatDate(event?.startDate),
      startTime: event?.startTime,
      endTime: event?.endTime,
      items: [
        {
          label: seats.length ? `${seats.length} Seat${seats.length > 1 ? 's' : ''}` : 'General Admission',
          detail: seats.length ? `Seat number(s): ${seats.join(', ')}` : undefined,
          amount: `${(booking.totalAmount || 0).toFixed?.(2) ?? booking.totalAmount} ${currency}`,
        },
      ],
      total: booking.totalAmount || 0,
      qrPayload: {
        kind: 'event-ticket',
        bookingId,
        bookingReference: formatBookingReference(bookingId, 'TKT'),
        eventId: String(event?._id || booking.eventId || ''),
        seats,
        tables: [],
        booths: [],
        issuedAt: new Date(booking.createdAt || Date.now()).toISOString(),
      },
    };
  }

  private async normalizeTableBooking(bookingId: string): Promise<NormalizedBookingData | null> {
    const booking: any = await this.tableBookingModel.findById(bookingId).populate('userId').populate('eventId').lean();
    if (!booking) {
      this.logger.warn(`TableBooking ${bookingId} not found for ticket email`);
      return null;
    }
    const user = booking.userId;
    const event = booking.eventId;
    const tables: string[] = booking.tableNumbers || [];
    const currency = 'KWD';

    return {
      recipients: bookingRecipients(user?.email, booking.customerDetails?.email),
      customerName: customerDisplayName(booking.customerDetails?.name, user),
      bookingTypeLabel: 'Table Booking',
      eventOrServiceName: event?.name || 'Event',
      venueName: event?.venue?.name,
      venueAddress: [event?.venue?.address, event?.venue?.city].filter(Boolean).join(', '),
      date: formatDate(event?.startDate),
      startTime: event?.startTime,
      endTime: event?.endTime,
      items: [
        {
          label: tables.length ? `${tables.length} Table${tables.length > 1 ? 's' : ''}` : 'Table Booking',
          detail: tables.length ? `Table number(s): ${tables.join(', ')}` : undefined,
          amount: `${(booking.totalAmount || 0).toFixed?.(2) ?? booking.totalAmount} ${currency}`,
        },
      ],
      total: booking.totalAmount || 0,
      qrPayload: {
        kind: 'event-ticket',
        bookingId,
        bookingReference: formatBookingReference(bookingId, 'TBL'),
        eventId: String(event?._id || booking.eventId || ''),
        seats: [],
        tables,
        booths: [],
        issuedAt: new Date(booking.createdAt || Date.now()).toISOString(),
      },
    };
  }

  private async normalizeBoothBooking(bookingId: string): Promise<NormalizedBookingData | null> {
    const booking: any = await this.boothBookingModel.findById(bookingId).populate('userId').populate('eventId').lean();
    if (!booking) {
      this.logger.warn(`BoothBooking ${bookingId} not found for ticket email`);
      return null;
    }
    const user = booking.userId;
    const event = booking.eventId;
    const booths: string[] = booking.boothNumbers || [];
    const currency = 'KWD';

    return {
      recipients: bookingRecipients(user?.email, booking.customerDetails?.email),
      customerName: customerDisplayName(booking.customerDetails?.name, user),
      bookingTypeLabel: 'Booth Booking',
      eventOrServiceName: event?.name || 'Event',
      venueName: event?.venue?.name,
      venueAddress: [event?.venue?.address, event?.venue?.city].filter(Boolean).join(', '),
      date: formatDate(event?.startDate),
      startTime: event?.startTime,
      endTime: event?.endTime,
      items: [
        {
          label: booths.length ? `${booths.length} Booth${booths.length > 1 ? 's' : ''}` : 'Booth Booking',
          detail: booths.length ? `Booth number(s): ${booths.join(', ')}` : undefined,
          amount: `${(booking.totalAmount || 0).toFixed?.(2) ?? booking.totalAmount} ${currency}`,
        },
      ],
      total: booking.totalAmount || 0,
      qrPayload: {
        kind: 'event-ticket',
        bookingId,
        bookingReference: formatBookingReference(bookingId, 'BTH'),
        eventId: String(event?._id || booking.eventId || ''),
        seats: [],
        tables: [],
        booths,
        issuedAt: new Date(booking.createdAt || Date.now()).toISOString(),
      },
    };
  }

  private async normalizeArtistBooking(bookingId: string): Promise<NormalizedBookingData | null> {
    const booking: any = await this.artistBookingModel
      .findById(bookingId)
      .populate('bookedBy')
      .populate({ path: 'artistId', populate: { path: 'user' } })
      .lean();
    if (!booking) {
      this.logger.warn(`ArtistBooking ${bookingId} not found for ticket email`);
      return null;
    }
    const customer = booking.bookedBy;
    const combo: any = booking.combineBookingRef
      ? await this.combineBookingModel.findById(booking.combineBookingRef).lean()
      : null;
    const artist: any = booking.artistId;
    const artistName = artist?.stageName || fullName(artist?.user) || 'Artist';
    const price = booking.totalPrice || booking.price || 0;
    const currency = 'KWD';

    return {
      recipients: bookingRecipients(customer?.email, combo?.userDetails?.email),
      customerName: customerDisplayName(combo?.userDetails?.name, customer),
      bookingTypeLabel: 'Artist Booking',
      eventOrServiceName: `${artistName} Performance`,
      venueName: booking.venueDetails?.name,
      venueAddress: booking.venueDetails?.address || booking.address,
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      items: [
        {
          label: artistName,
          detail: artist?.artistType ? `Artist type: ${artist.artistType}` : undefined,
          amount: `${price.toFixed?.(2) ?? price} ${currency}`,
        },
      ],
      total: price,
      qrPayload: {
        kind: 'artist-booking',
        bookingId,
        bookingReference: formatBookingReference(bookingId, 'ART'),
        artistId: String(artist?._id || booking.artistId || ''),
        issuedAt: new Date(booking.createdAt || Date.now()).toISOString(),
      },
    };
  }

  private async normalizeEquipmentBooking(bookingId: string): Promise<NormalizedBookingData | null> {
    const booking: any = await this.equipmentBookingModel
      .findById(bookingId)
      .populate('bookedBy')
      .populate({ path: 'equipments.equipmentId' })
      .lean();
    if (!booking) {
      this.logger.warn(`EquipmentBooking ${bookingId} not found for ticket email`);
      return null;
    }
    const customer = booking.bookedBy;
    const combo: any = booking.combineBookingRef
      ? await this.combineBookingModel.findById(booking.combineBookingRef).lean()
      : null;
    const items: TicketLineItem[] = (booking.equipments || [])
      .map((item: any) => ({
        label: item.equipmentId?.name || 'Equipment',
        detail: `Quantity: ${item.quantity}`,
      }))
      .filter((item: TicketLineItem) => item.label);

    const equipmentNames = items.map((i) => i.label).join(', ') || 'Equipment Rental';

    return {
      recipients: bookingRecipients(customer?.email, combo?.userDetails?.email),
      customerName: customerDisplayName(combo?.userDetails?.name, customer),
      bookingTypeLabel: 'Equipment Rental',
      eventOrServiceName: equipmentNames,
      venueName: booking.venueDetails?.name,
      venueAddress: booking.venueDetails?.address || booking.address,
      date: booking.startDate || booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      items: items.length ? items : [{ label: equipmentNames }],
      total: booking.totalPrice || 0,
      qrPayload: {
        kind: 'equipment-booking',
        bookingId,
        bookingReference: formatBookingReference(bookingId, 'EQP'),
        issuedAt: new Date(booking.createdAt || Date.now()).toISOString(),
      },
    };
  }

  private async normalizeEquipmentPackageBooking(bookingId: string): Promise<NormalizedBookingData | null> {
    const booking: any = await this.equipmentPackageBookingModel
      .findById(bookingId)
      .populate('bookedBy')
      .populate({ path: 'packageId', populate: { path: 'items.equipmentId' } })
      .lean();
    if (!booking) {
      this.logger.warn(`EquipmentPackageBooking ${bookingId} not found for ticket email`);
      return null;
    }
    const customer = booking.bookedBy;
    const pkg: any = booking.packageId;
    const items: TicketLineItem[] = (pkg?.items || [])
      .map((item: any) => ({
        label: item.equipmentId?.name || 'Package Item',
        detail: `Quantity: ${item.quantity}`,
      }))
      .filter((item: TicketLineItem) => item.label);

    const packageName = pkg?.name || 'Equipment Package';

    return {
      recipients: bookingRecipients(customer?.email, booking.userDetails?.email),
      customerName: customerDisplayName(booking.userDetails?.name, customer),
      bookingTypeLabel: 'Equipment Package Booking',
      eventOrServiceName: packageName,
      venueName: undefined,
      venueAddress: [booking.venueDetails?.address, booking.venueDetails?.city, booking.venueDetails?.country]
        .filter(Boolean)
        .join(', '),
      date: `${formatDate(booking.startDate) || booking.startDate} - ${formatDate(booking.endDate) || booking.endDate}`,
      items: items.length
        ? items
        : [{ label: packageName, detail: `${booking.numberOfDays} day(s)` }],
      total: booking.totalPrice || 0,
      qrPayload: {
        kind: 'equipment-package-booking',
        bookingId,
        bookingReference: formatBookingReference(bookingId, 'PKG'),
        issuedAt: new Date(booking.bookingDate || Date.now()).toISOString(),
      },
    };
  }

  private async normalizeComboBooking(bookingId: string): Promise<NormalizedBookingData | null> {
    const booking: any = await this.combineBookingModel
      .findById(bookingId)
      .populate('bookedBy')
      .populate({ path: 'artistBookingId', populate: { path: 'artistId', populate: { path: 'user' } } })
      .populate({ path: 'equipmentBookingId', populate: { path: 'equipments.equipmentId' } })
      .lean();
    if (!booking) {
      this.logger.warn(`CombineBooking ${bookingId} not found for ticket email`);
      return null;
    }
    const customer = booking.bookedBy;
    const artistBooking: any = booking.artistBookingId;
    const equipmentBooking: any = booking.equipmentBookingId;
    const currency = 'KWD';

    const items: TicketLineItem[] = [];
    if (artistBooking) {
      const artist = artistBooking.artistId;
      const artistName = artist?.stageName || fullName(artist?.user) || 'Artist';
      const price = artistBooking.totalPrice || artistBooking.price || 0;
      items.push({ label: `${artistName} (Artist)`, amount: `${price.toFixed?.(2) ?? price} ${currency}` });
    }
    if (equipmentBooking?.equipments?.length) {
      for (const item of equipmentBooking.equipments) {
        items.push({
          label: item.equipmentId?.name || 'Equipment',
          detail: `Quantity: ${item.quantity}`,
        });
      }
    }

    const serviceName =
      items.map((i) => i.label).slice(0, 3).join(', ') || 'Combo Booking (Artist + Equipment)';

    return {
      recipients: bookingRecipients(customer?.email, booking.userDetails?.email),
      customerName: customerDisplayName(booking.userDetails?.name, customer),
      bookingTypeLabel: 'Combo Booking (Artist + Equipment)',
      eventOrServiceName: serviceName,
      venueName: undefined,
      venueAddress: booking.venueDetails?.address || booking.address,
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      items: items.length ? items : [{ label: serviceName }],
      total: booking.totalPrice || 0,
      qrPayload: {
        kind: 'combo-booking',
        bookingId,
        bookingReference: formatBookingReference(bookingId, 'CMB'),
        issuedAt: new Date(booking.createdAt || Date.now()).toISOString(),
      },
    };
  }
}
