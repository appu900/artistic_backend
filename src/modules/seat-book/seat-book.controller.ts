import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { SeatBookDto } from './dto/seatBook.dto';
import { GetUser } from 'src/common/decorators/getUser.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwtAuth.guard';
import { seatBookingService } from './seat-book.service';
import { TableBookDto } from './dto/tableBooking.dto';
import { TableBookSearvice } from './table-book.service';
import { BoothBookService } from './booth-book.service';
import { BoothBookDto } from './dto/boothBook.dto';
import { NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SeatBooking, SeatBookingDocument } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/SeatBooking.schema';
import { TableBooking, TableBookingDocument } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/booth-and-table/table-book-schema';
import { BoothBooking, BoothBookingDocument } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/booth-and-table/booth-booking.schema';

@Controller('seat-book')
export class SeatBookController {
  constructor(
    private readonly seatBookingService: seatBookingService,
    private readonly tableBookingService: TableBookSearvice,
    private readonly boothBookingService:BoothBookService,
    @InjectModel(SeatBooking.name) private readonly seatBookingModel: Model<SeatBookingDocument>,
    @InjectModel(TableBooking.name) private readonly tableBookingModel: Model<TableBookingDocument>,
    @InjectModel(BoothBooking.name) private readonly boothBookingModel: Model<BoothBookingDocument>,
  ) {}

  @Post('/ticket')
  @UseGuards(JwtAuthGuard)
  async bookATicket(@Body() dto: SeatBookDto, @GetUser() user: any) {
    const userId = user.userId;
    const userEmail = user.email;
    return this.seatBookingService.bookSeat(dto, userId, userEmail);
  }

  @Get('/ticket/status/:bookingId')
  async getBookingDetails(@Param('bookingId') bookingId: string) {
    const booking = await this.seatBookingService.getBookingDeatils(bookingId);
    if (!booking) {
      throw new NotFoundException('Booking failed');
    }
    return booking;
  }

  @Post('/table')
  @UseGuards(JwtAuthGuard)
  async bookTable(@Body() dto: TableBookDto, @GetUser() user: any) {
    const userId = user.userId;
    const userEmail = user.email;
    return this.tableBookingService.bookTable(dto, userId, userEmail);
  }

  @Post('/booth')
  @UseGuards(JwtAuthGuard)
  async bookBooth(@Body() dto: BoothBookDto, @GetUser() user: any) {
    const userId = user.userId;
    const userEmail = user.email;
    return this.boothBookingService.bookBooth(dto, userId, userEmail);
  }

  @Get('/ticket/:bookingId')
  @UseGuards(JwtAuthGuard)
  async getTicketBooking(@Param('bookingId') bookingId: string, @GetUser() user: any) {
    const userId = user.userId;
    return this.seatBookingService.getBookingDeatils(bookingId);
  }

  // Compatibility aliases for frontend service paths
  @Get('/details/:bookingId')
  @UseGuards(JwtAuthGuard)
  async getSeatDetails(@Param('bookingId') bookingId: string, @GetUser() user: any) {
    return this.seatBookingService.getBookingDeatils(bookingId);
  }

  @Get('/table/:bookingId')
  @UseGuards(JwtAuthGuard)
  async getTableBooking(@Param('bookingId') bookingId: string, @GetUser() user: any) {
    const userId = user.userId;
    return this.tableBookingService.getBookingDeatils(bookingId);
  }

  @Get('/table-details/:bookingId')
  @UseGuards(JwtAuthGuard)
  async getTableDetails(@Param('bookingId') bookingId: string, @GetUser() user: any) {
    return this.tableBookingService.getBookingDeatils(bookingId);
  }

  @Get('/booth/:bookingId')
  @UseGuards(JwtAuthGuard)
  async getBoothBooking(@Param('bookingId') bookingId: string, @GetUser() user: any) {
    const userId = user.userId;
    return this.boothBookingService.getBookingDeatils(bookingId);
  }

  @Get('/booth-details/:bookingId')
  @UseGuards(JwtAuthGuard)
  async getBoothDetails(@Param('bookingId') bookingId: string, @GetUser() user: any) {
    return this.boothBookingService.getBookingDeatils(bookingId);
  }

  // Unified cancel endpoint used by frontend
  @Post('/cancel/:bookingId')
  @UseGuards(JwtAuthGuard)
  async cancel(@Param('bookingId') bookingId: string, @GetUser() user: any) {
    // Try seat, then table, then booth
    try {
      const seat = await this.seatBookingService.getBookingDeatils(bookingId);
      if (seat) {
        await this.seatBookingService.cancelBooking(bookingId);
        return { message: 'Seat booking cancelled' };
      }
    } catch {}
    try {
      const table = await this.tableBookingService.getBookingDeatils(bookingId);
      if (table) {
        await this.tableBookingService.cancelBooking(bookingId);
        return { message: 'Table booking cancelled' };
      }
    } catch {}
    try {
      const booth = await this.boothBookingService.getBookingDeatils(bookingId);
      if (booth) {
        await this.boothBookingService.cancelBooking(bookingId);
        return { message: 'Booth booking cancelled' };
      }
    } catch {}
    throw new NotFoundException('Booking not found');
  }

  // Aggregated user bookings across seat/table/booth
  @Get('/user-bookings')
  @UseGuards(JwtAuthGuard)
  async getUserBookings(
    @GetUser() user: any,
    @Query('status') status?: string,
    @Query('eventId') eventId?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    const userId = new Types.ObjectId(user.userId);
    const filter: any = { userId };
    if (status) filter.status = status;
    if (eventId && Types.ObjectId.isValid(eventId)) filter.eventId = new Types.ObjectId(eventId);

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.max(Math.min(parseInt(limit, 10) || 10, 100), 1);

    // Fetch per collection
    const [seatDocs, tableDocs, boothDocs] = await Promise.all([
      this.seatBookingModel.find(filter).sort({ bookedAt: -1 }).lean(),
      this.tableBookingModel.find(filter).sort({ bookedAt: -1 }).lean(),
      this.boothBookingModel.find(filter).sort({ bookedAt: -1 }).lean(),
    ]);

    // Normalize into a unified response shape used by the frontend ticket components
    const toUnified = (doc: any, kind: 'seat' | 'table' | 'booth') => {
      const createdAt = doc.bookedAt || doc.createdAt || new Date();
      const totalTickets = kind === 'seat' ? (doc.seatIds?.length || 0) : kind === 'table' ? (doc.tableIds?.length || 0) : (doc.boothIds?.length || 0);
      return {
        _id: String(doc._id),
        bookingReference: String(doc._id),
        eventId: String(doc.eventId),
        status: doc.status,
        seats: kind === 'seat' ? (doc.seatIds || []).map((id: any) => ({ seatId: String(id), categoryId: '', categoryName: '', price: 0 })) : [],
        tables: kind === 'table' ? (doc.tableIds || []).map((id: any) => ({ tableId: String(id), tableName: '', categoryId: '', price: 0, seatCount: 0 })) : [],
        booths: kind === 'booth' ? (doc.boothIds || []).map((id: any) => ({ boothId: String(id), boothName: '', categoryId: '', price: 0 })) : [],
        customerInfo: { name: user?.name || user?.fullName || '', email: user?.email || '', phone: user?.phone || '' },
        paymentInfo: { subtotal: doc.totalAmount || 0, serviceFee: 0, tax: 0, total: doc.totalAmount || 0, currency: 'KWD' },
        totalTickets,
        lockExpiry: doc.expiresAt ? new Date(doc.expiresAt).toISOString() : undefined,
        createdAt: createdAt?.toISOString?.() || new Date(createdAt).toISOString(),
      };
    };

    const unified = [
      ...seatDocs.map((d) => toUnified(d, 'seat')),
      ...tableDocs.map((d) => toUnified(d, 'table')),
      ...boothDocs.map((d) => toUnified(d, 'booth')),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = unified.length;
    const start = (pageNum - 1) * limitNum;
    const end = start + limitNum;
    const pageItems = unified.slice(start, end);

    return {
      bookings: pageItems,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    };
  }

  // Get a single booking by id across seat/table/booth
  @Get('/booking/:id')
  @UseGuards(JwtAuthGuard)
  async getUnifiedBooking(@Param('id') id: string, @GetUser() user: any) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Invalid booking id');
    }
    const _id = new Types.ObjectId(id);
    const [seat, table, booth] = await Promise.all([
      this.seatBookingModel.findById(_id).lean(),
      this.tableBookingModel.findById(_id).lean(),
      this.boothBookingModel.findById(_id).lean(),
    ]);
    const toUnified = (doc: any, kind: 'seat' | 'table' | 'booth') => {
      const createdAt = doc.bookedAt || doc.createdAt || new Date();
      const totalTickets = kind === 'seat' ? (doc.seatIds?.length || 0) : kind === 'table' ? (doc.tableIds?.length || 0) : (doc.boothIds?.length || 0);
      return {
        _id: String(doc._id),
        bookingReference: String(doc._id),
        eventId: String(doc.eventId),
        status: doc.status,
        seats: kind === 'seat' ? (doc.seatIds || []).map((id: any) => ({ seatId: String(id), categoryId: '', categoryName: '', price: 0 })) : [],
        tables: kind === 'table' ? (doc.tableIds || []).map((id: any) => ({ tableId: String(id), tableName: '', categoryId: '', price: 0, seatCount: 0 })) : [],
        booths: kind === 'booth' ? (doc.boothIds || []).map((id: any) => ({ boothId: String(id), boothName: '', categoryId: '', price: 0 })) : [],
        customerInfo: { name: user?.name || user?.fullName || '', email: user?.email || '', phone: user?.phone || '' },
        paymentInfo: { subtotal: doc.totalAmount || 0, serviceFee: 0, tax: 0, total: doc.totalAmount || 0, currency: 'KWD' },
        totalTickets,
        lockExpiry: doc.expiresAt ? new Date(doc.expiresAt).toISOString() : undefined,
        createdAt: createdAt?.toISOString?.() || new Date(createdAt).toISOString(),
      };
    };
    if (seat) return toUnified(seat, 'seat');
    if (table) return toUnified(table, 'table');
    if (booth) return toUnified(booth, 'booth');
    throw new NotFoundException('Booking not found');
  }
}
