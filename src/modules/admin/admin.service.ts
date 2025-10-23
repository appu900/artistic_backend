import { BadRequestException, Injectable } from '@nestjs/common';
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
    private equipmentProviderService: EquipmentProviderService,
    private artistService: ArtistService,
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

    const [bookings, total] = await Promise.all([
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
        .skip(skip)
        .limit(limit)
        .lean(),
      this.bookingModel.countDocuments(filter),
    ]);

    // Calculate business metrics
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
                  select: 'companyName businessDescription',
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
                  select: 'companyName businessDescription',
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

  // Payment Management
  async getArtistPayments(options: FilterOptions) {
    const { page, limit, status, search, startDate, endDate } = options;
    const skip = (page - 1) * limit;

    // Build filter query for confirmed bookings that involve artists
    const filter: any = { 
      status: 'confirmed', 
      $or: [
        { bookingType: 'artist' },
        { bookingType: 'artist_only' },
        { bookingType: 'combined', artistBookingId: { $ne: null } }
      ]
    };

    // Note: paymentStatus might need to be added to schema or handled differently
    if (status && status !== 'all') {
      // For now, we'll filter by booking status since paymentStatus may not exist
      // This can be updated when paymentStatus is added to the schema
    }

    if (search) {
      filter.$or = [
        { 'userDetails.name': { $regex: search, $options: 'i' } },
        { 'userDetails.email': { $regex: search, $options: 'i' } },
      ];
    }

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = startDate;
      if (endDate) filter.date.$lte = endDate;
    }

    const [payments, total] = await Promise.all([
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
        .select('artistBookingId bookedBy date totalPrice status createdAt userDetails')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.bookingModel.countDocuments(filter),
    ]);

    // Calculate total earnings
    const totalEarnings = await this.bookingModel.aggregate([
      { $match: filter },
      { $group: { _id: null, total: { $sum: '$totalPrice' } } },
    ]);

    return {
      payments,
      totalEarnings: totalEarnings[0]?.total || 0,
      pagination: {
        current: page,
        total: Math.ceil(total / limit),
        count: total,
        perPage: limit,
      },
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
              select: 'firstName lastName email phoneNumber roleProfile',
              populate: {
                path: 'roleProfile',
                select: 'companyName businessDescription',
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
                  select: 'firstName lastName email phoneNumber roleProfile',
                  populate: {
                    path: 'roleProfile',
                    select: 'companyName businessDescription',
                  },
                },
              },
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
    const allPayments = [
      ...standalonePayments.map((payment: any) => ({
        ...payment,
        paymentType: 'standalone',
        displayDate: payment.startDate,
      })),
      ...combinedPayments
        .filter((payment: any) => payment.equipmentBookingId)
        .map((payment: any) => ({
          ...payment,
          paymentType: 'combined',
          displayDate: payment.date,
          packageId: payment.equipmentBookingId?.packages?.[0], // Take first package if available
          startDate: payment.date,
          endDate: payment.date,
        }))
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
}
