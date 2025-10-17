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
  ArtistType,
  ArtistTypeDocument,
} from 'src/infrastructure/database/schemas/artist-type.schema';
import {
  PortfolioItem,
  PortfolioItemDocument,
  PortfolioItemStatus,
} from 'src/infrastructure/database/schemas/portfolio-item.schema';
import { S3Service } from 'src/infrastructure/s3/s3.service';
import { CreateArtistDto } from './dto/create-artist.dto';
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

@Injectable()
export class ArtistService {
  private readonly logger = new Logger(ArtistService.name);
  constructor(
    @InjectModel(ArtistType.name)
    private artistTypeModel: Model<ArtistTypeDocument>,
    @InjectModel(ArtistProfile.name)
    private artistProfileModel: Model<ArtistProfileDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(ArtistProfleUpdateRequest.name)
    private profileUpdateModel: Model<ArtistProfileUpdateRequestDocument>,
    @InjectModel(ArtistApplication.name)
    private applicationModel: Model<ArtistApplicationDocument>,
    @InjectModel(PortfolioItem.name)
    private portfolioItemModel: Model<PortfolioItemDocument>,
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
        match: { isActive: true, role: 'ARTIST' }
      })
      .select('-__v')
      .then(profiles => profiles.filter(profile => profile.user !== null));
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

  async listAllArtistType() {
    return await this.artistTypeModel.find();
  }

  //   ** get artist profile by user ID (for own profile)
  async getArtistProfileByUserId(userId: string) {
    const profile = await this.artistProfileModel
      .findOne({ user: userId })
      .populate({
        path: 'user',
        select: 'firstName lastName email phoneNumber role isActive',
      })
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
  }  //   ** create artist by admin
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

      artistUser.roleProfile = profile.id;
      artistUser.roleProfileRef = 'ArtistProfile';
      await artistUser.save();
      this.logger.log('Artist Created - Email will be sent upon activation');
      
      return {
        message: 'Artist created successfully. Account will be activated by admin.',
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
    if (payload.yearsOfExperience !== undefined) updates.yearsOfExperience = payload.yearsOfExperience;
    if (payload.musicLanguages) updates.musicLanguages = payload.musicLanguages;
    if (payload.awards) updates.awards = payload.awards;
    if (payload.pricePerHour !== undefined) updates.pricePerHour = payload.pricePerHour;
    if (payload.performPreference) updates.performPreference = payload.performPreference;

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

    // Check if there are any updates to submit
    if (Object.keys(updates).length === 0) {
      throw new BadRequestException('No changes provided for update request');
    }

    const request = await this.profileUpdateModel.create({
      artistProfile: profile.id,
      artistUser: artistUserId,
      proposedChanges: updates,
    });

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
        select: 'stageName'
      })
      .populate({
        path: 'artistUser',
        select: 'firstName lastName email'
      })
      .sort({ createdAt: -1 })
      .lean();

    // Transform profile update requests
    const transformedProfileRequests = profileRequests.map(request => ({
      ...request,
      type: 'PROFILE_UPDATE',
      requestedChanges: request.proposedChanges || {},
      artist: {
        _id: (request.artistProfile as any)?._id,
        stageName: (request.artistProfile as any)?.stageName || 'Unknown Artist',
        user: {
          firstName: (request.artistUser as any)?.firstName || 'Unknown',
          lastName: (request.artistUser as any)?.lastName || 'User',
          email: (request.artistUser as any)?.email || 'unknown@email.com'
        }
      },
      submittedAt: (request as any).createdAt
    }));

    // Transform portfolio requests
    const transformedPortfolioRequests = portfolioRequests.map(request => ({
      ...request,
      type: 'PORTFOLIO_ITEM',
      requestedChanges: {
        title: request.title,
        description: request.description,
        type: request.type,
        fileUrl: request.fileUrl
      },
      artist: {
        _id: (request.artistProfile as any)?._id,
        stageName: (request.artistProfile as any)?.stageName || 'Unknown Artist',
        user: {
          firstName: (request.artistUser as any)?.firstName || 'Unknown',
          lastName: (request.artistUser as any)?.lastName || 'User',
          email: (request.artistUser as any)?.email || 'unknown@email.com'
        }
      },
      submittedAt: (request as any).createdAt
    }));

    // Combine and sort all requests by creation date
    const allRequests = [...transformedProfileRequests, ...transformedPortfolioRequests]
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

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
    return requests.map(request => ({
      ...request,
      requestedChanges: request.proposedChanges || {}, // Fix typo and provide fallback
      artist: {
        _id: (request.artistProfile as any)._id,
        stageName: (request.artistProfile as any).stageName,
        user: {
          firstName: (request.artistUser as any).firstName,
          lastName: (request.artistUser as any).lastName,
          email: (request.artistUser as any).email
        }
      }
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
        }
      },
      { new: true }
    );

    if (approve && req.proposedChanges && Object.keys(req.proposedChanges).length > 0) {
      await this.artistProfileModel.updateOne(
        { _id: req.artistProfile },
        { $set: req.proposedChanges },
      );
    }

    return {
      message: approve
        ? 'Profile update sucessfully done'
        : 'Profile update request rejected',
    };
  }

  //   **Application submission code
  async createApplication(
    dto: CreateArtistApplicationDto,
    files?: {
      resume?: Express.Multer.File[];
      profileImage?: Express.Multer.File[];
    }
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

  async deleteArtistApplication(id:string){
    const app = await this.applicationModel.findById({_id:id})
    if(!app){
      throw new NotFoundException("Application not found")
    }
    return await this.applicationModel.deleteOne({_id:id})
  }

  async getApplicationById(id:string){
    const app = await this.applicationModel.findById({_id:id})
     if(!app){
      throw new NotFoundException("Application not found")
    }
    return app
  }

  async verifyArtist(artistId: string, isVerified: boolean) {
    try {
      // Find the artist profile
      const artistProfile = await this.artistProfileModel.findById(artistId).populate('user');
      
      if (!artistProfile) {
        throw new NotFoundException('Artist profile not found');
      }

      // Update the user's isActive status to reflect verification
      await this.userModel.findByIdAndUpdate(
        artistProfile.user,
        { isActive: isVerified },
        { new: true }
      );

      this.logger.log(`Artist ${artistProfile.stageName} has been ${isVerified ? 'verified' : 'unverified'}`);
      
      return {
        message: `Artist ${isVerified ? 'verified' : 'unverified'} successfully`,
        artistId,
        isVerified
      };
    } catch (error) {
      this.logger.error(`Failed to ${isVerified ? 'verify' : 'unverify'} artist: ${error.message}`);
      throw new BadRequestException(`Failed to ${isVerified ? 'verify' : 'unverify'} artist`);
    }
  }

  async toggleArtistVisibility(artistId: string, isVisible: boolean) {
    try {
      // Find and update the artist profile
      const artistProfile = await this.artistProfileModel.findByIdAndUpdate(
        artistId,
        { isVisible: isVisible },
        { new: true }
      ).populate('user');
      
      if (!artistProfile) {
        throw new NotFoundException('Artist profile not found');
      }

      this.logger.log(`Artist ${artistProfile.stageName} visibility has been ${isVisible ? 'enabled' : 'disabled'}`);
      
      return {
        message: `Artist visibility ${isVisible ? 'enabled' : 'disabled'} successfully`,
        artistId,
        isVisible
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
    file: Express.Multer.File
  ) {
    // Find artist profile
    const artistProfile = await this.artistProfileModel.findOne({ user: artistUserId });
    if (!artistProfile) {
      throw new NotFoundException('Artist profile not found');
    }

    // Upload file to S3
    const fileUrl = await this.s3Service.uploadFile(
      file,
      `portfolio/${dto.type}s`
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
        { path: 'artistUser', select: 'firstName lastName' }
      ])
    };
  }

  async getMyPortfolioItems(artistUserId: string, status?: PortfolioItemStatus) {
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
        isActive: true 
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
    return items.map(item => ({
      ...item,
      artistProfile: {
        ...(item.artistProfile as any),
        user: item.artistUser
      }
    }));
  }

  async reviewPortfolioItem(
    adminId: string,
    portfolioItemId: string,
    approve: boolean,
    reviewComment?: string
  ) {
    const portfolioItem = await this.portfolioItemModel.findById(portfolioItemId);
    if (!portfolioItem) {
      throw new NotFoundException('Portfolio item not found');
    }

    if (portfolioItem.status !== PortfolioItemStatus.PENDING) {
      throw new BadRequestException('Portfolio item has already been reviewed');
    }

    portfolioItem.status = approve ? PortfolioItemStatus.APPROVED : PortfolioItemStatus.REJECTED;
    portfolioItem.reviewedBy = new Types.ObjectId(adminId);
    portfolioItem.reviewComment = reviewComment || '';
    portfolioItem.reviewedAt = new Date();

    await portfolioItem.save();

    return {
      message: `Portfolio item ${approve ? 'approved' : 'rejected'} successfully`,
      portfolioItem: await portfolioItem.populate([
        { path: 'artistProfile', select: 'stageName' },
        { path: 'artistUser', select: 'firstName lastName email' },
        { path: 'reviewedBy', select: 'firstName lastName' }
      ])
    };
  }

  async deletePortfolioItem(artistUserId: string, portfolioItemId: string) {
    const portfolioItem = await this.portfolioItemModel.findOne({
      _id: portfolioItemId,
      artistUser: artistUserId
    });

    if (!portfolioItem) {
      throw new NotFoundException('Portfolio item not found');
    }

    // Delete file from S3
    try {
      // Extract S3 key from URL and delete
      // Implementation depends on your S3 URL structure
      await this.s3Service.deleteFile(portfolioItem.fileUrl);
      if (portfolioItem.thumbnailUrl && portfolioItem.thumbnailUrl !== portfolioItem.fileUrl) {
        await this.s3Service.deleteFile(portfolioItem.thumbnailUrl);
      }
    } catch (error) {
      this.logger.warn(`Failed to delete S3 files for portfolio item ${portfolioItemId}: ${error.message}`);
    }

    await portfolioItem.deleteOne();

    return {
      message: 'Portfolio item deleted successfully'
    };
  }

  async incrementPortfolioViews(portfolioItemId: string) {
    await this.portfolioItemModel.findByIdAndUpdate(
      portfolioItemId,
      { $inc: { views: 1 } }
    );
  }

  async togglePortfolioLike(portfolioItemId: string, increment: boolean) {
    const updateQuery = increment 
      ? { $inc: { likes: 1 } }
      : { $inc: { likes: -1 } };

    await this.portfolioItemModel.findByIdAndUpdate(
      portfolioItemId,
      updateQuery
    );
  }
}
