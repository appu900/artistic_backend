import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserRole } from 'src/common/enums/roles.enum';
import { User, UserDocument } from 'src/infrastructure/database/schemas';
import { RegisterUserDto } from './dto/Register-user.dto';
import * as bcrypt from 'bcrypt';
import { EmailService } from 'src/infrastructure/email/email.service';
import { EmailTemplate } from 'src/common/enums/mail-templates.enum';

@Injectable()
export class UserService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly emailService: EmailService,
  ) {}

  async createUser(payload: RegisterUserDto, role: UserRole) {
    const existingUser = await this.userModel.findOne({ email: payload.email });
    if (existingUser) throw new BadRequestException('Email is taken');
    const existingUserWithSamePhoneNumber = await this.userModel.findOne({
      phoneNumber: payload.phoneNumber,
    });
    if (existingUserWithSamePhoneNumber)
      throw new BadRequestException('User already exists');
    const salt = await bcrypt.genSalt(10);
    const hashString = await bcrypt.hash(payload.password, salt);
    const created = await this.userModel.create({
      email: payload.email,
      passwordHash: hashString,
      role: role,
      firstName: payload.firstName,
      lastName: payload.lastName,
      phoneNumber: payload.phoneNumber,
    });
    const createdUser = created.toObject();
    return {
      phoneNumber: createdUser.phoneNumber,
      message: 'please verify the otp',
    };
  }

  async findByEmail(email: string) {
    return this.userModel.findOne({ email }).lean();
  }

  async findById(id: string) {
    const u = await this.userModel.findById(id).populate('roleProfile').lean();
    if (u) throw new NotFoundException('User Not Found');
    return u;
  }

  async listAll() {
    return this.userModel.find().lean();
  }

  async toggleUserStatus(id: string) {
    const user = await this.userModel.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const wasInactive = !user.isActive;
    user.isActive = !user.isActive;
    await user.save();

    // If user was inactive and is now being activated, and is an artist, send welcome email
    if (wasInactive && user.isActive && user.role === UserRole.ARTIST) {
      let passwordToSend = user.tempPassword;
      
      // If no temp password stored, generate a new one
      if (!passwordToSend) {
        passwordToSend = Math.random().toString(36).slice(-8);
        const hashedPassword = await bcrypt.hash(passwordToSend, 10);
        user.passwordHash = hashedPassword;
        await user.save();
      }

      // Send welcome email with login credentials
      try {
        await this.emailService.queueMail(
          EmailTemplate.ARTIST_ONBOARD,
          user.email,
          'Welcome to Artistic — Your Artist Account Has Been Activated',
          {
            firstName: user.firstName,
            artistName: `${user.firstName} ${user.lastName}`,
            email: user.email,
            password: passwordToSend,
            loginUrl: process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/auth/signin` : 'https://artistic.com/auth/signin',
            platformName: 'Artistic',
            year: new Date().getFullYear(),
          },
        );

        // Clear the temp password after sending email
        user.tempPassword = undefined;
        await user.save();
      } catch (error) {
        console.error('Failed to send activation email:', error);
      }
    }

    return {
      message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`,
      userId: user._id,
      isActive: user.isActive,
    };
  }
}
