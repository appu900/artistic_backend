import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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

@Injectable()
export class ArtistService {
  private readonly logger = new Logger(ArtistService.name);
  constructor(
    @InjectModel(ArtistType.name)
    private artistTypeModel: Model<ArtistTypeDocument>,
    @InjectModel(ArtistProfile.name)
    private artistProfileModel: Model<ArtistProfileDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly s3Service: S3Service,
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
      if (existing)
        throw new BadRequestException('Email or phoneNumber already exists');
      const hashedPassword = await bcrypt.hash(
        Math.random().toString(36).slice(-8),
        10,
      );
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
      });
      this.logger.log('profile creation done');

      artistUser.roleProfile = profile.id;
      artistUser.roleProfileRef = 'ArtistProfile';
      await artistUser.save();
      this.logger.log('Artist Created:');
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
}
