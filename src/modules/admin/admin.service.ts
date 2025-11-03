import { BadRequestException, Injectable, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from 'src/infrastructure/database/schemas';
import {
  CombineBooking,
  CombineBookingDocument,
} from 'src/infrastructure/database/schemas/Booking.schema';
import {
  EquipmentPackageBooking,
  EquipmentPackageBookingDocument,
} from 'src/infrastructure/database/schemas/equipment-package-booking.schema';
import {
  ArtistBooking,
  ArtistBookingDocument,
} from 'src/infrastructure/database/schemas/artist-booking.schema';
import {
  ArtistProfile,
  ArtistProfileDocument,
} from 'src/infrastructure/database/schemas/artist-profile.schema';
import { EquipmentProviderService, CreateEquipmentProviderRequest } from '../equipment-provider/equipment-provider.service';
import { ArtistService } from '../artist/artist.service';
import { CommissionSetting, CommissionSettingDocument } from 'src/infrastructure/database/schemas/commission-setting.schema';
import { Payout, PayoutDocument } from 'src/infrastructure/database/schemas/payout.schema';
import { PaymentAudit, PaymentAuditDocument } from 'src/infrastructure/database/schemas/payment-audit.schema';

interface FilterOptions {
  page: number;
  limit: number;
  status?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
}

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(CombineBooking.name)
    private bookingModel: Model<CombineBookingDocument>,
    @InjectModel(EquipmentPackageBooking.name)
    private equipmentPackageBookingModel: Model<EquipmentPackageBookingDocument>,
    @InjectModel(ArtistBooking.name)
    private artistBookingModel: Model<ArtistBookingDocument>,
    @InjectModel(ArtistProfile.name)
    private artistProfileModel: Model<ArtistProfileDocument>,
    @InjectModel(User.name)
    private userModel: Model<User>,
    private equipmentProviderService: EquipmentProviderService,
    private artistService: ArtistService,
    @InjectModel(CommissionSetting.name)
    private commissionModel: Model<CommissionSettingDocument>,
    @InjectModel(Payout.name)
    private payoutModel: Model<PayoutDocument>,
    @InjectModel(PaymentAudit.name)
    private auditModel: Model<PaymentAuditDocument>,
  ) {}

  async createEquipmentProvider(data: CreateEquipmentProviderRequest, adminId: string) {
    return this.equipmentProviderService.createEquipmentProvider(data, adminId);
  }
//aa
 
  async getAllUpdateRequests() {
    return this.artistService.getPendingRequests();
  }

  async reviewProfileUpdateRequest(adminId: string, requestId: string, approve: boolean, comment?: string) {
    return this.artistService.reviewProflileUpdateRequest(adminId, requestId, approve, comment);
  }

  async reviewPortfolioItem(adminId: string, portfolioItemId: string, approve: boolean, reviewComment?: string) {
    return this.artistService.reviewPortfolioItem(adminId, portfolioItemId, approve, reviewComment);
  }

  async getArtistBookings(options: FilterOptions) {
    const { page, limit, status, search, startDate, endDate } = options;
    const skip = (page - 1) * limit;

    // Base filter for artist bookings
    const filter: any = {
      $and: [
        {
          $or: [
            { bookingType: 'artist' },
            { bookingType: 'artist_only' },
            { bookingType: 'combined', artistBookingId: { $ne: null } }
          ]
        }
      ]
    };

    if (status && status !== 'all') {
      filter.$and.push({ status: status });
    }

    if (search) {
      filter.$and.push({
        $or: [
          { 'userDetails.name': { $regex: search, $options: 'i' } },
          { 'userDetails.email': { $regex: search, $options: 'i' } },
          { 'venueDetails.city': { $regex: search, $options: 'i' } },
          { 'venueDetails.state': { $regex: search, $options: 'i' } },
          { eventDescription: { $regex: search, $options: 'i' } },
        ]
      });
    }

    if (startDate || endDate) {
      const dateFilter: any = {};
      if (startDate) dateFilter.$gte = startDate;
      if (endDate) dateFilter.$lte = endDate;
      filter.$and.push({ date: dateFilter });
    }

    // Fetch combined/global bookings (existing)
    const [combinedBookings, combinedTotal] = await Promise.all([
      this.bookingModel
        .find(filter)
        .populate([
          {
            path: 'artistBookingId',
            populate: [
              {
                path: 'artistId',
                select: 'firstName lastName email phoneNumber profilePicture',
                populate: {
                  path: 'roleProfile',
                  select: 'stageName artistType about pricePerHour profileImage availability gender yearsOfExperience skills',
                  model: 'ArtistProfile'
                },
              },
            ],
          },
          {
            path: 'bookedBy',
            select: 'firstName lastName email phoneNumber',
          },
        ])
        .sort({ createdAt: -1 })
        .lean(),
      this.bookingModel.countDocuments(filter),
    ]);

    // Fetch event-only artist bookings that are not tied to CombineBooking
    const eventArtistFilter: any = {
      ...(status && status !== 'all' ? { status } : {}),
      ...(startDate || endDate
        ? {
            date: {
              ...(startDate ? { $gte: startDate } : {}),
              ...(endDate ? { $lte: endDate } : {}),
            },
          }
        : {}),
      // not linked to combined booking
      $or: [{ combineBookingRef: null }, { combineBookingRef: { $exists: false } }],
      // must be related to an event
      eventId: { $ne: null },
    };

    // Apply limited search on event artist bookings (on eventDescription/venue and partial user email via population)
    if (search) {
      eventArtistFilter.$or = [
        ...(eventArtistFilter.$or || []),
        { eventDescription: { $regex: search, $options: 'i' } },
        { 'venueDetails.city': { $regex: search, $options: 'i' } },
        { 'venueDetails.state': { $regex: search, $options: 'i' } },
      ];
    }

    const rawEventArtistBookings: any[] = await this.artistBookingModel
      .find(eventArtistFilter)
      .populate([
        {
          path: 'artistId',
          select: 'firstName lastName email phoneNumber profilePicture roleProfile',
          populate: {
            path: 'roleProfile',
            select: 'stageName artistType about pricePerHour profileImage availability gender yearsOfExperience skills',
            model: 'ArtistProfile',
          },
        },
        { path: 'bookedBy', select: 'firstName lastName email phoneNumber' },
      ])
      .sort({ createdAt: -1 })
      .lean();

    // Transform event-only artist bookings to CombineBooking-like shape for UI compatibility
    const transformedEventArtistBookings = rawEventArtistBookings.map((ab: any) => ({
      _id: ab._id,
      artistBookingId: {
        _id: ab._id,
        artistId: ab.artistId,
        date: ab.date,
        startTime: ab.startTime,
        endTime: ab.endTime,
        price: ab.totalPrice ?? ab.price ?? 0,
        artistType: ab.artistType,
      },
      bookedBy: ab.bookedBy,
      date: ab.date,
      startTime: ab.startTime,
      endTime: ab.endTime,
      status: ab.status,
      totalPrice: ab.totalPrice ?? ab.price ?? 0,
      bookingType: 'artist',
      userDetails: undefined,
      venueDetails: ab.venueDetails,
      eventDescription: ab.eventDescription,
      createdAt: ab.createdAt,
    }));

    // Merge, sort, and paginate in-memory
    const merged = [...combinedBookings, ...transformedEventArtistBookings].sort(
      (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const total = combinedTotal + transformedEventArtistBookings.length;
    const bookings = merged.slice(skip, skip + limit);

    // Calculate business metrics
  // Metrics from combined bookings for now (can be enhanced to include event-only artist bookings)
  const metrics = await this.calculateArtistBookingMetrics(filter);

    return {
      bookings,
      metrics,
      pagination: {
        current: page,
        total: Math.ceil(total / limit),
        count: total,
        perPage: limit,
      },
    };
  }

  async calculateArtistBookingMetrics(filter: any) {
    const [
      totalRevenue,
      statusBreakdown,
      artistTypeBreakdown,
      monthlyRevenue,
      topArtists,
      avgBookingValue
    ] = await Promise.all([
      // Total revenue from artist bookings
      this.bookingModel.aggregate([
        { $match: filter },
        { $group: { _id: null, total: { $sum: '$totalPrice' } } }
      ]),
      
      // Status breakdown
      this.bookingModel.aggregate([
        { $match: filter },
        { $group: { _id: '$status', count: { $sum: 1 }, revenue: { $sum: '$totalPrice' } } }
      ]),
      
      // Artist type breakdown
      this.bookingModel.aggregate([
        { $match: filter },
        { 
          $lookup: {
            from: 'artistbookings',
            localField: 'artistBookingId',
            foreignField: '_id',
            as: 'artistBooking'
          }
        },
        { $unwind: '$artistBooking' },
        { $group: { _id: '$artistBooking.artistType', count: { $sum: 1 }, revenue: { $sum: '$totalPrice' } } }
      ]),
      
      // Monthly revenue trend (last 6 months)
      this.bookingModel.aggregate([
        { $match: filter },
        {
          $group: {
            _id: {
              year: { $year: { $dateFromString: { dateString: '$date' } } },
              month: { $month: { $dateFromString: { dateString: '$date' } } }
            },
            revenue: { $sum: '$totalPrice' },
            bookings: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': -1, '_id.month': -1 } },
        { $limit: 6 }
      ]),
      
      // Top performing artists
      this.bookingModel.aggregate([
        { $match: filter },
        { 
          $lookup: {
            from: 'artistbookings',
            localField: 'artistBookingId',
            foreignField: '_id',
            as: 'artistBooking'
          }
        },
        { $unwind: '$artistBooking' },
        {
          $lookup: {
            from: 'users',
            localField: 'artistBooking.artistId',
            foreignField: '_id',
            as: 'artist'
          }
        },
        { $unwind: '$artist' },
        {
          $lookup: {
            from: 'artistprofiles',
            localField: 'artist.roleProfile',
            foreignField: '_id',
            as: 'artistProfile'
          }
        },
        { $unwind: '$artistProfile' },
        {
          $group: {
            _id: '$artistBooking.artistId',
            artistName: { $first: '$artistProfile.stageName' },
            totalRevenue: { $sum: '$totalPrice' },
            totalBookings: { $sum: 1 },
            avgRating: { $avg: '$rating' }
          }
        },
        { $sort: { totalRevenue: -1 } },
        { $limit: 10 }
      ]),
      
      // Average booking value
      this.bookingModel.aggregate([
        { $match: filter },
        { $group: { _id: null, avgValue: { $avg: '$totalPrice' } } }
      ])
    ]);

    return {
      totalRevenue: totalRevenue[0]?.total || 0,
      statusBreakdown,
      artistTypeBreakdown,
      monthlyRevenue,
      topArtists,
      avgBookingValue: avgBookingValue[0]?.avgValue || 0
    };
  }

  // Equipment Booking Management with Enhanced Business Metrics
  async getEquipmentBookings(options: FilterOptions) {
    const { page, limit, status, search, startDate, endDate } = options;
    const skip = (page - 1) * limit;

    // Build filter query for equipment bookings (including packages and individual equipment)
    const filter: any = {
      $and: [
        {
          $or: [
            { bookingType: 'equipment' },
            { bookingType: 'combined', equipmentBookingId: { $ne: null } }
          ]
        }
      ]
    };

    if (status && status !== 'all') {
      filter.status = status;
    }

    if (search) {
      filter.$and.push({
        $or: [
          { 'userDetails.name': { $regex: search, $options: 'i' } },
          { 'userDetails.email': { $regex: search, $options: 'i' } },
          { 'venueDetails.city': { $regex: search, $options: 'i' } },
          { eventDescription: { $regex: search, $options: 'i' } },
        ]
      });
    }

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = startDate;
      if (endDate) filter.date.$lte = endDate;
    }

    // Get combined bookings with equipment - using step by step population for better control
    const combinedBookingsQuery = await this.bookingModel
      .find(filter)
      .populate({
        path: 'equipmentBookingId',
        populate: [
          {
            path: 'equipments.equipmentId',
            select: 'name category price specifications images',
          },
          {
            path: 'packages',
            select: 'name description totalPrice coverImage items createdBy',
            populate: [
              {
                path: 'createdBy',
                select: 'firstName lastName email phoneNumber roleProfile',
                populate: {
                  path: 'roleProfile',
                  select: 'companyName businessDescription profileImage',
                },
              },
              {
                path: 'items.equipmentId',
                select: 'name category pricePerDay specifications images',
              }
            ],
          }
        ],
      })
      .populate({
        path: 'bookedBy',
        select: 'firstName lastName email phoneNumber',
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Math.ceil(limit / 2))
      .lean();

    // Populate customPackages separately as the nested population wasn't working
    const combinedBookings = await this.bookingModel.populate(combinedBookingsQuery, [
      {
        path: 'equipmentBookingId.customPackages',
        model: 'CustomEquipmentPackage',
        select: 'name description items totalPricePerDay createdBy',
      }
    ]);
    
    // Then populate the nested equipment items
    const finalCombinedBookings = await this.bookingModel.populate(combinedBookings, [
      {
        path: 'equipmentBookingId.customPackages.items.equipmentId',
        model: 'Equipment',
        select: 'name category pricePerDay specifications images',
      },
      {
        path: 'equipmentBookingId.customPackages.createdBy',
        model: 'User',
        select: 'firstName lastName email phoneNumber',
      }
    ]);

    const [packageBookings, totalCombined, totalPackage] = await Promise.all([
        
      // Also get standalone equipment package bookings
      this.equipmentPackageBookingModel
        .find({
          ...(status && status !== 'all' ? { status } : {}),
          ...(startDate || endDate ? {
            startDate: {
              ...(startDate ? { $gte: startDate } : {}),
              ...(endDate ? { $lte: endDate } : {})
            }
          } : {}),
        })
        .populate([
          {
            path: 'packageId',
            select: 'name description totalPrice coverImage items createdBy',
            populate: [
              {
                path: 'createdBy',
                select: 'firstName lastName email phoneNumber roleProfile',
                populate: {
                  path: 'roleProfile',
                  select: 'companyName businessDescription profileImage',
                },
              },
              {
                path: 'items.equipmentId',
                select: 'name category pricePerDay specifications images',
              }
            ],
          },
          {
            path: 'bookedBy',
            select: 'firstName lastName email phoneNumber',
          },
        ])
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Math.ceil(limit / 2))
        .lean(),
        
      this.bookingModel.countDocuments(filter),
      this.equipmentPackageBookingModel.countDocuments({
        ...(status && status !== 'all' ? { status } : {}),
        ...(startDate || endDate ? {
          startDate: {
            ...(startDate ? { $gte: startDate } : {}),
            ...(endDate ? { $lte: endDate } : {})
          }
        } : {}),
      })
    ]);

    // Combine and format bookings
    const allBookings = [
      ...finalCombinedBookings.map((booking: any) => ({
        ...booking,
        bookingSource: 'combined',
        displayDate: booking.date,
      })),
      ...packageBookings.map((booking: any) => ({
        ...booking,
        bookingSource: 'standalone',
        displayDate: booking.startDate,
        bookingType: 'equipment',
      }))
    ];

    // Sort by creation date
    allBookings.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Calculate business metrics
    const metrics = await this.calculateEquipmentBookingMetrics();

    return {
      bookings: allBookings,
      metrics,
      pagination: {
        current: page,
        total: Math.ceil((totalCombined + totalPackage) / limit),
        count: totalCombined + totalPackage,
        perPage: limit,
      },
    };
  }

  async calculateEquipmentBookingMetrics() {
    const [
      combinedEquipmentRevenue,
      packageRevenue,
      equipmentTypeBreakdown,
      providerPerformance,
      monthlyTrends,
      utilizationStats
    ] = await Promise.all([
      // Revenue from combined bookings with equipment
      this.bookingModel.aggregate([
        { 
          $match: { 
            $or: [
              { bookingType: 'equipment' },
              { bookingType: 'combined', equipmentBookingId: { $ne: null } }
            ]
          } 
        },
        { $group: { _id: null, total: { $sum: '$totalPrice' } } }
      ]),
      
      // Revenue from standalone package bookings
      this.equipmentPackageBookingModel.aggregate([
        { $group: { _id: null, total: { $sum: '$totalPrice' } } }
      ]),
      
      // Equipment type/category breakdown
      this.equipmentPackageBookingModel.aggregate([
        {
          $lookup: {
            from: 'equipmentpackages',
            localField: 'packageId',
            foreignField: '_id',
            as: 'package'
          }
        },
        { $unwind: '$package' },
        {
          $unwind: '$package.items'
        },
        {
          $lookup: {
            from: 'equipment',
            localField: 'package.items.equipmentId',
            foreignField: '_id',
            as: 'equipment'
          }
        },
        { $unwind: '$equipment' },
        {
          $group: {
            _id: '$equipment.category',
            bookings: { $sum: 1 },
            revenue: { $sum: '$totalPrice' }
          }
        }
      ]),
      
      // Top equipment providers
      this.equipmentPackageBookingModel.aggregate([
        {
          $lookup: {
            from: 'equipmentpackages',
            localField: 'packageId',
            foreignField: '_id',
            as: 'package'
          }
        },
        { $unwind: '$package' },
        {
          $lookup: {
            from: 'users',
            localField: 'package.createdBy',
            foreignField: '_id',
            as: 'provider'
          }
        },
        { $unwind: '$provider' },
        {
          $lookup: {
            from: 'equipmentproviderprofiles',
            localField: 'provider.roleProfile',
            foreignField: '_id',
            as: 'providerProfile'
          }
        },
        { $unwind: '$providerProfile' },
        {
          $group: {
            _id: '$package.createdBy',
            providerName: { $first: '$providerProfile.companyName' },
            totalRevenue: { $sum: '$totalPrice' },
            totalBookings: { $sum: 1 },
            avgRating: { $avg: '$rating' }
          }
        },
        { $sort: { totalRevenue: -1 } },
        { $limit: 10 }
      ]),
      
      // Monthly booking trends
      this.equipmentPackageBookingModel.aggregate([
        {
          $group: {
            _id: {
              year: { $year: { $dateFromString: { dateString: '$startDate' } } },
              month: { $month: { $dateFromString: { dateString: '$startDate' } } }
            },
            revenue: { $sum: '$totalPrice' },
            bookings: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': -1, '_id.month': -1 } },
        { $limit: 6 }
      ]),
      
      // Equipment utilization stats
      this.equipmentPackageBookingModel.aggregate([
        {
          $group: {
            _id: null,
            avgDuration: { $avg: '$numberOfDays' },
            totalBookingDays: { $sum: '$numberOfDays' }
          }
        }
      ])
    ]);

    const totalRevenue = (combinedEquipmentRevenue[0]?.total || 0) + (packageRevenue[0]?.total || 0);

    return {
      totalRevenue,
      combinedEquipmentRevenue: combinedEquipmentRevenue[0]?.total || 0,
      packageRevenue: packageRevenue[0]?.total || 0,
      equipmentTypeBreakdown,
      providerPerformance,
      monthlyTrends,
      utilizationStats: utilizationStats[0] || { avgDuration: 0, totalBookingDays: 0 }
    };
  }

  // Legacy method for backward compatibility
  async getAllBookings(options: FilterOptions) {
    const { page, limit, status, search, startDate, endDate } = options;
    const skip = (page - 1) * limit;

    // Build filter query
    const filter: any = {};

    if (status && status !== 'all') {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        { 'userDetails.name': { $regex: search, $options: 'i' } },
        { 'userDetails.email': { $regex: search, $options: 'i' } },
        { 'venueDetails.city': { $regex: search, $options: 'i' } },
        { eventDescription: { $regex: search, $options: 'i' } },
      ];
    }

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = startDate;
      if (endDate) filter.date.$lte = endDate;
    }

    const [bookings, total] = await Promise.all([
      this.bookingModel
        .find(filter)
        .populate([
          {
            path: 'artistBookingId',
            populate: [
              {
                path: 'artistId',
                select: 'firstName lastName email phoneNumber roleProfile profilePicture',
                populate: {
                  path: 'roleProfile',
                  select: 'stageName artistType about pricePerHour profileImage',
                },
              },
            ],
          },
          {
            path: 'bookedBy',
            select: 'firstName lastName email phoneNumber',
          },
        ])
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.bookingModel.countDocuments(filter),
    ]);

    return {
      bookings,
      pagination: {
        current: page,
        total: Math.ceil(total / limit),
        count: total,
        perPage: limit,
      },
    };
  }

  async getAllEquipmentPackageBookings(options: FilterOptions) {
    const { page, limit, status, search, startDate, endDate } = options;
    const skip = (page - 1) * limit;

    // Build filter query
    const filter: any = {};

    if (status && status !== 'all') {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        { 'userDetails.name': { $regex: search, $options: 'i' } },
        { 'userDetails.email': { $regex: search, $options: 'i' } },
        { 'venueDetails.city': { $regex: search, $options: 'i' } },
        { eventDescription: { $regex: search, $options: 'i' } },
      ];
    }

    if (startDate || endDate) {
      filter.startDate = {};
      if (startDate) filter.startDate.$gte = startDate;
      if (endDate) filter.startDate.$lte = endDate;
    }

    const [bookings, total] = await Promise.all([
      this.equipmentPackageBookingModel
        .find(filter)
        .populate([
          {
            path: 'packageId',
            select: 'name description totalPrice coverImage items createdBy',
            populate: {
              path: 'createdBy',
              select: 'firstName lastName email phoneNumber companyName',
            },
          },
          {
            path: 'bookedBy',
            select: 'firstName lastName email phoneNumber',
          },
        ])
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.equipmentPackageBookingModel.countDocuments(filter),
    ]);

    return {
      bookings,
      pagination: {
        current: page,
        total: Math.ceil(total / limit),
        count: total,
        perPage: limit,
      },
    };
  }

  // Detailed combined booking with populated artist and equipment data and cost breakdown
  async getCombinedBookingDetails(id: string) {
    const booking: any = await this.bookingModel
      .findById(id)
      .populate([
        {
          path: 'artistBookingId',
          populate: [
            {
              path: 'artistId',
              select: 'firstName lastName email phoneNumber roleProfile profilePicture',
              populate: {
                path: 'roleProfile',
                select: 'stageName artistType about pricePerHour profileImage yearsOfExperience skills',
                model: 'ArtistProfile'
              },
            },
          ],
        },
        {
          path: 'equipmentBookingId',
          populate: [
            {
              path: 'equipments.equipmentId',
              select: 'name category pricePerDay specifications images',
              model: 'Equipment'
            },
            {
              path: 'packages',
              select: 'name description totalPrice coverImage items createdBy',
              populate: [
                {
                  path: 'createdBy',
                  select: 'firstName lastName email phoneNumber roleProfile',
                  populate: {
                    path: 'roleProfile',
                    select: 'companyName businessDescription profileImage',
                  },
                },
                {
                  path: 'items.equipmentId',
                  select: 'name category pricePerDay specifications images',
                }
              ],
            },
            {
              path: 'customPackages',
              select: 'name description items totalPricePerDay createdBy',
              populate: [
                { path: 'items.equipmentId', select: 'name category pricePerDay specifications images' },
                { path: 'createdBy', select: 'firstName lastName email phoneNumber' }
              ]
            }
          ],
        },
        {
          path: 'bookedBy',
          select: 'firstName lastName email phoneNumber',
        },
      ])
      .lean();

    if (!booking) throw new BadRequestException('Booking not found');

    const artistCost = booking.artistBookingId?.totalPrice || booking.artistBookingId?.price || 0;
    const equipmentCost = booking.equipmentBookingId?.totalPrice || 0;
    const subtotal = artistCost + equipmentCost;
    const platformFee = Math.round(subtotal * 0.05 * 100) / 100; // 5% fee estimate
    const total = subtotal + platformFee;

    const details = {
      booking,
      breakdown: {
        artistCost,
        equipmentCost,
        subtotal,
        platformFee,
        total,
        currency: 'KWD',
      },
      assignments: {
        artist: booking.artistBookingId?.artistId || null,
        equipment: {
          equipments: booking.equipmentBookingId?.equipments || [],
          packages: booking.equipmentBookingId?.packages || [],
          customPackages: booking.equipmentBookingId?.customPackages || [],
        }
      },
      timeline: [
        { label: 'Created', at: booking.createdAt },
        { label: 'Status', value: booking.status },
      ],
    };

    return details;
  }

  // Detailed equipment package booking with breakdown
  async getEquipmentPackageBookingDetails(id: string) {
    const booking: any = await this.equipmentPackageBookingModel
      .findById(id)
      .populate([
        {
          path: 'packageId',
          select: 'name description totalPrice coverImage items createdBy',
          populate: [
            {
              path: 'createdBy',
              select: 'firstName lastName email phoneNumber roleProfile roleProfileRef',
              populate: { path: 'roleProfile', select: 'companyName businessDescription profileImage', model: 'EquipmentProviderProfile' },
            },
            { path: 'items.equipmentId', select: 'name category pricePerDay specifications images' }
          ]
        },
        { path: 'bookedBy', select: 'firstName lastName email phoneNumber' }
      ])
      .lean();

    if (!booking) throw new BadRequestException('Equipment package booking not found');

    const equipmentCost = booking.totalPrice || 0;
    const subtotal = equipmentCost;
    const platformFee = Math.round(subtotal * 0.05 * 100) / 100;
    const total = subtotal + platformFee;

    return {
      booking,
      breakdown: {
        artistCost: 0,
        equipmentCost,
        subtotal,
        platformFee,
        total,
        currency: 'KWD',
      },
      assignments: {
        artist: null,
        equipment: {
          equipments: booking.packageId?.items || [],
          provider: booking.packageId?.createdBy || null,
        }
      },
      timeline: [
        { label: 'Created', at: booking.createdAt },
        { label: 'Status', value: booking.status },
      ],
    };
  }

  // Payment Management
  async getArtistPayments(options: FilterOptions) {
    const { page, limit, status, search, startDate, endDate } = options;
    const skip = (page - 1) * limit;

    // Combined bookings that involve artists
    const combinedFilter: any = {
      status: 'confirmed',
      $or: [
        { bookingType: 'artist' },
        { bookingType: 'artist_only' },
        { bookingType: 'combined', artistBookingId: { $ne: null } },
      ],
    };
    if (search) {
      combinedFilter.$or = [
        { 'userDetails.name': { $regex: search, $options: 'i' } },
        { 'userDetails.email': { $regex: search, $options: 'i' } },
      ];
    }
    if (startDate || endDate) {
      combinedFilter.date = {};
      if (startDate) combinedFilter.date.$gte = startDate;
      if (endDate) combinedFilter.date.$lte = endDate;
    }

    // Event-only artist bookings not tied to CombineBooking
    const eventArtistFilter: any = {
      ...(status && status !== 'all' ? { status } : {}),
      ...(startDate || endDate
        ? {
            date: {
              ...(startDate ? { $gte: startDate } : {}),
              ...(endDate ? { $lte: endDate } : {}),
            },
          }
        : {}),
      $or: [{ combineBookingRef: null }, { combineBookingRef: { $exists: false } }],
      eventId: { $ne: null },
    };
    if (search) {
      eventArtistFilter.$or = [
        ...(eventArtistFilter.$or || []),
        { eventDescription: { $regex: search, $options: 'i' } },
        { 'venueDetails.city': { $regex: search, $options: 'i' } },
        { 'venueDetails.state': { $regex: search, $options: 'i' } },
      ];
    }

    const [combinedPaymentsAll, combinedCount, rawEventArtistBookings] = await Promise.all([
      this.bookingModel
        .find(combinedFilter)
        .populate([
          {
            path: 'artistBookingId',
            populate: [
              {
                path: 'artistId',
                select: 'firstName lastName email phoneNumber roleProfile profilePicture roleProfileRef',
                populate: { path: 'roleProfile', select: 'stageName artistType pricePerHour profileImage', model: 'ArtistProfile' },
              },
            ],
          },
          { path: 'bookedBy', select: 'firstName lastName email phoneNumber' },
        ])
        .select('artistBookingId bookedBy date totalPrice status createdAt userDetails')
        .sort({ createdAt: -1 })
        .lean(),
      this.bookingModel.countDocuments(combinedFilter),
      this.artistBookingModel
        .find(eventArtistFilter)
        .populate([
          {
            path: 'artistId',
            select: 'firstName lastName email phoneNumber profilePicture roleProfile roleProfileRef',
            populate: { path: 'roleProfile', select: 'stageName artistType pricePerHour profileImage', model: 'ArtistProfile' },
          },
          { path: 'bookedBy', select: 'firstName lastName email phoneNumber' },
        ])
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    const transformedEventArtistPayments = rawEventArtistBookings.map((ab: any) => ({
      _id: ab._id,
      artistBookingId: {
        _id: ab._id,
        artistId: ab.artistId, // Include the full populated artistId with roleProfile
        date: ab.date,
        price: ab.totalPrice ?? ab.price ?? 0,
      },
      bookedBy: ab.bookedBy,
      userDetails: {
        name: [ab.bookedBy?.firstName, ab.bookedBy?.lastName].filter(Boolean).join(' '),
        email: ab.bookedBy?.email,
        phone: ab.bookedBy?.phoneNumber,
      },
      date: ab.date,
      status: ab.status,
      totalPrice: ab.totalPrice ?? ab.price ?? 0,
      createdAt: ab.createdAt,
    }));

    // Merge and sort; then paginate in-memory
    const mergedAll = [...combinedPaymentsAll, ...transformedEventArtistPayments].sort(
      (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const total = mergedAll.length;
    const pageItems = mergedAll.slice(skip, skip + limit);

    // Attach payout info
    const bookingIds = pageItems.map((p: any) => p._id).filter(Boolean);
    const payouts = bookingIds.length
      ? await this.payoutModel
          .find({ 
            $or: [
              { bookingId: { $in: bookingIds } },
              { bookingId: { $in: bookingIds.map(id => String(id)) } }
            ],
            recipientType: 'artist' 
          })
          .select('bookingId recipientType recipientId roleProfileId recipientName grossAmount commissionPercentage netAmount method reference notes payoutStatus status currency createdAt')
          .lean()
      : [];
    const payoutMap = new Map<string, any>(payouts.map(p => [String(p.bookingId), p]));
    const enrichedPayments = pageItems.map((p: any) => ({ ...p, payout: payoutMap.get(String(p._id)) || null }));

    // Total earnings across both sources
    const totalEarnings = mergedAll.reduce((sum: number, p: any) => sum + (p.totalPrice || 0), 0);

    return {
      payments: enrichedPayments,
      totalEarnings,
      pagination: { current: page, total: Math.ceil(total / limit), count: total, perPage: limit },
    };
  }

  async getEquipmentProviderPayments(options: FilterOptions) {
    const { page, limit, status, search, startDate, endDate } = options;
    const skip = (page - 1) * limit;

    // Get equipment payments from standalone equipment bookings
    const equipmentFilter: any = { status: 'completed' };

    if (search) {
      equipmentFilter.$or = [
        { 'userDetails.name': { $regex: search, $options: 'i' } },
        { 'userDetails.email': { $regex: search, $options: 'i' } },
      ];
    }

    if (startDate || endDate) {
      equipmentFilter.startDate = {};
      if (startDate) equipmentFilter.startDate.$gte = startDate;
      if (endDate) equipmentFilter.startDate.$lte = endDate;
    }

    // Get equipment payments from combined bookings
    const combinedFilter: any = { 
      status: 'confirmed',
      $or: [
        { bookingType: 'equipment' },
        { bookingType: 'combined', equipmentBookingId: { $ne: null } }
      ]
    };

    if (startDate || endDate) {
      combinedFilter.date = {};
      if (startDate) combinedFilter.date.$gte = startDate;
      if (endDate) combinedFilter.date.$lte = endDate;
    }

    const [standalonePayments, combinedPayments] = await Promise.all([
      // Standalone equipment bookings
      this.equipmentPackageBookingModel
        .find(equipmentFilter)
        .populate([
          {
            path: 'packageId',
            select: 'name description totalPrice coverImage createdBy',
            populate: {
              path: 'createdBy',
              select: 'firstName lastName email phoneNumber roleProfile roleProfileRef',
              populate: {
                path: 'roleProfile',
                select: 'companyName businessDescription profileImage',
                model: 'EquipmentProviderProfile',
              },
            },
          },
          {
            path: 'bookedBy',
            select: 'firstName lastName email phoneNumber',
          },
        ])
        .select('packageId bookedBy startDate endDate totalPrice status createdAt userDetails')
        .lean(),

      // Combined bookings with equipment
      this.bookingModel
        .find(combinedFilter)
        .populate([
          {
            path: 'equipmentBookingId',
            populate: [
              {
                path: 'packages',
                select: 'name description totalPrice coverImage createdBy',
                populate: {
                  path: 'createdBy',
                  select: 'firstName lastName email phoneNumber roleProfile roleProfileRef',
                  populate: {
                    path: 'roleProfile',
                    select: 'companyName businessDescription profileImage',
                    model: 'EquipmentProviderProfile',
                  },
                },
              },
              {
                path: 'customPackages',
                select: 'name description items totalPricePerDay createdBy',
                populate: [
                  { 
                    path: 'createdBy', 
                    select: 'firstName lastName email phoneNumber roleProfile roleProfileRef', 
                    populate: { 
                      path: 'roleProfile', 
                      select: 'companyName businessDescription profileImage',
                      model: 'EquipmentProviderProfile',
                    } 
                  }
                ]
              }
            ],
          },
          {
            path: 'bookedBy',
            select: 'firstName lastName email phoneNumber',
          },
        ])
        .select('equipmentBookingId bookedBy date totalPrice status createdAt userDetails')
        .lean(),
    ]);

    // Combine and format all payments
    // Expand combined bookings into rows per package and per custom package
    const expandedCombined: any[] = [];
    for (const cb of combinedPayments) {
      const _cb: any = cb as any;
      const eq: any = _cb.equipmentBookingId || {};
      const bookedBy = _cb.bookedBy;
      const base = {
        bookedBy,
        userDetails: _cb.userDetails,
        createdAt: _cb.createdAt ?? _cb.date,
        status: _cb.status,
        paymentStatus: _cb.paymentStatus ?? _cb.status,
        paymentType: 'combined',
        displayDate: _cb.date,
        startDate: _cb.date,
        endDate: _cb.date,
      } as any;

      // Regular packages
      (eq.packages || []).forEach((pkg: any) => {
        expandedCombined.push({
          ...base,
          packageId: pkg,
          totalPrice: pkg.totalPrice ?? _cb.totalPrice ?? 0,
        });
      });

      // Custom packages
      (eq.customPackages || []).forEach((cp: any) => {
        expandedCombined.push({
          ...base,
          // adapt shape so frontend can reuse packageId accessors
          packageId: {
            _id: cp._id,
            name: cp.name || 'Custom Package',
            description: cp.description,
            totalPrice: cp.totalPricePerDay ?? 0,
            coverImage: undefined,
            createdBy: cp.createdBy,
          },
          totalPrice: cp.totalPricePerDay ?? 0,
        });
      });
    }

    const allPayments = [
      ...standalonePayments.map((payment: any) => ({
        ...payment,
        paymentType: 'standalone',
        displayDate: payment.startDate,
      })),
      ...expandedCombined,
    ];

    // Apply search filter to combined results if needed
    let filteredPayments = allPayments;
    if (search) {
      filteredPayments = allPayments.filter((payment: any) => 
        payment.userDetails?.name?.toLowerCase().includes(search.toLowerCase()) ||
        payment.userDetails?.email?.toLowerCase().includes(search.toLowerCase()) ||
        payment.bookedBy?.firstName?.toLowerCase().includes(search.toLowerCase()) ||
        payment.bookedBy?.lastName?.toLowerCase().includes(search.toLowerCase())
      );
    }

    // Sort by creation date
    filteredPayments.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Attach payout info to each payment (one payout per booking for equipment)
    const bookingIds = filteredPayments.map((p: any) => p._id).filter(Boolean);
    const payouts = bookingIds.length
      ? await this.payoutModel
          .find({ 
            $or: [
              { bookingId: { $in: bookingIds } },
              { bookingId: { $in: bookingIds.map(id => String(id)) } }
            ],
            recipientType: 'equipment' 
          })
          .select('bookingId recipientType recipientId roleProfileId recipientName grossAmount commissionPercentage netAmount method reference notes payoutStatus status currency createdAt')
          .lean()
      : [];
    const payoutMap = new Map<string, any>(payouts.map(p => [String(p.bookingId), p]));
    filteredPayments = filteredPayments.map((p: any) => ({ ...p, payout: payoutMap.get(String(p._id)) || null }));

    // Apply pagination
    const total = filteredPayments.length;
    const paginatedPayments = filteredPayments.slice(skip, skip + limit);

    // Calculate total earnings
    const totalEarnings = filteredPayments.reduce((sum, payment) => sum + (payment.totalPrice || 0), 0);

    return {
      payments: paginatedPayments,
      totalEarnings,
      pagination: {
        current: page,
        total: Math.ceil(total / limit),
        count: total,
        perPage: limit,
      },
    };
  }

  // ========== Finance: Commission Settings ==========
  async getCommissionSettings(scope: 'artist' | 'equipment' | 'global' = 'global') {
    const doc = await this.commissionModel.findOne({ scope }).lean();
    if (doc) return doc;
    // Provide sensible defaults if not set
    return { _id: undefined, scope, percentage: 10 } as Partial<CommissionSetting> as any;
  }

  async updateCommissionSettings(
    userId: string,
    payload: { scope: 'artist' | 'equipment' | 'global'; percentage: number }
  ) {
    const { scope, percentage } = payload;
    if (percentage < 0 || percentage > 100) throw new BadRequestException('Percentage must be between 0 and 100');
    const updated = await this.commissionModel.findOneAndUpdate(
      { scope },
      { scope, percentage, updatedBy: userId },
      { new: true, upsert: true }
    ).lean();
    await this.auditModel.create({
      action: 'commission_update',
      entityType: scope,
      details: { percentage },
      performedBy: userId,
    });
    return updated;
  }

  private async resolveCommission(scope: 'artist' | 'equipment') {
    const doc = (await this.commissionModel.findOne({ scope }).lean())
      || (await this.commissionModel.findOne({ scope: 'global' }).lean());
    return doc?.percentage ?? 10;
  }

  // ========== Finance: Payouts ==========
  async createPayout(
    userId: string,
    data: {
      recipientType: 'artist' | 'equipment';
      recipientId: string;
      bookingId?: string;
      grossAmount: number;
      commissionPercentage?: number;
      method?: 'manual' | 'bank_transfer' | 'cash' | 'other';
      reference?: string;
      notes?: string;
      currency?: string;
    }
  ) {
    if (data.grossAmount <= 0) throw new BadRequestException('Amount must be > 0');
    
    const commission = typeof data.commissionPercentage === 'number'
      ? data.commissionPercentage
      : await this.resolveCommission(data.recipientType);
    const net = Math.max(0, Number((data.grossAmount * (1 - commission / 100)).toFixed(3)));

    // Fetch user and profile information
    const user = await this.userModel.findById(data.recipientId)
      .populate('roleProfile')
      .lean();
    
    if (!user) throw new BadRequestException('Recipient user not found');

    let roleProfileId: any = null;
    let recipientName = 'N/A';

    if (data.recipientType === 'artist') {
      roleProfileId = user.roleProfile?._id || user.roleProfile;
      const profile = user.roleProfile as any;
      recipientName = profile?.stageName || 
        [user.firstName, user.lastName].filter(Boolean).join(' ') || 
        'Artist';
    } else if (data.recipientType === 'equipment') {
      roleProfileId = user.roleProfile?._id || user.roleProfile;
      const profile = user.roleProfile as any;
      recipientName = profile?.companyName || 
        [user.firstName, user.lastName].filter(Boolean).join(' ') || 
        'Equipment Provider';
    }

    // Enforce single payout per booking x recipient; update if exists
    const existing = data.bookingId
      ? await this.payoutModel.findOne({ 
          bookingId: data.bookingId, 
          recipientType: data.recipientType, 
          recipientId: data.recipientId 
        }).lean()
      : null;

    if (existing) {
      const updated = await this.payoutModel.findByIdAndUpdate(
        existing._id,
        {
          $set: {
            grossAmount: data.grossAmount,
            commissionPercentage: commission,
            netAmount: net,
            method: data.method ?? 'manual',
            reference: data.reference,
            notes: data.notes,
            currency: data.currency ?? 'KWD',
            status: 'recorded',
            payoutStatus: 'paid',
            roleProfileId,
            recipientName,
          }
        },
        { new: true }
      ).lean();

      await this.auditModel.create({
        action: 'payout_update',
        entityType: data.recipientType,
        entityId: updated?._id,
        details: { 
          bookingId: data.bookingId, 
          grossAmount: data.grossAmount, 
          netAmount: net, 
          commission,
          recipientName,
          method: data.method ?? 'manual',
          reference: data.reference,
          payoutStatus: 'paid',
        },
        performedBy: userId,
      });
      return updated;
    }

    const doc = await this.payoutModel.create({
      recipientType: data.recipientType,
      recipientId: data.recipientId,
      roleProfileId,
      recipientName,
      bookingId: data.bookingId,
      grossAmount: data.grossAmount,
      commissionPercentage: commission,
      netAmount: net,
      method: data.method ?? 'manual',
      reference: data.reference,
      notes: data.notes,
      currency: data.currency ?? 'KWD',
      payoutStatus: 'paid',
      createdBy: userId,
    });

    await this.auditModel.create({
      action: 'payout_record',
      entityType: data.recipientType,
      entityId: doc._id,
      details: { 
        bookingId: data.bookingId, 
        grossAmount: data.grossAmount, 
        netAmount: net, 
        commission,
        recipientName,
        method: data.method ?? 'manual',
        reference: data.reference,
        payoutStatus: 'paid',
      },
      performedBy: userId,
    });
    return doc.toObject();
  }

  async listPayouts(query: {
    recipientType?: 'artist' | 'equipment';
    recipientId?: string;
    page?: number; limit?: number;
  }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const filter: any = {};
    if (query.recipientType) filter.recipientType = query.recipientType;
    if (query.recipientId) filter.recipientId = query.recipientId;
    const [items, total] = await Promise.all([
      this.payoutModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate({
          path: 'recipientId',
          select: 'firstName lastName email phoneNumber profilePicture roleProfile roleProfileRef',
          populate: [
            { 
              path: 'roleProfile', 
              select: 'stageName companyName profileImage artistType businessDescription',
            }
          ]
        })
        .populate({
          path: 'roleProfileId',
          select: 'stageName companyName profileImage artistType businessDescription'
        })
        .lean(),
      this.payoutModel.countDocuments(filter),
    ]);

    const payouts = items.map((it: any) => {
      const u = it.recipientId as any;
      const profile = it.roleProfileId || u?.roleProfile;
      
      // Use cached recipientName or build from user/profile data
      const recipientName = it.recipientName || 
        profile?.stageName || 
        profile?.companyName || 
        [u?.firstName, u?.lastName].filter(Boolean).join(' ') || 
        'N/A';
      
      const profileImage = profile?.profileImage || u?.profilePicture;
      const commissionAmount = Number((it.grossAmount * (it.commissionPercentage / 100)).toFixed(3));

      return { 
        ...it, 
        recipientName,
        profileImage,
        commissionAmount,
        payoutStatus: it.payoutStatus || 'paid',
        recipientDetails: {
          email: u?.email,
          phone: u?.phoneNumber,
          type: it.recipientType,
          artistType: profile?.artistType,
          companyName: profile?.companyName,
          stageName: profile?.stageName,
        }
      };
    });

    return {
      payouts,
      pagination: { current: page, total: Math.ceil(total / limit), count: total, perPage: limit },
    };
  }

  async listPaymentAudits(query: { action?: string; page?: number; limit?: number }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const filter: any = {};
    if (query.action) filter.action = query.action;
    const [items, total] = await Promise.all([
      this.auditModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.auditModel.countDocuments(filter),
    ]);
    return {
      audits: items,
      pagination: { current: page, total: Math.ceil(total / limit), count: total, perPage: limit },
    };
  }
}
