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
import {
  VenueOwnerApplication,
  VenueOwnerApplicationDocument,
  VenueApplicationStatus,
} from 'src/infrastructure/database/schemas/venue-owner-application.schema';
import { CreateVenueOwnerApplicationDto } from './dto/venue-owner-application.dto';
import { EmailTemplate } from 'src/common/enums/mail-templates.enum';

@Injectable()
export class VenueOwnerService {
  constructor(
    @InjectModel(VenueOwnerProfile.name)
    private venueOwnerProfileModel: Model<VenueOwnerProfileDocument>,
    @InjectModel(User.name) private UserModel: Model<UserDocument>,
    @InjectModel(VenueOwnerApplication.name)
    private venueOwnerApplicationModel: Model<VenueOwnerApplicationDocument>,
    private s3Service: S3Service,
    private emailService: EmailService,
  ) {}

  // --- Venue Owner Applications ---

  async submitApplication(
    dto: CreateVenueOwnerApplicationDto,
    files?: {
      license?: Express.Multer.File[];
      venueImage?: Express.Multer.File[];
    },
  ) {
    // Upload files to S3 if present
    let licenseUrl: string | undefined;
    let venueImageUrl: string | undefined;

    if (files?.license?.[0]) {
      licenseUrl = await this.s3Service.uploadFile(
        files.license[0],
        'venue-applications/licenses',
      );
    }
    if (files?.venueImage?.[0]) {
      venueImageUrl = await this.s3Service.uploadFile(
        files.venueImage[0],
        'venue-applications/images',
      );
    }

    const app = await this.venueOwnerApplicationModel.create({
      ...dto,
      licenseUrl,
      venueImageUrl,
      status: VenueApplicationStatus.PENDING,
    });

    // Notify admins (non-blocking)
    try {
      const adminUsers = await this.getActiveAdmins();
      const actionUrl = process.env.FRONTEND_URL
        ? `${process.env.FRONTEND_URL}/dashboard/admin/venue-applications`
        : 'https://artistic.global/dashboard/admin/venue-applications';
      const title = 'New Venue Provider Application Submitted';
      const intro = `${dto.name} has submitted a new venue provider application.`;
      const details = [
        { label: 'Name', value: dto.name },
        { label: 'Email', value: dto.email },
        { label: 'Phone', value: dto.phoneNumber },
        { label: 'Venue', value: dto.venue },
        { label: 'Company', value: dto.companyName },
        { label: 'Submitted At', value: new Date().toLocaleString() },
      ];
      await Promise.all(
        adminUsers.map((admin) =>
          this.emailService
            .sendMail(
              EmailTemplate.ADMIN_NOTIFICATION,
              admin.email,
              'New Venue Provider Application – Review Required',
              {
                title,
                intro,
                details,
                actionUrl,
                actionText: 'Review Venue Applications',
              },
            )
            .catch((e) =>
              console.warn(`Failed notifying admin ${admin.email}: ${e.message}`),
            ),
        ),
      );
    } catch (e) {
      console.warn(`Admin notification (venue application) failed: ${e.message}`);
    }

    return {
      message: 'Application submitted successfully',
      data: app,
    };
  }

  async listApplications(status?: VenueApplicationStatus) {
    const query = status ? { status } : {};
    const list = await this.venueOwnerApplicationModel
      .find(query)
      .sort({ createdAt: -1 })
      .lean();
    return { count: list.length, data: list };
  }

  async reviewApplication(id: string, status: 'APPROVED' | 'REJECTED') {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid application id');
    }
    const app = await this.venueOwnerApplicationModel.findById(id);
    if (!app) throw new NotFoundException('Application not found');
    app.status = status as VenueApplicationStatus;
    await app.save();

    // On approval, email the applicant (non-blocking)
    if (status === 'APPROVED') {
      try {
        await this.emailService.sendMail(
          EmailTemplate.ADMIN_NOTIFICATION,
          app.email,
          'Your Venue Provider Application Has Been Approved',
          {
            title: 'Application Approved ✅',
            intro:
              'Congratulations! Your application to become a Venue Provider on Artistic has been approved.',
            details: [
              { label: 'Name', value: app.name },
              { label: 'Venue', value: app.venue },
              { label: 'Company', value: app.companyName },
              { label: 'Approved At', value: new Date().toLocaleString() },
            ],
            actionUrl: process.env.FRONTEND_URL
              ? `${process.env.FRONTEND_URL}/auth/signin`
              : 'https://artistic.global/auth/signin',
            actionText: 'SIGN IN',
          },
        );
      } catch (e) {
        console.warn(`Failed to send approval email to ${app.email}: ${e.message}`);
      }
    }

    return {
      message: `Application ${status.toLowerCase()}`,
      data: app,
    };
  }

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
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid userId');
    }
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
    console.log('getVenueOwnerProfileDetails called with userId:', userId);
    
    if (!Types.ObjectId.isValid(userId)) {
      console.error('Invalid userId provided:', userId);
      throw new BadRequestException('Invalid userId');
    }
    
    const objectId = new Types.ObjectId(userId);
    const user = await this.UserModel.findById(objectId);
    
    if (!user) {
      console.error('User not found for userId:', userId);
      throw new NotFoundException('account not found');
    }
    
    console.log('Found user:', { id: user._id, role: user.role, email: user.email });
    
    const profileDetails = await this.venueOwnerProfileModel.find({
      user: user._id,
    });
    
    console.log('Found venue owner profiles:', profileDetails.length);
    profileDetails.forEach((profile, index) => {
      console.log(`Profile ${index}:`, { id: profile._id, category: profile.category });
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
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid userId');
    }
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
              _id: 1,
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

  // Helper: get active admins
  private async getActiveAdmins(): Promise<Array<{ email: string } & any>> {
    return this.UserModel.find({
      role: { $in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] },
      isActive: true,
    })
      .select('email firstName lastName')
      .lean();
  }
}
