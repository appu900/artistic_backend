import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from 'src/infrastructure/database/schemas/user.schema';
import { UserRole } from 'src/common/enums/roles.enum';
import { EmailService } from 'src/infrastructure/email/email.service';
import { EmailTemplate } from 'src/common/enums/mail-templates.enum';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface CreateUserRequest {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email: string;
  role: UserRole;
  addedBy?: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  async login(credentials: LoginRequest) {
    try {
      console.log('Login attempt for email:', credentials.email);
      
      const user = await this.userModel.findOne({ 
        email: credentials.email.toLowerCase() 
      }).lean();
      
      console.log('User found:', user ? 'Yes' : 'No');
      
      if (!user) {
        throw new UnauthorizedException('Invalid credentials');
      }

      if (!user.isActive) {
        throw new UnauthorizedException('Account is deactivated');
      }

      console.log('Checking password...');
      const isPasswordCorrect = await bcrypt.compare(credentials.password, user.passwordHash);
      console.log('Password correct:', isPasswordCorrect);
      
      if (!isPasswordCorrect) {
        throw new UnauthorizedException('Invalid credentials');
      }

      await this.userModel.updateOne(
        { _id: user._id },
        { lastLoginAt: new Date() }
      );

      const accessToken = await this.generateTokens(
        String(user._id),
        user.email,
        user.role,
        user.firstName,
        user.lastName
      );


      return {
        message: 'Login successful',
        role: user.role,
        access_token: accessToken,
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
        },
      };
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }


  async createUser(userData: CreateUserRequest, sendEmail: boolean = false) {
    if (!userData.email) {
      throw new BadRequestException('Email is required');
    }
    if (!userData.firstName) {
      throw new BadRequestException('First name is required');
    }
    if (!userData.lastName) {
      throw new BadRequestException('Last name is required');
    }
    if (!userData.phoneNumber) {
      throw new BadRequestException('Phone number is required');
    }

    const existingUser = await this.userModel.findOne({
      $or: [
        { email: userData.email.toLowerCase() },
        { phoneNumber: userData.phoneNumber }
      ]
    });

    if (existingUser) {
      throw new BadRequestException('User with this email or phone number already exists');
    }

    const plainPassword = this.generateRandomPassword();
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    const user = await this.userModel.create({
      firstName: userData.firstName,
      lastName: userData.lastName,
      email: userData.email.toLowerCase(),
      phoneNumber: userData.phoneNumber,
      passwordHash: hashedPassword,
      role: userData.role,
      addedBy: userData.addedBy || null,
      isActive: true,
      isEmailVerified: false,
    });

    if (sendEmail) {
     
      setTimeout(async () => {
        try {
          await this.sendWelcomeEmail(user, plainPassword);
        } catch (emailError) {
          console.error('Failed to send welcome email:', emailError);
        }
      }, 100); 
    }

    return {
      message: `${this.getRoleDisplayName(userData.role)} created successfully`,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
      },
      ...(sendEmail ? {} : { temporaryPassword: plainPassword })
    };
  }

  async changePassword(userId: string, newPassword: string) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (!this.isValidPassword(newPassword)) {
      throw new BadRequestException('Password does not meet security requirements');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.userModel.updateOne(
      { _id: userId },
      { passwordHash: hashedPassword }
    );

    return {
      message: 'Password updated successfully'
    };
  }

  private async sendWelcomeEmail(user: UserDocument, plainPassword: string) {
    try {
      const templateMap = {
        [UserRole.EQUIPMENT_PROVIDER]: EmailTemplate.EQUIPMENT_PROVIDER_ONBOARD,
        [UserRole.ARTIST]: EmailTemplate.ARTIST_ONBOARD,
      };

      const template = templateMap[user.role];
      if (!template) {
        console.log(`No email template for role: ${user.role}`);
        return;
      }

      const context = {
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: `${user.firstName} ${user.lastName}`,
        email: user.email,
        password: plainPassword,
        role: this.getRoleDisplayName(user.role),
        loginUrl: this.configService.get('FRONTEND_URL') + '/auth/signin',
        platformName: this.configService.get('PLATFORM_NAME', 'Artistic'),
        year: new Date().getFullYear(),
      };

     
      try {
        await this.emailService.queueMail(
          template,
          user.email,
          `Welcome to ${context.platformName} - Your ${context.role} Account`,
          context
        );
      } catch (queueError) {
        console.log(`Queue failed, sending email directly for: ${user.email}`);
        await this.emailService.sendMail(
          template,
          user.email,
          `Welcome to ${context.platformName} - Your ${context.role} Account`,
          context
        );
      }

    } catch (error) {
      console.error('Error in sendWelcomeEmail:', error);
     
    }
  }

  private generateRandomPassword(): string {
    const length = 12;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@$!%*?&';
    let password = '';
    
    password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)];
    password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
    password += '0123456789'[Math.floor(Math.random() * 10)];
    password += '@$!%*?&'[Math.floor(Math.random() * 7)];
    
    for (let i = password.length; i < length; i++) {
      password += charset[Math.floor(Math.random() * charset.length)];
    }
    
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }

  private isValidPassword(password: string): boolean {
    const minLength = 8;
    const hasLowerCase = /[a-z]/.test(password);
    const hasUpperCase = /[A-Z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[@$!%*?&]/.test(password);

    return password.length >= minLength && hasLowerCase && hasUpperCase && hasNumbers && hasSpecialChar;
  }

  private getRoleDisplayName(role: UserRole): string {
    const roleNames = {
      [UserRole.SUPER_ADMIN]: 'Super Admin',
      [UserRole.ADMIN]: 'Admin',
      [UserRole.ARTIST]: 'Artist',
      [UserRole.EQUIPMENT_PROVIDER]: 'Equipment Provider',
      [UserRole.VENUE_OWNER]: 'Venue Owner',
      [UserRole.NORMAL]: 'User',
    };
    return roleNames[role] || 'User';
  }

  private async generateTokens(
    userId: string,
    email: string,
    role: UserRole,
    firstName: string,
    lastName: string
  ) {
    const payload = {
      sub: userId,
      email,
      role,
      firstName,
      lastName,
    };
    
    return await this.jwtService.signAsync(payload);
  }

  async validateUser(userId: string) {
    const user = await this.userModel.findById(userId).lean();
    if (!user || !user.isActive) {
      return null;
    }
    return user;
  }
}