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
    const toUnified = async (doc: any, kind: 'seat' | 'table' | 'booth') => {
      const createdAt = doc.bookedAt || doc.createdAt || new Date();
      const totalTickets = kind === 'seat' ? (doc.seatIds?.length || 0) : kind === 'table' ? (doc.tableIds?.length || 0) : (doc.boothIds?.length || 0);
      
      let seats: any[] = [];
      let tables: any[] = [];
      let booths: any[] = [];

      if (kind === 'seat' && doc.seatIds?.length) {
        // Fetch actual seat documents to get row labels and seat numbers
        try {
          const seatDocs = await this.seatBookingModel.findById(doc._id).populate('seatIds').lean();
          if (seatDocs && (seatDocs as any).seatIds) {
            seats = ((seatDocs as any).seatIds || []).map((seat: any) => ({
              seatId: String(seat._id || seat.seatId),
              categoryId: seat.categoryId || '',
              categoryName: seat.categoryName || '',
              price: seat.price || 0,
              rowLabel: seat.rl || seat.rowLabel || '',
              seatNumber: seat.sn || seat.seatNumber || '',
              seatLabel: seat.seatLabel || `${seat.rl || seat.rowLabel || ''}${seat.sn || seat.seatNumber || ''}`.trim() || String(seat._id).slice(-4).toUpperCase()
            }));
          } else {
            // Fallback to individual seat lookups
            const seatDocuments = await Promise.all(
              doc.seatIds.map(async (seatId: any) => {
                try {
                  return await this.seatBookingModel.findOne({ _id: seatId }).lean();
                } catch {
                  return null;
                }
              })
            );
            seats = seatDocuments.filter(Boolean).map((seat: any) => ({
              seatId: String(seat._id),
              categoryId: '',
              categoryName: '',
              price: 0,
              rowLabel: '',
              seatNumber: seat.seatNumber || '',
              seatLabel: seat.seatNumber ? `SEAT ${seat.seatNumber}` : String(seat._id).slice(-4).toUpperCase()
            }));
          }
        } catch {
          // Final fallback with readable IDs
          seats = (doc.seatIds || []).map((id: any, idx: number) => ({
            seatId: String(id),
            categoryId: '',
            categoryName: '',
            price: 0,
            rowLabel: '',
            seatNumber: '',
            seatLabel: `SEAT ${String.fromCharCode(65 + (idx % 26))}${Math.floor(idx / 26) + 1}`
          }));
        }
      }

      if (kind === 'table' && doc.tableIds?.length) {
        tables = (doc.tableIds || []).map((id: any, idx: number) => ({ 
          tableId: String(id), 
          tableName: `TABLE ${idx + 1}`, 
          categoryId: '', 
          price: 0, 
          seatCount: 0 
        }));
      }

      if (kind === 'booth' && doc.boothIds?.length) {
        booths = (doc.boothIds || []).map((id: any, idx: number) => ({ 
          boothId: String(id), 
          boothName: `BOOTH ${idx + 1}`, 
          categoryId: '', 
          price: 0 
        }));
      }

      return {
        _id: String(doc._id),
        bookingReference: String(doc._id),
        eventId: String(doc.eventId),
        status: doc.status,
        seats,
        tables,
        booths,
        customerInfo: { name: user?.name || user?.fullName || '', email: user?.email || '', phone: user?.phone || '' },
        paymentInfo: { subtotal: doc.totalAmount || 0, serviceFee: 0, tax: 0, total: doc.totalAmount || 0, currency: 'KWD' },
        totalTickets,
        lockExpiry: doc.expiresAt ? new Date(doc.expiresAt).toISOString() : undefined,
        createdAt: createdAt?.toISOString?.() || new Date(createdAt).toISOString(),
      };
    };

    const [seatResults, tableResults, boothResults] = await Promise.all([
      Promise.all(seatDocs.map((d) => toUnified(d, 'seat'))),
      Promise.all(tableDocs.map((d) => toUnified(d, 'table'))),
      Promise.all(boothDocs.map((d) => toUnified(d, 'booth'))),
    ]);

    const unified = [
      ...seatResults,
      ...tableResults,
      ...boothResults,
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
    if (seat) return await toUnified(seat, 'seat');
    if (table) return await toUnified(table, 'table');
    if (booth) return await toUnified(booth, 'booth');
    throw new NotFoundException('Booking not found');
  }

  // ========== VENUE OWNER ENDPOINTS ==========
  
  /**
   * Get all bookings for venue owner's events
   */
  @Get('/venue-owner/bookings')
  @UseGuards(JwtAuthGuard)
  async getVenueOwnerBookings(
    @GetUser() user: any,
    @Query('eventId') eventId?: string,
    @Query('status') status?: string,
    @Query('bookingType') bookingType?: string,
    @Query('paymentStatus') paymentStatus?: string,
    @Query('search') search?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    const venueOwnerId = new Types.ObjectId(user.userId);
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.max(Math.min(parseInt(limit, 10) || 10, 100), 1);

    

    // First find the venue owner profile for this user
    const VenueOwnerProfile = this.seatBookingModel.db.model('VenueOwnerProfile');
    const venueOwnerProfile: any = await VenueOwnerProfile.findOne({ user: venueOwnerId }).lean();
    

    // Build filter for finding events created by OR assigned to this venue owner
    const eventFilter: any = {
      $or: [
        // Created by this venue owner (role casing may vary across data)
        { createdBy: venueOwnerId, createdByRole: { $regex: /^venue[_ ]?owner$/i } },
        { createdBy: String(venueOwnerId), createdByRole: { $regex: /^venue[_ ]?owner$/i } },
        { createdBy: venueOwnerId, createdByType: { $regex: /^venue[_ ]?owner$/i } },
        { createdBy: String(venueOwnerId), createdByType: { $regex: /^venue[_ ]?owner$/i } },
        // Assigned to this venue owner profile (handle ObjectId and string storage)
        { venueOwnerId: venueOwnerProfile._id },
        { venueOwnerId: String(venueOwnerProfile._id) },
      ]
    };
    
    if (eventId && Types.ObjectId.isValid(eventId)) {
      eventFilter._id = new Types.ObjectId(eventId);
    }

    

    // Get all events created by or assigned to this venue owner
    const Event = this.seatBookingModel.db.model('Event');
    
    
    
    const venueOwnerEvents = await Event.find(eventFilter).select('_id name createdBy createdByRole venueOwnerId').lean();
    
    
    const eventIds = venueOwnerEvents.map((e: any) => e._id);

    if (eventIds.length === 0) {
      return {
        bookings: [],
        pagination: { page: pageNum, limit: limitNum, total: 0, pages: 0 },
        stats: { totalBookings: 0, totalRevenue: 0, pendingBookings: 0, confirmedBookings: 0, cancelledBookings: 0 }
      };
    }
    

    // Build booking filter
    const bookingFilter: any = { eventId: { $in: eventIds } };
    if (status) bookingFilter.status = status;
    if (paymentStatus) bookingFilter.paymentStatus = paymentStatus;

    

    // Fetch bookings based on type filter
    let seatDocs: any[] = [];
    let tableDocs: any[] = [];
    let boothDocs: any[] = [];

    if (!bookingType || bookingType === 'all' || bookingType === 'ticket') {
      seatDocs = await this.seatBookingModel
        .find(bookingFilter)
        .populate('eventId', 'name description startDate endDate startTime endTime coverPhoto status')
        .populate('userId', 'firstName lastName email')
        .sort({ bookedAt: -1 })
        .lean();
      
    }

    if (!bookingType || bookingType === 'all' || bookingType === 'table') {
      tableDocs = await this.tableBookingModel
        .find(bookingFilter)
        .populate('eventId', 'name description startDate endDate startTime endTime coverPhoto status')
        .populate('userId', 'firstName lastName email')
        .sort({ bookedAt: -1 })
        .lean();
      
    }

    if (!bookingType || bookingType === 'all' || bookingType === 'booth') {
      boothDocs = await this.boothBookingModel
        .find(bookingFilter)
        .populate('eventId', 'name description startDate endDate startTime endTime coverPhoto status')
        .populate('userId', 'firstName lastName email')
        .sort({ bookedAt: -1 })
        .lean();
      
    }

    // Transform to unified format
    const toVenueOwnerBooking = (doc: any, kind: 'ticket' | 'table' | 'booth') => {
      const bookedUser = doc.userId || {};
      const event = doc.eventId || {};
      const totalTickets = kind === 'ticket' ? (doc.seatIds?.length || 0) : kind === 'table' ? (doc.tableIds?.length || 0) : (doc.boothIds?.length || 0);
      
      return {
        _id: String(doc._id),
        bookingReference: String(doc._id).toUpperCase().slice(-8),
        eventId: {
          _id: String(event._id || ''),
          name: event.name || 'Unknown Event',
          description: event.description || '',
          startDate: event.startDate || new Date(),
          endDate: event.endDate || new Date(),
          startTime: event.startTime || '00:00',
          endTime: event.endTime || '23:59',
          coverPhoto: event.coverPhoto || '',
          status: event.status || 'published',
        },
        bookedBy: {
          _id: String(bookedUser._id || ''),
          firstName: bookedUser.firstName || '',
          lastName: bookedUser.lastName || '',
          email: bookedUser.email || '',
        },
        status: doc.status || 'pending',
        bookingType: kind,
        totalTickets,
        customerInfo: {
          name: `${bookedUser.firstName || ''} ${bookedUser.lastName || ''}`.trim() || bookedUser.email || 'Guest',
          email: bookedUser.email || '',
          phone: bookedUser.phone || '',
          address: bookedUser.address || '',
        },
        paymentInfo: {
          subtotal: doc.totalAmount || 0,
          serviceFee: 0,
          tax: 0,
          total: doc.totalAmount || 0,
          currency: 'KWD',
        },
        paymentStatus: doc.paymentStatus || 'pending',
        seats: kind === 'ticket' ? (doc.seatIds || []).map((id: any, idx: number) => ({ 
          seatId: String(id), 
          categoryId: '', 
          categoryName: '', 
          price: 0,
          rowLabel: String.fromCharCode(65 + (idx % 26)),
          seatNumber: Math.floor(idx / 26) + 1
        })) : [],
        tables: kind === 'table' ? (doc.tableIds || []).map((id: any, idx: number) => ({ 
          tableId: String(id), 
          tableName: `Table ${idx + 1}`, 
          categoryId: '', 
          price: 0, 
          seatCount: 4 
        })) : [],
        booths: kind === 'booth' ? (doc.boothIds || []).map((id: any, idx: number) => ({ 
          boothId: String(id), 
          boothName: `Booth ${idx + 1}`, 
          categoryId: '', 
          price: 0 
        })) : [],
        createdAt: (doc.bookedAt || doc.createdAt || new Date()).toISOString?.() || new Date(doc.bookedAt || doc.createdAt).toISOString(),
        updatedAt: (doc.updatedAt || new Date()).toISOString?.() || new Date(doc.updatedAt).toISOString(),
      };
    };

    const allBookings = [
      ...seatDocs.map((d) => toVenueOwnerBooking(d, 'ticket')),
      ...tableDocs.map((d) => toVenueOwnerBooking(d, 'table')),
      ...boothDocs.map((d) => toVenueOwnerBooking(d, 'booth')),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Apply search filter if provided
    let filteredBookings = allBookings;
    if (search && search.trim()) {
      const searchLower = search.toLowerCase();
      filteredBookings = allBookings.filter((b) =>
        b.bookingReference.toLowerCase().includes(searchLower) ||
        b.customerInfo.name.toLowerCase().includes(searchLower) ||
        b.customerInfo.email.toLowerCase().includes(searchLower) ||
        b.eventId.name.toLowerCase().includes(searchLower)
      );
    }

    // Calculate stats
    const stats = {
      totalBookings: filteredBookings.length,
      totalRevenue: filteredBookings.reduce((sum, b) => sum + (b.paymentInfo.total || 0), 0),
      pendingBookings: filteredBookings.filter((b) => b.status === 'pending').length,
      confirmedBookings: filteredBookings.filter((b) => b.status === 'confirmed').length,
      cancelledBookings: filteredBookings.filter((b) => b.status === 'cancelled').length,
    };

    // Paginate
    const total = filteredBookings.length;
    const start = (pageNum - 1) * limitNum;
    const end = start + limitNum;
    const pageItems = filteredBookings.slice(start, end);

    return {
      bookings: pageItems,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
      stats,
    };
  }

  /**
   * Get booking statistics for venue owner
   */
  @Get('/venue-owner/stats')
  @UseGuards(JwtAuthGuard)
  async getVenueOwnerStats(@GetUser() user: any) {
    const userId = new Types.ObjectId(user.userId);

    // First find the venue owner profile for this user
    const VenueOwnerProfile = this.seatBookingModel.db.model('VenueOwnerProfile');
    const venueOwnerProfile: any = await VenueOwnerProfile.findOne({ user: userId }).lean();
    
    if (!venueOwnerProfile) {
      throw new NotFoundException('Venue owner profile not found');
    }
    
    const venueOwnerProfileId = new Types.ObjectId(venueOwnerProfile._id);

    // Get all events created by or assigned to this venue owner
    const Event = this.seatBookingModel.db.model('Event');
    const eventFilter: any = {
      $or: [
        { createdBy: userId, createdByRole: { $regex: /^venue[_ ]?owner$/i } },
        { createdBy: String(userId), createdByRole: { $regex: /^venue[_ ]?owner$/i } },
        { createdBy: userId, createdByType: { $regex: /^venue[_ ]?owner$/i } },
        { createdBy: String(userId), createdByType: { $regex: /^venue[_ ]?owner$/i } },
        { venueOwnerId: venueOwnerProfileId },
        { venueOwnerId: String(venueOwnerProfileId) },
      ]
    };
    
    const venueOwnerEvents = await Event.find(eventFilter).select('_id').lean();
    const eventIds = venueOwnerEvents.map((e: any) => e._id);

    if (eventIds.length === 0) {
      return {
        totalBookings: 0,
        totalRevenue: 0,
        pendingBookings: 0,
        confirmedBookings: 0,
        cancelledBookings: 0,
      };
    }

    const bookingFilter = { eventId: { $in: eventIds } };

    // Get all bookings
    const [seatDocs, tableDocs, boothDocs] = await Promise.all([
      this.seatBookingModel.find(bookingFilter).lean(),
      this.tableBookingModel.find(bookingFilter).lean(),
      this.boothBookingModel.find(bookingFilter).lean(),
    ]);

    const allBookings = [...seatDocs, ...tableDocs, ...boothDocs];

    return {
      totalBookings: allBookings.length,
      totalRevenue: allBookings.reduce((sum, b) => sum + (b.totalAmount || 0), 0),
      pendingBookings: allBookings.filter((b) => b.status === 'pending').length,
      confirmedBookings: allBookings.filter((b) => b.status === 'confirmed').length,
      cancelledBookings: allBookings.filter((b) => b.status === 'cancelled').length,
    };
  }

  /**
   * Get detailed booking for venue owner
   */
  @Get('/venue-owner/booking/:id')
  @UseGuards(JwtAuthGuard)
  async getVenueOwnerBookingDetails(@Param('id') id: string, @GetUser() user: any) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Invalid booking id');
    }

    const venueOwnerId = new Types.ObjectId(user.userId);
    const bookingId = new Types.ObjectId(id);

    // Get venue owner profile
    const VenueOwnerProfile = this.seatBookingModel.db.model('VenueOwnerProfile');
    const venueOwnerProfile: any = await VenueOwnerProfile.findOne({ user: venueOwnerId }).lean();

    if (!venueOwnerProfile) {
      throw new NotFoundException('Venue owner profile not found');
    }

    const venueOwnerProfileId = new Types.ObjectId(venueOwnerProfile._id);

    // Try to find in each collection
    const [seat, table, booth] = await Promise.all([
      this.seatBookingModel.findById(bookingId)
        .populate('eventId', 'name description startDate endDate startTime endTime coverPhoto status createdBy createdByRole venueOwnerId')
        .populate('userId', 'firstName lastName email phone')
        .lean(),
      this.tableBookingModel.findById(bookingId)
        .populate('eventId', 'name description startDate endDate startTime endTime coverPhoto status createdBy createdByRole venueOwnerId')
        .populate('userId', 'firstName lastName email phone')
        .lean(),
      this.boothBookingModel.findById(bookingId)
        .populate('eventId', 'name description startDate endDate startTime endTime coverPhoto status createdBy createdByRole venueOwnerId')
        .populate('userId', 'firstName lastName email phone')
        .lean(),
    ]);

    const booking: any = seat || table || booth;
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    // Verify this booking belongs to venue owner's event (either created by or assigned to)
    const event = booking.eventId;
    const isOwner = !!event && (
      // Created by this user with role VENUE_OWNER (case-insensitive, supports legacy createdByType)
      (String(event.createdBy) === String(venueOwnerId) && (
        (typeof event.createdByRole === 'string' && event.createdByRole.toLowerCase?.() === 'venue_owner') ||
        (typeof (event as any).createdByType === 'string' && (event as any).createdByType.toLowerCase?.() === 'venue_owner')
      )) ||
      // Or assigned to this venue owner profile id
      (event.venueOwnerId && String(event.venueOwnerId) === String(venueOwnerProfileId))
    );
    
    if (!isOwner) {
      throw new NotFoundException('Booking not found');
    }

    // Return detailed booking
    const kind = seat ? 'ticket' : table ? 'table' : 'booth';
    const bookedUser = booking.userId || {};
    const totalTickets = kind === 'ticket' ? (booking.seatIds?.length || 0) : kind === 'table' ? (booking.tableIds?.length || 0) : (booking.boothIds?.length || 0);

    return {
      _id: String(booking._id),
      bookingReference: String(booking._id).toUpperCase().slice(-8),
      eventId: {
        _id: String(event._id),
        name: event.name,
        description: event.description,
        startDate: event.startDate,
        endDate: event.endDate,
        startTime: event.startTime,
        endTime: event.endTime,
        coverPhoto: event.coverPhoto,
        status: event.status,
      },
      bookedBy: {
        _id: String(bookedUser._id),
        firstName: bookedUser.firstName,
        lastName: bookedUser.lastName,
        email: bookedUser.email,
      },
      status: booking.status,
      bookingType: kind,
      totalTickets,
      customerInfo: {
        name: `${bookedUser.firstName || ''} ${bookedUser.lastName || ''}`.trim(),
        email: bookedUser.email,
        phone: bookedUser.phone,
      },
      paymentInfo: {
        subtotal: booking.totalAmount || 0,
        serviceFee: 0,
        tax: 0,
        total: booking.totalAmount || 0,
        currency: 'KWD',
      },
      paymentStatus: booking.paymentStatus || 'pending',
      createdAt: (booking.bookedAt || booking.createdAt || new Date()).toISOString?.() || new Date(booking.bookedAt || booking.createdAt).toISOString(),
      updatedAt: (booking.updatedAt || new Date()).toISOString?.() || new Date(booking.updatedAt).toISOString(),
    };
  }

  /**
   * Update booking status (venue owner)
   */
  @Post('/venue-owner/booking/:id/status')
  @UseGuards(JwtAuthGuard)
  async updateVenueOwnerBookingStatus(
    @Param('id') id: string,
    @Body() body: { status: string; reason?: string },
    @GetUser() user: any
  ) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Invalid booking id');
    }

    const venueOwnerId = new Types.ObjectId(user.userId);
    const bookingId = new Types.ObjectId(id);

    // Get venue owner profile
    const VenueOwnerProfile = this.seatBookingModel.db.model('VenueOwnerProfile');
    const venueOwnerProfile: any = await VenueOwnerProfile.findOne({ user: venueOwnerId }).lean();

    if (!venueOwnerProfile) {
      throw new NotFoundException('Venue owner profile not found');
    }

    const venueOwnerProfileId = new Types.ObjectId(venueOwnerProfile._id);

    // Try to find and update in each collection
    const [seat, table, booth] = await Promise.all([
      this.seatBookingModel.findById(bookingId).populate('eventId', 'createdBy createdByRole venueOwnerId').lean(),
      this.tableBookingModel.findById(bookingId).populate('eventId', 'createdBy createdByRole venueOwnerId').lean(),
      this.boothBookingModel.findById(bookingId).populate('eventId', 'createdBy createdByRole venueOwnerId').lean(),
    ]);

    const booking: any = seat || table || booth;
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    // Verify ownership (either created by or assigned to)
    const event = booking.eventId;
    const isOwner = !!event && (
      (String(event.createdBy) === String(venueOwnerId) && (
        (typeof event.createdByRole === 'string' && event.createdByRole.toLowerCase?.() === 'venue_owner') ||
        (typeof (event as any).createdByType === 'string' && (event as any).createdByType.toLowerCase?.() === 'venue_owner')
      )) ||
      (event.venueOwnerId && String(event.venueOwnerId) === String(venueOwnerProfileId))
    );
    
    if (!isOwner) {
      throw new NotFoundException('Booking not found');
    }

    // Update status in the appropriate collection
    if (seat) {
      await this.seatBookingModel.findByIdAndUpdate(bookingId, { 
        status: body.status,
        ...(body.reason && { cancellationReason: body.reason })
      });
    } else if (table) {
      await this.tableBookingModel.findByIdAndUpdate(bookingId, { 
        status: body.status,
        ...(body.reason && { cancellationReason: body.reason })
      });
    } else if (booth) {
      await this.boothBookingModel.findByIdAndUpdate(bookingId, { 
        status: body.status,
        ...(body.reason && { cancellationReason: body.reason })
      });
    }

    return {
      message: 'Booking status updated successfully',
      booking: { _id: String(bookingId), status: body.status }
    };
  }
}
