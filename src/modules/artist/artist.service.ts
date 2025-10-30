import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from 'src/infrastructure/database/schemas';
import {
  ArtistProfile,
  ArtistProfileDocument,
} from 'src/infrastructure/database/schemas/artist-profile.schema';
import {
  UserLikes,
  UserLikesDocument,
} from 'src/infrastructure/database/schemas/artist-like.schema';
import {
  PortfolioItem,
  PortfolioItemDocument,
  PortfolioItemStatus,
} from 'src/infrastructure/database/schemas/portfolio-item.schema';
import { S3Service } from 'src/infrastructure/s3/s3.service';
import { CreateArtistDto } from './dto/create-artist.dto';
import { EditArtistDto } from './dto/edit-artist.dto';
import * as bcrypt from 'bcrypt';
import { UserRole } from 'src/common/enums/roles.enum';
import { UpdateArtistProfileDto } from './dto/profile-update-request.dto';
import {
  ArtistProfileUpdateRequestDocument,
  ArtistProfleUpdateRequest,
  UpdateStatus,
} from 'src/infrastructure/database/schemas/artistProfile-Update-Request.schema';
import {
  ApplicationStatus,
  ArtistApplication,
  ArtistApplicationDocument,
} from 'src/infrastructure/database/schemas/artist-application.schema';
import { CreateArtistApplicationDto } from './dto/artist-application.dto';
import { Application } from 'express';
import { EmailService } from 'src/infrastructure/email/email.service';
import { EmailTemplate } from 'src/common/enums/mail-templates.enum';
import { CreatePortfolioItemDto } from './dto/portfolio-item.dto';
import { ArtistPricingService } from '../artist-pricing/artist-pricing.service';
import { CreateArtistPricingDto } from './dto/create-artist-pricing.dto';
import { ArtistPricingData } from '../artist-pricing/types/create-artist.price';
import { UpdateArtistSettingsDto } from './dto/update-artist-settings.dto';

@Injectable()
export class ArtistService {
  private readonly logger = new Logger(ArtistService.name);
  constructor(
    @InjectModel(ArtistProfile.name)
    private artistProfileModel: Model<ArtistProfileDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(ArtistProfleUpdateRequest.name)
    private profileUpdateModel: Model<ArtistProfileUpdateRequestDocument>,
    @InjectModel(ArtistApplication.name)
    private applicationModel: Model<ArtistApplicationDocument>,
    @InjectModel(PortfolioItem.name)
    private portfolioItemModel: Model<PortfolioItemDocument>,
    @InjectModel(UserLikes.name)
    private userLikesModel: Model<UserLikesDocument>,
    private artistPricingService: ArtistPricingService,
    private readonly s3Service: S3Service,
    private readonly emailService: EmailService,
  ) {}

  //   ** list all artist
  async listAllArtist_PUBLIC() {
    return await this.artistProfileModel
      .find({ isVisible: true })
      .populate({
        path: 'user',
        select: 'firstName lastName role isActive',
        match: { isActive: true, role: 'ARTIST' },
      })
      .select('-__v')
      .then((profiles) => profiles.filter((profile) => profile.user !== null));
  }

  async ListAllArtist_PRIVATE() {
    return await this.artistProfileModel
      .find()
      .populate({
        path: 'user',
        select: 'firstName lastName email phoneNumber role isActive',
      })
      .select('-__v');
  }

  //   ** get artist profile by user ID (for own profile)
  async getArtistProfileByUserId(userId: string) {
    const profile = await this.artistProfileModel
      .findOne({ user: userId })
      .populate({
        path: 'user',
        select: 'firstName lastName email phoneNumber role isActive',
      })
      .populate({ path: 'pricingInformation' })
      .select('-__v');

    if (!profile) {
      throw new NotFoundException('Artist profile not found');
    }

    return profile;
  }

  //   ** get artist profile by profile ID (public access)
  async getArtistProfileById(profileId: string) {
    if (!Types.ObjectId.isValid(profileId)) {
      throw new BadRequestException('Invalid artist ID');
    }

    const profile = await this.artistProfileModel
      .findById(profileId)
      .populate({
        path: 'user',
        select: 'firstName lastName role isActive email phoneNumber',
      })
      .populate({ path: 'pricingInformation' })
      .select('-__v');

    if (!profile) {
      throw new NotFoundException('Artist profile not found');
    }

    // Only return profiles of active users
    const user = profile.user as any;
    if (!user || !user.isActive) {
      throw new NotFoundException('Artist profile not available');
    }

    return profile;
  }

  //   ** get artist profile by profile ID with like status for logged in user
  async getArtistProfileByIdWithLikeStatus(profileId: string, userId?: string) {
    const profile = await this.getArtistProfileById(profileId);
    
    let isLiked = false;
    if (userId) {
      isLiked = await this.checkIfUserLikedArtist(userId, profileId);
    }

    return {
      ...profile.toObject(),
      isLikedByCurrentUser: isLiked,
    };
  } //   ** create artist by admin
  async createArtistByAdmin(
    dto: CreateArtistDto,
    addedByAdminId: string,
    files: {
      profileImage?: Express.Multer.File[];
      profileCoverImage?: Express.Multer.File[];
    },
  ) {
    try {
      const existing = await this.userModel.findOne({
        $or: [{ email: dto.email }, { phoneNumber: dto.phoneNumber }],
      });
      if (existing) {
        throw new BadRequestException('Email or phoneNumber already exists');
      }

      const plainPassword = Math.random().toString(36).slice(-8);
      this.logger.log('The artist plain password - ', plainPassword);
      const hashedPassword = await bcrypt.hash(plainPassword, 10);
      const artistUser = await this.userModel.create({
        firstName: dto.firstName,
        lastName: dto.lastName,
        passwordHash: hashedPassword,
        tempPassword: plainPassword, // Store temporarily for activation email
        role: UserRole.ARTIST,
        isActive: false, // Start as inactive, admin needs to activate
        phoneNumber: dto.phoneNumber,
        email: dto.email,
      });

      let profileImageUrl = '';
      let coverImageUrl = '';

      if (files?.profileImage?.[0]) {
        profileImageUrl = await this.s3Service.uploadFile(
          files.profileImage[0],
          'artists/profile-images',
        );
      }
      if (files?.profileCoverImage?.[0]) {
        coverImageUrl = await this.s3Service.uploadFile(
          files.profileCoverImage[0],
          'artists/cover-images',
        );
      }

      const profile = await this.artistProfileModel.create({
        user: artistUser.id,
        addedBy: addedByAdminId,
        artistType: dto.artistType,
        stageName: dto.stageName,
        cooldownPeriodHours: dto.cooldownPeriodHours || 2,
        maximumPerformanceHours: dto.maximumPerformanceHours || 4,
        about: dto.about,
        yearsOfExperience: dto.yearsOfExperience,
        skills: dto.skills,
        musicLanguages: dto.musicLanguages,
        awards: dto.awards,
        pricePerHour: Number(dto.pricePerHour),
        category: dto.category,
        country: dto.country,
        performPreference: dto.performPreference,
        profileCoverImage: coverImageUrl,
        youtubeLink: dto.youtubeLink || '',
        profileImage: profileImageUrl,
        gender: dto.gender,
      });
      this.logger.log('profile creation done');

      // ** create artist pricing deatils deatils
      const pricingData: ArtistPricingData = {
        privatePricing: dto.privatePricing,
        publicPricing: dto.publicPricing,
        workshopPricing: dto.workshopPricing,
      };

      const artistPricing = await this.artistPricingService.create(
        profile.id,
        pricingData,
      );
      profile.pricingInformation = artistPricing.id;
      await profile.save();

      artistUser.roleProfile = profile._id as Types.ObjectId;
      artistUser.roleProfileRef = 'ArtistProfile';
      await artistUser.save();
      this.logger.log('Artist Created - Email will be sent upon activation');

      return {
        message:
          'Artist created successfully. Account will be activated by admin.',
        user: artistUser.firstName,
        profile,
      };
    } catch (error: any) {
      this.logger.error('Failed to create artist:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to create artist');
    }
  }

  async requestProfileUpdate(
    artistUserId: string,
    payload: UpdateArtistProfileDto,
    files: {
      profileImage?: Express.Multer.File[];
      profileCoverImage?: Express.Multer.File[];
    },
  ) {
    const profile = await this.artistProfileModel.findOne({
      user: artistUserId,
    });
    if (!profile) throw new NotFoundException('Artist not found');
    const existingRequest = await this.profileUpdateModel.findOne({
      artistProfile: profile.id,
      status: UpdateStatus.PENDING,
    });
    if (existingRequest)
      throw new BadRequestException(
        'You Already have a pending update request',
      );
    const updates: Partial<ArtistProfile> = {};

    // Handle text fields
    if (payload.genres) updates.genres = payload.genres;
    if (payload.category) updates.category = payload.category;
    if (payload.skills) updates.skills = payload.skills;
    if (payload.about) updates.about = payload.about;
    if (payload.yearsOfExperience !== undefined)
      updates.yearsOfExperience = payload.yearsOfExperience;
    if (payload.musicLanguages) updates.musicLanguages = payload.musicLanguages;
    if (payload.awards) updates.awards = payload.awards;
    if (payload.pricePerHour !== undefined)
      updates.pricePerHour = payload.pricePerHour;
    if (payload.performPreference)
      updates.performPreference = payload.performPreference;
    
    // Handle new fields
    if (payload.gender) updates.gender = payload.gender;
    if (payload.artistType) updates.artistType = payload.artistType;
    if (payload.country) updates.country = payload.country;

    // Handle file uploads
    if (files?.profileImage?.[0]) {
      updates.profileImage = await this.s3Service.uploadFile(
        files.profileImage[0],
        'artists/profile-images',
      );
    }

    if (files?.profileCoverImage?.[0]) {
      updates.profileCoverImage = await this.s3Service.uploadFile(
        files.profileCoverImage[0],
        'artists/cover-images',
      );
    }

    // Handle YouTube link
    if (payload.youtubeLink !== undefined) {
      updates.youtubeLink = payload.youtubeLink;
    }

    // Handle pricing changes (store separately for admin review)
    const pricingChanges: any = {};
    if (payload.privatePricing) pricingChanges.privatePricing = payload.privatePricing;
    if (payload.publicPricing) pricingChanges.publicPricing = payload.publicPricing;
    if (payload.workshopPricing) pricingChanges.workshopPricing = payload.workshopPricing;

    // Check if there are any updates to submit
    if (Object.keys(updates).length === 0 && Object.keys(pricingChanges).length === 0) {
      throw new BadRequestException('No changes provided for update request');
    }

    // Create the request with both profile and pricing changes
    const requestData: any = {
      artistProfile: profile.id,
      artistUser: artistUserId,
      proposedChanges: updates,
    };

    // Add pricing changes if they exist
    if (Object.keys(pricingChanges).length > 0) {
      requestData.proposedPricingChanges = pricingChanges;
    }

    const request = await this.profileUpdateModel.create(requestData);

    return { message: 'update request submitted sucessfully' };
  }

  async getPendingRequests() {
    // Get profile update requests
    const profileRequests = await this.profileUpdateModel
      .find({ status: UpdateStatus.PENDING })
      .populate('artistProfile', 'stageName')
      .populate('artistUser', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .lean();

    // Get pending portfolio items
    const portfolioRequests = await this.portfolioItemModel
      .find({ status: PortfolioItemStatus.PENDING })
      .populate({
        path: 'artistProfile',
        select: 'stageName',
      })
      .populate({
        path: 'artistUser',
        select: 'firstName lastName email',
      })
      .sort({ createdAt: -1 })
      .lean();

    // Transform profile update requests
    const transformedProfileRequests = profileRequests.map((request) => ({
      ...request,
      type: 'PROFILE_UPDATE',
      requestedChanges: request.proposedChanges || {},
      artist: {
        _id: (request.artistProfile as any)?._id,
        stageName:
          (request.artistProfile as any)?.stageName || 'Unknown Artist',
        user: {
          firstName: (request.artistUser as any)?.firstName || 'Unknown',
          lastName: (request.artistUser as any)?.lastName || 'User',
          email: (request.artistUser as any)?.email || 'unknown@email.com',
        },
      },
      submittedAt: (request as any).createdAt,
    }));

    // Transform portfolio requests
    const transformedPortfolioRequests = portfolioRequests.map((request) => ({
      ...request,
      type: 'PORTFOLIO_ITEM',
      requestedChanges: {
        title: request.title,
        description: request.description,
        type: request.type,
        fileUrl: request.fileUrl,
      },
      artist: {
        _id: (request.artistProfile as any)?._id,
        stageName:
          (request.artistProfile as any)?.stageName || 'Unknown Artist',
        user: {
          firstName: (request.artistUser as any)?.firstName || 'Unknown',
          lastName: (request.artistUser as any)?.lastName || 'User',
          email: (request.artistUser as any)?.email || 'unknown@email.com',
        },
      },
      submittedAt: (request as any).createdAt,
    }));

    // Combine and sort all requests by creation date
    const allRequests = [
      ...transformedProfileRequests,
      ...transformedPortfolioRequests,
    ].sort(
      (a, b) =>
        new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
    );

    return allRequests;
  }

  async getRequestsByArtistId(artistUserId: string) {
    const requests = await this.profileUpdateModel
      .find({ artistUser: artistUserId })
      .populate('artistProfile', 'stageName')
      .populate('artistUser', 'firstName lastName email')
      .populate('reviewedBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .lean();

    // Transform the data to match frontend expectations
    return requests.map((request) => ({
      ...request,
      requestedChanges: request.proposedChanges || {}, // Fix typo and provide fallback
      artist: {
        _id: (request.artistProfile as any)._id,
        stageName: (request.artistProfile as any).stageName,
        user: {
          firstName: (request.artistUser as any).firstName,
          lastName: (request.artistUser as any).lastName,
          email: (request.artistUser as any).email,
        },
      },
    }));
  }

  async reviewProflileUpdateRequest(
    adminId: string,
    requestId: string,
    approve: boolean,
    comment?: string,
  ) {
    const req = await this.profileUpdateModel.findById(requestId);
    if (!req) throw new NotFoundException('Request Not found');

    // Update the document using findByIdAndUpdate to avoid validation issues
    const updatedRequest = await this.profileUpdateModel.findByIdAndUpdate(
      requestId,
      {
        $set: {
          status: approve ? UpdateStatus.ACCEPTED : UpdateStatus.REJECTED,
          reviewedBy: new Types.ObjectId(adminId),
          adminComment: comment || '',
        },
      },
      { new: true },
    );

    if (approve) {
      // Update profile changes
      if (req.proposedChanges && Object.keys(req.proposedChanges).length > 0) {
        await this.artistProfileModel.updateOne(
          { _id: req.artistProfile },
          { $set: req.proposedChanges },
        );
      }

      // Update pricing changes if they exist
      if (req.proposedPricingChanges && Object.keys(req.proposedPricingChanges).length > 0) {
        try {
          await this.artistPricingService.updateBasicPricing(
            req.artistProfile.toString(),
            req.proposedPricingChanges
          );
          this.logger.log(`Pricing updated for artist ${req.artistProfile} via profile update request`);
        } catch (pricingError) {
          this.logger.warn(`Failed to update pricing for artist ${req.artistProfile}: ${pricingError.message}`);
          // Don't fail the entire update if pricing update fails
        }
      }
    }

    return {
      message: approve
        ? 'Profile update successfully done'
        : 'Profile update request rejected',
    };
  }

  //   **Application submission code
  async createApplication(
    dto: CreateArtistApplicationDto,
    files?: {
      resume?: Express.Multer.File[];
      profileImage?: Express.Multer.File[];
    },
  ) {
    let resumeURL = '';
    let profileImageURL = '';

    if (files?.resume && files.resume.length > 0) {
      resumeURL = await this.s3Service.uploadFile(
        files.resume[0],
        'artist-applications/resumes',
      );
    }

    if (files?.profileImage && files.profileImage.length > 0) {
      profileImageURL = await this.s3Service.uploadFile(
        files.profileImage[0],
        'artist-applications/profile-images',
      );
    }

    const app = await this.applicationModel.create({
      ...dto,
      resume: resumeURL,
      profileImage: profileImageURL,
    });

    return {
      message: 'Application submitted successfully',
      data: app,
    };
  }

  async ListAllApplication(status?: ApplicationStatus) {
    const query = status ? { status } : {};
    return this.applicationModel.find(query).sort({ createdAt: -1 });
  }

  async updateApplicationStatus(id: string, status: ApplicationStatus) {
    const app = await this.applicationModel.findById(id);
    if (!app) throw new NotFoundException('Application not found');
    app.status = status;
    await app.save();
    return {
      message: `Application ${status.toLocaleLowerCase()}`,
      data: app,
    };
  }

  async deleteArtistApplication(id: string) {
    const app = await this.applicationModel.findById({ _id: id });
    if (!app) {
      throw new NotFoundException('Application not found');
    }
    return await this.applicationModel.deleteOne({ _id: id });
  }

  async getApplicationById(id: string) {
    const app = await this.applicationModel.findById({ _id: id });
    if (!app) {
      throw new NotFoundException('Application not found');
    }
    return app;
  }

  async verifyArtist(artistId: string, isVerified: boolean) {
    try {
      // Find the artist profile
      const artistProfile = await this.artistProfileModel
        .findById(artistId)
        .populate('user');

      if (!artistProfile) {
        throw new NotFoundException('Artist profile not found');
      }

      // Update the user's isActive status to reflect verification
      await this.userModel.findByIdAndUpdate(
        artistProfile.user,
        { isActive: isVerified },
        { new: true },
      );

      this.logger.log(
        `Artist ${artistProfile.stageName} has been ${isVerified ? 'verified' : 'unverified'}`,
      );

      return {
        message: `Artist ${isVerified ? 'verified' : 'unverified'} successfully`,
        artistId,
        isVerified,
      };
    } catch (error) {
      this.logger.error(
        `Failed to ${isVerified ? 'verify' : 'unverify'} artist: ${error.message}`,
      );
      throw new BadRequestException(
        `Failed to ${isVerified ? 'verify' : 'unverify'} artist`,
      );
    }
  }

  async toggleArtistVisibility(artistId: string, isVisible: boolean) {
    try {
      // Find and update the artist profile
      const artistProfile = await this.artistProfileModel
        .findByIdAndUpdate(artistId, { isVisible: isVisible }, { new: true })
        .populate('user');

      if (!artistProfile) {
        throw new NotFoundException('Artist profile not found');
      }

      this.logger.log(
        `Artist ${artistProfile.stageName} visibility has been ${isVisible ? 'enabled' : 'disabled'}`,
      );

      return {
        message: `Artist visibility ${isVisible ? 'enabled' : 'disabled'} successfully`,
        artistId,
        isVisible,
      };
    } catch (error) {
      this.logger.error(`Failed to toggle artist visibility: ${error.message}`);
      throw new BadRequestException('Failed to toggle artist visibility');
    }
  }

  // Portfolio Management Methods
  async createPortfolioItem(
    artistUserId: string,
    dto: CreatePortfolioItemDto,
    file: Express.Multer.File,
  ) {
    // Find artist profile
    const artistProfile = await this.artistProfileModel.findOne({
      user: artistUserId,
    });
    if (!artistProfile) {
      throw new NotFoundException('Artist profile not found');
    }

    // Upload file to S3
    const fileUrl = await this.s3Service.uploadFile(
      file,
      `portfolio/${dto.type}s`,
    );

    // Create thumbnail for videos
    let thumbnailUrl: string | undefined;
    if (dto.type === 'video') {
      // For now, we'll use a placeholder. In production, you'd generate video thumbnails
      thumbnailUrl = fileUrl; // You can implement video thumbnail generation here
    }

    // Create portfolio item
    const portfolioItem = await this.portfolioItemModel.create({
      title: dto.title,
      description: dto.description,
      type: dto.type,
      fileUrl,
      thumbnailUrl,
      artistProfile: artistProfile._id,
      artistUser: artistUserId,
      status: PortfolioItemStatus.PENDING,
    });

    return {
      message: 'Portfolio item submitted for review',
      portfolioItem: await portfolioItem.populate([
        { path: 'artistProfile', select: 'stageName' },
        { path: 'artistUser', select: 'firstName lastName' },
      ]),
    };
  }

  async getMyPortfolioItems(
    artistUserId: string,
    status?: PortfolioItemStatus,
  ) {
    const query: any = { artistUser: artistUserId };
    if (status) {
      query.status = status;
    }

    return await this.portfolioItemModel
      .find(query)
      .populate('artistProfile', 'stageName')
      .populate('artistUser', 'firstName lastName')
      .populate('reviewedBy', 'firstName lastName')
      .sort({ createdAt: -1 });
  }

  async getPublicPortfolioItems(artistProfileId: string) {
    return await this.portfolioItemModel
      .find({
        artistProfile: artistProfileId,
        status: PortfolioItemStatus.APPROVED,
        isActive: true,
      })
      .populate('artistProfile', 'stageName')
      .sort({ createdAt: -1 })
      .select('-artistUser -reviewedBy -reviewComment');
  }

  async getAllPendingPortfolioItems() {
    const items = await this.portfolioItemModel
      .find({ status: PortfolioItemStatus.PENDING })
      .populate('artistProfile', 'stageName')
      .populate('artistUser', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .lean();

    // Transform the data to match expected structure
    return items.map((item) => ({
      ...item,
      artistProfile: {
        ...(item.artistProfile as any),
        user: item.artistUser,
      },
    }));
  }

  async reviewPortfolioItem(
    adminId: string,
    portfolioItemId: string,
    approve: boolean,
    reviewComment?: string,
  ) {
    const portfolioItem =
      await this.portfolioItemModel.findById(portfolioItemId);
    if (!portfolioItem) {
      throw new NotFoundException('Portfolio item not found');
    }

    if (portfolioItem.status !== PortfolioItemStatus.PENDING) {
      throw new BadRequestException('Portfolio item has already been reviewed');
    }

    portfolioItem.status = approve
      ? PortfolioItemStatus.APPROVED
      : PortfolioItemStatus.REJECTED;
    portfolioItem.reviewedBy = new Types.ObjectId(adminId);
    portfolioItem.reviewComment = reviewComment || '';
    portfolioItem.reviewedAt = new Date();

    await portfolioItem.save();

    return {
      message: `Portfolio item ${approve ? 'approved' : 'rejected'} successfully`,
      portfolioItem: await portfolioItem.populate([
        { path: 'artistProfile', select: 'stageName' },
        { path: 'artistUser', select: 'firstName lastName email' },
        { path: 'reviewedBy', select: 'firstName lastName' },
      ]),
    };
  }

  async deletePortfolioItem(artistUserId: string, portfolioItemId: string) {
    const portfolioItem = await this.portfolioItemModel.findOne({
      _id: portfolioItemId,
      artistUser: artistUserId,
    });

    if (!portfolioItem) {
      throw new NotFoundException('Portfolio item not found');
    }

    // Delete file from S3
    try {
      // Extract S3 key from URL and delete
      // Implementation depends on your S3 URL structure
      await this.s3Service.deleteFile(portfolioItem.fileUrl);
      if (
        portfolioItem.thumbnailUrl &&
        portfolioItem.thumbnailUrl !== portfolioItem.fileUrl
      ) {
        await this.s3Service.deleteFile(portfolioItem.thumbnailUrl);
      }
    } catch (error) {
      this.logger.warn(
        `Failed to delete S3 files for portfolio item ${portfolioItemId}: ${error.message}`,
      );
    }

    await portfolioItem.deleteOne();

    return {
      message: 'Portfolio item deleted successfully',
    };
  }

  async incrementPortfolioViews(portfolioItemId: string) {
    await this.portfolioItemModel.findByIdAndUpdate(portfolioItemId, {
      $inc: { views: 1 },
    });
  }

  async togglePortfolioLike(portfolioItemId: string, increment: boolean) {
    const updateQuery = increment
      ? { $inc: { likes: 1 } }
      : { $inc: { likes: -1 } };

    await this.portfolioItemModel.findByIdAndUpdate(
      portfolioItemId,
      updateQuery,
    );
  }

  // ** Edit Artist by Admin
  async editArtistByAdmin(artistId: string, editData: any, adminId: string, files?: any) {
    try {
      this.logger.log(`Editing artist ${artistId} by admin ${adminId}`);
      
      // Parse JSON stringified arrays from FormData and convert data types
      const parsedEditData = { ...editData };
      const arrayFields = ['skills', 'musicLanguages', 'awards', 'performPreference', 'privatePricing', 'publicPricing', 'workshopPricing', 'internationalPricing', 'privateTimeSlotPricing', 'publicTimeSlotPricing', 'workshopTimeSlotPricing', 'internationalTimeSlotPricing'];
      const numberFields = ['yearsOfExperience', 'pricePerHour', 'cooldownPeriodHours', 'maximumPerformanceHours', 'basePrivateRate', 'basePublicRate', 'baseWorkshopRate', 'baseInternationalRate'];
      const booleanFields = ['isVisible', 'isActive'];
      
      // Parse arrays
      arrayFields.forEach(field => {
        if (parsedEditData[field] && typeof parsedEditData[field] === 'string') {
          try {
            const parsed = JSON.parse(parsedEditData[field]);
            // Convert numbers in nested objects for pricing arrays
            if (['privatePricing', 'publicPricing', 'workshopPricing', 'internationalPricing'].includes(field)) {
              parsedEditData[field] = parsed.map((item: any) => ({
                ...item,
                hours: typeof item.hours === 'string' ? parseFloat(item.hours) : item.hours,
                amount: typeof item.amount === 'string' ? parseFloat(item.amount) : item.amount
              }));
            } else if (['privateTimeSlotPricing', 'publicTimeSlotPricing', 'workshopTimeSlotPricing', 'internationalTimeSlotPricing'].includes(field)) {
              parsedEditData[field] = parsed.map((item: any) => ({
                ...item,
                hour: typeof item.hour === 'string' ? parseFloat(item.hour) : item.hour,
                rate: typeof item.rate === 'string' ? parseFloat(item.rate) : item.rate
              }));
            } else {
              parsedEditData[field] = parsed;
            }
          } catch (error) {
            this.logger.warn(`Failed to parse ${field} as JSON: ${parsedEditData[field]}`);
          }
        }
      });

      // Convert numbers
      numberFields.forEach(field => {
        if (parsedEditData[field] !== undefined && parsedEditData[field] !== null) {
          const num = parseFloat(parsedEditData[field]);
          if (!isNaN(num)) {
            parsedEditData[field] = num;
          }
        }
      });

      // Convert booleans
      booleanFields.forEach(field => {
        if (parsedEditData[field] !== undefined && parsedEditData[field] !== null) {
          if (typeof parsedEditData[field] === 'string') {
            parsedEditData[field] = parsedEditData[field].toLowerCase() === 'true';
          } else {
            parsedEditData[field] = Boolean(parsedEditData[field]);
          }
        }
      });

      // Set default values for missing or invalid fields
      if (parsedEditData.yearsOfExperience === undefined || parsedEditData.yearsOfExperience < 0) {
        parsedEditData.yearsOfExperience = 0;
      }
      if (parsedEditData.pricePerHour === undefined || parsedEditData.pricePerHour < 0) {
        parsedEditData.pricePerHour = 0;
      }
      if (parsedEditData.cooldownPeriodHours === undefined || parsedEditData.cooldownPeriodHours < 1 || parsedEditData.cooldownPeriodHours > 24) {
        parsedEditData.cooldownPeriodHours = 2;
      }
      if (parsedEditData.maximumPerformanceHours === undefined || parsedEditData.maximumPerformanceHours < 1 || parsedEditData.maximumPerformanceHours > 12) {
        parsedEditData.maximumPerformanceHours = 4;
      }

      // Ensure arrays exist
      ['skills', 'musicLanguages', 'awards', 'performPreference'].forEach(field => {
        if (!Array.isArray(parsedEditData[field])) {
          parsedEditData[field] = [];
        }
      });

      // Ensure pricing arrays exist with default values
      ['privatePricing', 'publicPricing', 'workshopPricing', 'internationalPricing'].forEach(field => {
        if (!Array.isArray(parsedEditData[field])) {
          parsedEditData[field] = [{ hours: 1, amount: 0 }];
        }
      });

      // Ensure time slot pricing arrays exist
      ['privateTimeSlotPricing', 'publicTimeSlotPricing', 'workshopTimeSlotPricing', 'internationalTimeSlotPricing'].forEach(field => {
        if (!Array.isArray(parsedEditData[field])) {
          parsedEditData[field] = [];
        }
      });

      // Ensure base rates exist
      ['basePrivateRate', 'basePublicRate', 'baseWorkshopRate', 'baseInternationalRate'].forEach(field => {
        if (parsedEditData[field] === undefined || parsedEditData[field] < 0) {
          parsedEditData[field] = 0;
        }
      });

      // Ensure boolean fields exist
      if (parsedEditData.isVisible === undefined) {
        parsedEditData.isVisible = true;
      }
      if (parsedEditData.isActive === undefined) {
        parsedEditData.isActive = true;
      }

      // Find the artist profile
      const artistProfile = await this.artistProfileModel.findById(artistId).populate('user');
      if (!artistProfile) {
        throw new NotFoundException('Artist not found');
      }

      const user = await this.userModel.findById(artistProfile.user);
      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Handle file uploads
      let profileImageUrl = artistProfile.profileImage;
      let coverImageUrl = artistProfile.profileCoverImage;

      if (files?.profileImage?.[0]) {
        profileImageUrl = await this.s3Service.uploadFile(
          files.profileImage[0],
          'artist-profiles',
        );
        // Delete old profile image if it exists
        if (artistProfile.profileImage) {
          try {
            await this.s3Service.deleteFile(artistProfile.profileImage);
          } catch (error) {
            this.logger.warn(`Failed to delete old profile image: ${error.message}`);
          }
        }
      }

      if (files?.profileCoverImage?.[0]) {
        coverImageUrl = await this.s3Service.uploadFile(
          files.profileCoverImage[0],
          'artist-covers',
        );
        // Delete old cover image if it exists
        if (artistProfile.profileCoverImage) {
          try {
            await this.s3Service.deleteFile(artistProfile.profileCoverImage);
          } catch (error) {
            this.logger.warn(`Failed to delete old cover image: ${error.message}`);
          }
        }
      }

      // Update user fields
      const userUpdateData: any = {};
      if (parsedEditData.firstName) userUpdateData.firstName = parsedEditData.firstName;
      if (parsedEditData.lastName) userUpdateData.lastName = parsedEditData.lastName;
      if (parsedEditData.email) userUpdateData.email = parsedEditData.email;
      if (parsedEditData.phoneNumber) userUpdateData.phoneNumber = parsedEditData.phoneNumber;
      if (parsedEditData.hasOwnProperty('isActive')) userUpdateData.isActive = parsedEditData.isActive;

      if (Object.keys(userUpdateData).length > 0) {
        await this.userModel.findByIdAndUpdate(user._id, userUpdateData);
      }

      // Update artist profile fields
      const artistUpdateData: any = {};
      if (parsedEditData.stageName) artistUpdateData.stageName = parsedEditData.stageName;
      if (parsedEditData.about) artistUpdateData.about = parsedEditData.about;
      if (parsedEditData.yearsOfExperience !== undefined) artistUpdateData.yearsOfExperience = parsedEditData.yearsOfExperience;
      if (parsedEditData.skills) artistUpdateData.skills = parsedEditData.skills;
      if (parsedEditData.musicLanguages) artistUpdateData.musicLanguages = parsedEditData.musicLanguages;
      if (parsedEditData.awards) artistUpdateData.awards = parsedEditData.awards;
      if (parsedEditData.pricePerHour !== undefined) artistUpdateData.pricePerHour = parsedEditData.pricePerHour;
      if (parsedEditData.gender) artistUpdateData.gender = parsedEditData.gender;
      if (parsedEditData.artistType) artistUpdateData.artistType = parsedEditData.artistType;
      if (parsedEditData.category) artistUpdateData.category = parsedEditData.category;
      if (parsedEditData.country) artistUpdateData.country = parsedEditData.country;
      if (parsedEditData.performPreference) artistUpdateData.performPreference = parsedEditData.performPreference;
      if (parsedEditData.youtubeLink) artistUpdateData.youtubeLink = parsedEditData.youtubeLink;
      if (parsedEditData.cooldownPeriodHours !== undefined) artistUpdateData.cooldownPeriodHours = parsedEditData.cooldownPeriodHours;
      if (parsedEditData.maximumPerformanceHours !== undefined) artistUpdateData.maximumPerformanceHours = parsedEditData.maximumPerformanceHours;
      if (parsedEditData.hasOwnProperty('isVisible')) artistUpdateData.isVisible = parsedEditData.isVisible;
      
      if (profileImageUrl !== artistProfile.profileImage) {
        artistUpdateData.profileImage = profileImageUrl;
      }
      if (coverImageUrl !== artistProfile.profileCoverImage) {
        artistUpdateData.profileCoverImage = coverImageUrl;
      }

      // Update artist profile
      const updatedArtist = await this.artistProfileModel.findByIdAndUpdate(
        artistId,
        artistUpdateData,
        { new: true }
      ).populate({
        path: 'user',
        select: 'firstName lastName email phoneNumber role isActive',
      });

      // Handle pricing updates
      if (this.hasPricingData(parsedEditData)) {
        try {
          const pricingData = this.extractPricingData(parsedEditData);
          
          // Check if artist has existing pricing
          if (artistProfile.pricingInformation) {
            // Update existing pricing
            await this.artistPricingService.updateBasicPricing(artistId, pricingData);
          } else {
            // Create new pricing
            const newPricing = await this.artistPricingService.create(artistId, pricingData);
            if (updatedArtist) {
              updatedArtist.pricingInformation = newPricing._id as any;
              await updatedArtist.save();
            }
          }
          
          this.logger.log(`Pricing updated for artist ${artistId}`);
        } catch (pricingError) {
          this.logger.warn(`Failed to update pricing for artist ${artistId}: ${pricingError.message}`);
          // Don't fail the entire update if pricing update fails
        }
      }

      this.logger.log(`Artist ${artistId} updated by admin ${adminId}`);

      return {
        message: 'Artist updated successfully',
        artist: updatedArtist,
      };
    } catch (error) {
      this.logger.error(`Error updating artist ${artistId}: ${error.message}`);
      throw error;
    }
  }

  private hasPricingData(editData: any): boolean {
    return !!(
      editData.pricingMode ||
      editData.privatePricing ||
      editData.publicPricing ||
      editData.workshopPricing ||
      editData.internationalPricing ||
      editData.privateTimeSlotPricing ||
      editData.publicTimeSlotPricing ||
      editData.workshopTimeSlotPricing ||
      editData.internationalTimeSlotPricing ||
      editData.basePrivateRate !== undefined ||
      editData.basePublicRate !== undefined ||
      editData.baseWorkshopRate !== undefined ||
      editData.baseInternationalRate !== undefined
    );
  }

  private extractPricingData(editData: any): ArtistPricingData {
    const pricingData: ArtistPricingData = {};

    if (editData.pricingMode) pricingData.pricingMode = editData.pricingMode;
    if (editData.privatePricing) pricingData.privatePricing = editData.privatePricing;
    if (editData.publicPricing) pricingData.publicPricing = editData.publicPricing;
    if (editData.workshopPricing) pricingData.workshopPricing = editData.workshopPricing;
    if (editData.internationalPricing) pricingData.internationalPricing = editData.internationalPricing;
    if (editData.privateTimeSlotPricing) pricingData.privateTimeSlotPricing = editData.privateTimeSlotPricing;
    if (editData.publicTimeSlotPricing) pricingData.publicTimeSlotPricing = editData.publicTimeSlotPricing;
    if (editData.workshopTimeSlotPricing) pricingData.workshopTimeSlotPricing = editData.workshopTimeSlotPricing;
    if (editData.internationalTimeSlotPricing) pricingData.internationalTimeSlotPricing = editData.internationalTimeSlotPricing;
    if (editData.basePrivateRate !== undefined) pricingData.basePrivateRate = editData.basePrivateRate;
    if (editData.basePublicRate !== undefined) pricingData.basePublicRate = editData.basePublicRate;
    if (editData.baseWorkshopRate !== undefined) pricingData.baseWorkshopRate = editData.baseWorkshopRate;
    if (editData.baseInternationalRate !== undefined) pricingData.baseInternationalRate = editData.baseInternationalRate;

    return pricingData;
  }

  // ** Delete Artist by Admin
  async deleteArtistByAdmin(artistId: string, adminId: string) {
    try {
      // Find the artist profile
      const artistProfile = await this.artistProfileModel.findById(artistId).populate('user');
      if (!artistProfile) {
        throw new NotFoundException('Artist not found');
      }

      const user = await this.userModel.findById(artistProfile.user);
      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Delete associated files from S3
      if (artistProfile.profileImage) {
        try {
          await this.s3Service.deleteFile(artistProfile.profileImage);
        } catch (error) {
          this.logger.warn(`Failed to delete profile image: ${error.message}`);
        }
      }
      
      if (artistProfile.profileCoverImage) {
        try {
          await this.s3Service.deleteFile(artistProfile.profileCoverImage);
        } catch (error) {
          this.logger.warn(`Failed to delete cover image: ${error.message}`);
        }
      }

      // Delete portfolio items and their files
      const portfolioItems = await this.portfolioItemModel.find({ artistUser: user._id });
      for (const item of portfolioItems) {
        if (item.fileUrl) {
          try {
            await this.s3Service.deleteFile(item.fileUrl);
          } catch (error) {
            this.logger.warn(`Failed to delete portfolio file: ${error.message}`);
          }
        }
        if (item.thumbnailUrl && item.thumbnailUrl !== item.fileUrl) {
          try {
            await this.s3Service.deleteFile(item.thumbnailUrl);
          } catch (error) {
            this.logger.warn(`Failed to delete portfolio thumbnail: ${error.message}`);
          }
        }
      }

      // Delete related data
      await this.portfolioItemModel.deleteMany({ artistUser: user._id });
      await this.profileUpdateModel.deleteMany({ user: user._id });
      await this.applicationModel.deleteMany({ email: user.email });

      // Delete artist profile
      await this.artistProfileModel.findByIdAndDelete(artistId);

      // Delete user account
      await this.userModel.findByIdAndDelete(user._id);

      this.logger.log(`Artist ${artistId} and associated user ${user._id} deleted by admin ${adminId}`);

      return {
        message: 'Artist and associated data deleted successfully',
      };
    } catch (error) {
      this.logger.error(`Error deleting artist ${artistId}: ${error.message}`);
      throw error;
    }
  }

  // ** Update Artist Settings by Artist themselves
  async updateArtistSettings(artistUserId: string, dto: UpdateArtistSettingsDto) {
    try {
      // Find the artist profile by user ID
      const artistProfile = await this.artistProfileModel.findOne({ user: artistUserId });
      if (!artistProfile) {
        throw new NotFoundException('Artist profile not found');
      }

      // Validate input
      const updateData: any = {};
      
      if (dto.cooldownPeriodHours !== undefined) {
        const cooldown = Number(dto.cooldownPeriodHours);
        if (isNaN(cooldown) || cooldown < 1 || cooldown > 24) {
          throw new BadRequestException('Cooldown period must be between 1 and 24 hours');
        }
        updateData.cooldownPeriodHours = cooldown;
      }

      if (dto.maximumPerformanceHours !== undefined) {
        const maxHours = Number(dto.maximumPerformanceHours);
        if (isNaN(maxHours) || maxHours < 1 || maxHours > 12) {
          throw new BadRequestException('Maximum performance hours must be between 1 and 12 hours');
        }
        updateData.maximumPerformanceHours = maxHours;
      }

      // Check if there are any updates to apply
      if (Object.keys(updateData).length === 0) {
        throw new BadRequestException('No valid settings provided for update');
      }

      // Update the artist profile
      const updatedProfile = await this.artistProfileModel.findByIdAndUpdate(
        artistProfile._id,
        updateData,
        { new: true }
      );

      if (!updatedProfile) {
        throw new NotFoundException('Failed to update artist profile');
      }

      this.logger.log(`Artist ${artistUserId} updated their performance settings`);

      return {
        message: 'Performance settings updated successfully',
        settings: {
          cooldownPeriodHours: updatedProfile.cooldownPeriodHours,
          maximumPerformanceHours: updatedProfile.maximumPerformanceHours,
        },
      };
    } catch (error) {
      this.logger.error(`Error updating artist settings for ${artistUserId}: ${error.message}`);
      throw error;
    }
  }

  // Like/Unlike functionality
  async toggleLikeArtist(userId: string, artistId: string) {
    try {
      const userObjectId = new Types.ObjectId(userId);
      const artistObjectId = new Types.ObjectId(artistId);

      // Check if artist exists
      const artist = await this.artistProfileModel.findById(artistObjectId);
      if (!artist) {
        throw new NotFoundException('Artist not found');
      }

      // Find or create user likes document
      let userLikes = await this.userLikesModel.findOne({ user: userObjectId });
      
      if (!userLikes) {
        userLikes = new this.userLikesModel({ user: userObjectId, likedArtists: [] });
      }

      // Check if artist is already liked
      const existingLikeIndex = userLikes.likedArtists.findIndex(
        like => like.artist.toString() === artistObjectId.toString()
      );

      let isLiked: boolean;
      let likeCount: number;

      if (existingLikeIndex > -1) {
        // Unlike: Remove from array
        userLikes.likedArtists.splice(existingLikeIndex, 1);
        isLiked = false;
        
        // Decrease like count
        await this.artistProfileModel.findByIdAndUpdate(
          artistObjectId,
          { $inc: { likeCount: -1 } },
          { new: true }
        );
        
        likeCount = Math.max(0, (artist.likeCount || 0) - 1);
      } else {
        // Like: Add to array
        userLikes.likedArtists.push({
          artist: artistObjectId,
          likedAt: new Date()
        });
        isLiked = true;
        
        // Increase like count
        await this.artistProfileModel.findByIdAndUpdate(
          artistObjectId,
          { $inc: { likeCount: 1 } },
          { new: true }
        );
        
        likeCount = (artist.likeCount || 0) + 1;
      }

      // Save the user likes document
      await userLikes.save();

      return {
        success: true,
        isLiked,
        message: isLiked ? 'Artist liked successfully' : 'Artist unliked successfully',
        likeCount,
      };
    } catch (error) {
      this.logger.error(`Error toggling like for artist ${artistId}: ${error.message}`);
      throw error;
    }
  }

  async checkIfUserLikedArtist(userId: string, artistId: string): Promise<boolean> {
    try {
      const userObjectId = new Types.ObjectId(userId);
      const artistObjectId = new Types.ObjectId(artistId);

      const userLikes = await this.userLikesModel.findOne({
        user: userObjectId,
        'likedArtists.artist': artistObjectId
      });

      return !!userLikes;
    } catch (error) {
      this.logger.error(`Error checking if user liked artist: ${error.message}`);
      return false;
    }
  }

  async getUserLikedArtists(userId: string) {
    try {
      const userObjectId = new Types.ObjectId(userId);
      
      const userLikes = await this.userLikesModel
        .findOne({ user: userObjectId })
        .populate({
          path: 'likedArtists.artist',
          select: 'stageName profileImage profileCoverImage bio location category pricePerHour likeCount skills about',
          populate: {
            path: 'user',
            select: 'firstName lastName email',
          },
        })
        .sort({ 'likedArtists.likedAt': -1 });

      if (!userLikes) {
        return {
          success: true,
          data: [],
          total: 0,
        };
      }

      // Properly format the response data
      const formattedData = userLikes.likedArtists
        .filter(like => like.artist) // Filter out any null/undefined artist references
        .map(like => {
          const artist = like.artist as any; // Type assertion for populated data
          return {
            _id: artist._id,
            stageName: artist.stageName,
            profileImage: artist.profileImage,
            profileCoverImage: artist.profileCoverImage,
            bio: artist.bio,
            location: artist.location,
            category: artist.category,
            pricePerHour: artist.pricePerHour,
            likeCount: artist.likeCount,
            skills: artist.skills,
            about: artist.about,
            user: artist.user,
            likedAt: like.likedAt
          };
        });

      return {
        success: true,
        data: formattedData,
        total: formattedData.length,
      };
    } catch (error) {
      this.logger.error(`Error fetching user liked artists: ${error.message}`);
      throw error;
    }
  }

  // Admin utility method to recalculate like counts for all artists
  async recalculateLikeCounts() {
    try {
      const pipeline = [
        { $unwind: '$likedArtists' },
        { 
          $group: { 
            _id: '$likedArtists.artist', 
            count: { $sum: 1 } 
          } 
        }
      ];

      const likeCounts = await this.userLikesModel.aggregate(pipeline);
      
      // Reset all artist like counts to 0 first
      await this.artistProfileModel.updateMany({}, { likeCount: 0 });
      
      // Update each artist's like count
      for (const item of likeCounts) {
        await this.artistProfileModel.findByIdAndUpdate(
          item._id,
          { likeCount: item.count }
        );
      }

      return {
        success: true,
        message: 'Like counts recalculated successfully',
        updatedArtists: likeCounts.length
      };
    } catch (error) {
      this.logger.error(`Error recalculating like counts: ${error.message}`);
      throw error;
    }
  }
}
