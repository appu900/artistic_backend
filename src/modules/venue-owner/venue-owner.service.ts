import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from 'src/infrastructure/database/schemas';
import {
  VenueOwnerProfile,
  VenueOwnerProfileDocument,
} from 'src/infrastructure/database/schemas/venue-owner-profile.schema';
import { S3Service } from 'src/infrastructure/s3/s3.service';
import { EmailService } from 'src/infrastructure/email/email.service';
import { CreateVenueOwnerProfileDto } from './dto/create-venue-owner.dto';
import * as bcrypt from 'bcrypt';
import { PasswordGenerator } from 'src/utils/generatePassword';
import { UpdateVenueOwnerProfileDto } from './dto/update-venue-owner.dto';
import { UserRole } from 'src/common/enums/roles.enum';
import { Type } from 'class-transformer';

@Injectable()
export class VenueOwnerService {
  constructor(
    @InjectModel(VenueOwnerProfile.name)
    private venueOwnerProfileModel: Model<VenueOwnerProfileDocument>,
    @InjectModel(User.name) private UserModel: Model<UserDocument>,
    private s3Service: S3Service,
    private emailService: EmailService,
  ) {}

  async create(
    payload: CreateVenueOwnerProfileDto,
    files: {
      profileImage?: Express.Multer.File[];
      coverPhoto?: Express.Multer.File[];
    },
  ) {
    const userExists = await this.UserModel.findOne({
      $or: [{ email: payload.email }, { phoneNumber: payload.phoneNumber }],
    });
    if (userExists) {
      throw new ConflictException(
        'User with this phoneNumber or email already exists',
      );
    }

    let profileImageUrl: string | undefined;
    let coverImageUrl: string | undefined;

    if (files?.profileImage?.[0]) {
      profileImageUrl = await this.s3Service.uploadFile(
        files.profileImage[0],
        'venue-owner',
      );
    }
    if (files?.coverPhoto?.[0]) {
      coverImageUrl = await this.s3Service.uploadFile(
        files.coverPhoto[0],
        'venue-owner-cover',
      );
    }
    const salt = await bcrypt.genSalt(10);
    const plainPassword = PasswordGenerator.generateRandomPassword();
    const hashedPassword = await bcrypt.hash(plainPassword, salt);
    const user = await this.UserModel.create({
      firstName: payload.firstName,
      lastName: payload.lastName,
      email: payload.email,
      phoneNumber: payload.phoneNumber,
      passwordHash: hashedPassword,
      isPhoneVerified: true,
      role: UserRole.VENUE_OWNER,
      isActive: true,
    });
    console.log('user created successfully...');
    console.log('now creating the venueOwenr profile');
    const profile = await this.venueOwnerProfileModel.create({
      user: user._id,
      category: payload.category,
      address: payload.address,
      profileImage: profileImageUrl,
      coverPhoto: coverImageUrl,
    });
    // linking the profileId of venue owner to the user
    user.roleProfile = profile._id as Types.ObjectId;
    await user.save();
    
    // Send welcome email to the venue owner with credentials
    try {
      await this.emailService.sendVenueProviderOnboardEmail(
        user.email,
        user.firstName,
        user.lastName,
        plainPassword,
        payload.category,
        payload.address,
      );
      console.log('✅ Welcome email sent to venue owner:', user.email);
    } catch (emailError) {
      console.error('❌ Failed to send welcome email:', emailError.message);
      // Don't fail the user creation if email fails
    }
    
    console.log('This is the plainPassword of the venue owner', plainPassword);
    return {
      message: 'venue owner created sucessfully',
      data: profile,
    };
  }

  async updateVenueOwnerProfile(
    userId: string,
    dto: UpdateVenueOwnerProfileDto,
    files?: {
      profileImage?: Express.Multer.File[];
      coverPhoto?: Express.Multer.File[];
    },
  ) {
    const ownerId = new Types.ObjectId(userId);
    const venueOwner = await this.UserModel.findById(ownerId);
    if (!venueOwner) {
      throw new BadRequestException('account not found');
    }
    const profile = await this.venueOwnerProfileModel.findOne({
      user: ownerId,
    });
    if (!profile) throw new NotFoundException('Venue owner profile not found');

    if (files?.profileImage?.[0]) {
      if (profile.profileImage) {
        await this.s3Service.deleteFile(profile.profileImage);
      }
      profile.profileImage = await this.s3Service.uploadFile(
        files.profileImage[0],
        'venue-owner/profile',
      );
    }

    if (files?.coverPhoto?.[0]) {
      if (profile.coverPhoto) {
        await this.s3Service.deleteFile(profile.coverPhoto);
      }
      profile.coverPhoto = await this.s3Service.uploadFile(
        files.coverPhoto[0],
        'venue-owner/cover',
      );
    }

    if (dto.address) {
      profile.address = dto.address;
    }
    if (dto.category) {
      profile.category = dto.category;
    }
    await profile.save();

    console.log(`Venue owner profile updated for user ${userId}`);
    return {
      message: 'Venue owner profile updated successfully',
      data: profile,
    };
  }

  async getAllVenueOwnersWithProfiles() {
    const result = await this.UserModel.aggregate([
      {
        $match: {
          role: UserRole.VENUE_OWNER,
        },
      },
      {
        $lookup: {
          from: 'venueownerprofiles',
          localField: 'roleProfile',
          foreignField: '_id',
          as: 'profile',
        },
      },
      {
        $unwind: {
          path: '$profile',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 1,
          firstName: 1,
          lastName: 1,
          email: 1,
          phoneNumber: 1,
          role: 1,
          createdAt: 1,
          'profile._id': 1,
          'profile.category': 1,
          'profile.address': 1,
          'profile.profileImage': 1,
          'profile.coverPhoto': 1,
          'profile.createdAt': 1,
        },
      },
      { $sort: { createdAt: -1 } },
    ]);

    console.log(`Fetched ${result.length} venue owners with profiles`);
    return {
      count: result.length,
      data: result,
    };
  }

  async getVenueOwnerProfileDetails(userId: string) {
    const objectId = new Types.ObjectId(userId);
    const user = await this.UserModel.findById(objectId);
    if (!user) throw new NotFoundException('account not found');
    const profileDetails = await this.venueOwnerProfileModel.find({
      user: user._id,
    });
    return {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      profileData: profileDetails,
    };
  }

  async delete(userId: string) {
    const objectUserId = new Types.ObjectId(userId);
    const user = await this.UserModel.findById(objectUserId);
    if (!user) {
      throw new BadRequestException('user not found');
    }
    // delete profile frst
    try {
      await this.UserModel.deleteOne({ _id: objectUserId });
      await this.venueOwnerProfileModel.deleteOne({ user: user._id });
      return 'delete sucessfull';
    } catch (error) {
      throw error;
    }
  }

  async getAllVenueProvidersForAdmin() {
    try {
      const venueProviders = await this.UserModel.aggregate([
        {
          $match: {
            role: UserRole.VENUE_OWNER,
          },
        },
        {
          $lookup: {
            from: 'venueownerprofiles',
            localField: '_id',
            foreignField: 'user',
            as: 'profile',
          },
        },
        {
          $unwind: {
            path: '$profile',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            _id: 1,
            firstName: 1,
            lastName: 1,
            email: 1,
            phoneNumber: 1,
            role: 1,
            isActive: 1,
            createdAt: 1,
            updatedAt: 1,
            profile: {
              address: 1,
              category: 1,
              profileImage: 1,
              coverPhoto: 1,
              isApproved: 1,
            },
          },
        },
        {
          $sort: { createdAt: -1 },
        },
      ]);

      return {
        success: true,
        data: venueProviders,
        message: 'Venue providers retrieved successfully',
      };
    } catch (error) {
      throw new BadRequestException(
        'Failed to retrieve venue providers: ' + error.message,
      );
    }
  }
}
