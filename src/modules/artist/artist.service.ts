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
    private readonly s3Service: S3Service,
    private readonly emailService: EmailService,
  ) {}

  //   ** list all artist
  async listAllArtist_PUBLIC() {
    return await this.artistProfileModel
      .find()
      .populate({
        path: 'user',
        select: 'firstName lastName role isActive',
      })
      .select('-__v');
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

  //   ** create artist by admin
  async createArtistByAdmin(
    dto: CreateArtistDto,
    addedByAdminId: string,
    files: {
      profileImage?: Express.Multer.File[];
      profileCoverImage?: Express.Multer.File[];
      demoVideo?: Express.Multer.File[];
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
        role: UserRole.ARTIST,
        isActive: true,
        phoneNumber: dto.phoneNumber,
        email: dto.email,
      });

      let profileImageUrl = '';
      let coverImageUrl = '';
      let demoVideoUrl = '';

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
      if (files?.demoVideo?.[0]) {
        demoVideoUrl = await this.s3Service.uploadFile(
          files.demoVideo[0],
          'artists/demo-videos',
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
        demoVideo: demoVideoUrl,
        profileImage: profileImageUrl,
        gender: dto.gender,
      });
      this.logger.log('profile creation done');

      artistUser.roleProfile = profile.id;
      artistUser.roleProfileRef = 'ArtistProfile';
      await artistUser.save();
      this.logger.log('Artist Created:');
      await this.emailService.queueMail(
        EmailTemplate.ARTIST_ONBOARD,
        artistUser.email,
        'Welcome to Artistic — Your Artist Account Has Been Created',
        {
          artistName: `${artistUser.firstName} ${artistUser.lastName}`,
          email: artistUser.email,
          password: plainPassword, // 👈 share temporary password
          loginUrl: 'https://artistic.com/login',
          platformName: 'Artistic',
          year: new Date().getFullYear(),
        },
      );
      return {
        message: 'Artist created sucessfully',
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

  //   ** handle updateProfile Request from the artist
  async requestProfileUpdate(
    artistUserId: string,
    payload: UpdateArtistProfileDto,
    files: {
      profileImage?: Express.Multer.File[];
      profileCoverImage?: Express.Multer.File[];
      demoVideo?: Express.Multer.File[];
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
    if (payload.genres) updates.genres = payload.genres;
    if (payload.category) updates.category = payload.category;
    if (payload.skills) updates.skills = payload.skills;

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

    if (files?.demoVideo?.[0]) {
      updates.demoVideo = await this.s3Service.uploadFile(
        files.demoVideo[0],
        'artists/demo-videos',
      );
    }

    const request = await this.profileUpdateModel.create({
      artistProfile: profile.id,
      artistUser: artistUserId,
      proposedChnages: updates,
    });

    return { message: 'update request submitted sucessfully' };
  }

  async getPendingRequests() {
    return await this.profileUpdateModel
      .find({ status: UpdateStatus.PENDING })
      .populate('artistProfile', 'stageName')
      .populate('artistUser', 'firstName lastName email');
  }

  async reviewProflileUpdateRequest(
    adminId: string,
    requestId: string,
    approve: boolean,
    comment?: string,
  ) {
    const req = await this.profileUpdateModel.findById(requestId);
    if (!req) throw new NotFoundException('Request Not found');
    req.status = approve ? UpdateStatus.ACCEPTED : UpdateStatus.REJECTED;
    req.reviewedBy = new Types.ObjectId(adminId);
    req.adminComment = comment || '';
    await req.save();
    if (approve) {
      await this.artistProfileModel.updateOne(
        { _id: req.artistProfile },
        { $set: req.proposedChnages },
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
    file?: Express.Multer.File,
  ) {
    let resumeURL = '';
    if (file) {
      resumeURL = await this.s3Service.uploadFile(
        file,
        'artist-applications/resumes',
      );
    }
    const app = await this.applicationModel.create({
      ...dto,
      resume: resumeURL,
    });
    return {
      message: 'Apllication submitted successfully',
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

      // You could also add a verified field to the artist profile schema if needed
      // await this.artistProfileModel.findByIdAndUpdate(
      //   artistId,
      //   { isVerified: isVerified },
      //   { new: true }
      // );

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
}
