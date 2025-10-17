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
import { SmsService } from 'src/infrastructure/sms/sms.service';
import { RedisService } from 'src/infrastructure/redis/redis.service';
import { SignupUserDto } from './dto/signup-user.dto';
import { VerifyOtpDto, ResendOtpDto } from './dto/otp.dto';

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
    private readonly smsService: SmsService,
    private readonly redisService: RedisService,
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

  /**
   * Normal user signup with OTP verification
   */
  async signupUser(userData: SignupUserDto) {
    // Check if user already exists
    const existingUser = await this.userModel.findOne({
      $or: [
        { email: userData.email.toLowerCase() },
        { phoneNumber: this.formatPhoneNumber(userData.phoneNumber) }
      ]
    });

    if (existingUser) {
      throw new BadRequestException('User with this email or phone number already exists');
    }

    // Validate password
    if (!this.isValidPassword(userData.password)) {
      throw new BadRequestException('Password does not meet security requirements');
    }

    const hashedPassword = await bcrypt.hash(userData.password, 10);
    const formattedPhone = this.formatPhoneNumber(userData.phoneNumber);
    const otp = this.smsService.generateOtp();
    const otpExpiry = this.smsService.getOtpExpiry();

    // Create user with pending verification
    const user = await this.userModel.create({
      firstName: userData.firstName,
      lastName: userData.lastName,
      email: userData.email.toLowerCase(),
      phoneNumber: formattedPhone,
      passwordHash: hashedPassword,
      role: UserRole.NORMAL,
      isActive: false, // Account inactive until phone verified
      isEmailVerified: false,
      isPhoneVerified: false,
      otp,
      otpExpiry,
    });

    // Send OTP SMS
    try {
      await this.smsService.sendOtpSms(formattedPhone, otp, userData.firstName);
    } catch (error) {
      // If SMS fails, delete the user and throw error
      await this.userModel.deleteOne({ _id: user._id });
      throw new BadRequestException('Failed to send OTP. Please try again.');
    }

    return {
      message: 'User registered successfully. Please verify your phone number with the OTP sent to you.',
      phoneNumber: this.maskPhoneNumber(formattedPhone),
      userId: user._id,
    };
  }

  /**
   * Verify OTP and activate user account
   */
  async verifyOtp(verifyData: VerifyOtpDto) {
    const formattedPhone = this.formatPhoneNumber(verifyData.phoneNumber);
    
    const user = await this.userModel.findOne({
      phoneNumber: formattedPhone,
      role: UserRole.NORMAL,
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.isActive && user.isPhoneVerified) {
      throw new BadRequestException('Account is already verified');
    }

    if (!user.otp || !user.otpExpiry) {
      throw new BadRequestException('No OTP found. Please request a new OTP.');
    }

    if (this.smsService.isOtpExpired(user.otpExpiry)) {
      throw new BadRequestException('OTP has expired. Please request a new OTP.');
    }

    if (user.otp !== verifyData.otp) {
      throw new BadRequestException('Invalid OTP');
    }

    // Activate user account
    await this.userModel.updateOne(
      { _id: user._id },
      {
        isActive: true,
        isPhoneVerified: true,
        otp: null,
        otpExpiry: null,
      }
    );

    // Generate access token
    const accessToken = await this.generateTokens(
      String(user._id),
      user.email,
      user.role,
      user.firstName,
      user.lastName
    );

    return {
      message: 'Account verified successfully',
      access_token: accessToken,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        isActive: true,
        isPhoneVerified: true,
      },
    };
  }

  /**
   * Resend OTP to user
   */
  async resendOtp(resendData: ResendOtpDto) {
    const formattedPhone = this.formatPhoneNumber(resendData.phoneNumber);
    
    const user = await this.userModel.findOne({
      phoneNumber: formattedPhone,
      role: UserRole.NORMAL,
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.isActive && user.isPhoneVerified) {
      throw new BadRequestException('Account is already verified');
    }

    // Generate new OTP
    const otp = this.smsService.generateOtp();
    const otpExpiry = this.smsService.getOtpExpiry();

    // Update user with new OTP
    await this.userModel.updateOne(
      { _id: user._id },
      { otp, otpExpiry }
    );

    // Send new OTP SMS
    try {
      await this.smsService.sendOtpSms(formattedPhone, otp, user.firstName);
    } catch (error) {
      throw new BadRequestException('Failed to send OTP. Please try again.');
    }

    return {
      message: 'OTP sent successfully',
      phoneNumber: this.maskPhoneNumber(formattedPhone),
    };
  }

  /**
   * Format phone number for international storage and SMS
   */
  private formatPhoneNumber(phoneNumber: string): string {
    // If already starts with +, remove it and store digits only
    if (phoneNumber.startsWith('+')) {
      return phoneNumber.substring(1);
    }

    // If it's all digits, assume it's already formatted correctly
    if (/^\d+$/.test(phoneNumber)) {
      return phoneNumber;
    }

    // Clean and return digits only
    return phoneNumber.replace(/\D/g, '');
  }

  /**
   * Mask phone number for privacy (show only last 4 digits)
   */
  private maskPhoneNumber(phoneNumber: string): string {
    if (phoneNumber.length <= 4) return phoneNumber;
    const visiblePart = phoneNumber.slice(-4);
    const maskedPart = '*'.repeat(phoneNumber.length - 4);
    return maskedPart + visiblePart;
  }

  /**
   * Send OTP to email for password change
   */
  async sendPasswordChangeOtp(email: string) {
    const user = await this.userModel.findOne({ email: email.toLowerCase() });
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store OTP in Redis with email as key (prefix with 'otp:' to ensure it's stored as string)
    const redisKey = `password_change_otp:${email.toLowerCase()}`;
    await this.redisService.set(redisKey, `otp:${otp}`, 600); // 10 minutes TTL

    // Send OTP via email
    try {
      await this.emailService.sendPasswordChangeOtp(user.email, otp, user.firstName);
    } catch (error) {
      console.error('Failed to send OTP email:', error);
      throw new BadRequestException('Failed to send OTP email. Please try again.');
    }

    return {
      message: 'OTP sent to your email successfully',
      email: this.maskEmail(email),
    };
  }

  /**
   * Verify OTP for password change
   */
  async verifyPasswordChangeOtp(email: string, otp: string) {
    const redisKey = `password_change_otp:${email.toLowerCase()}`;
    const storedOtp = await this.redisService.get(redisKey);

    if (!storedOtp) {
      throw new BadRequestException('OTP has expired or is invalid');
    }

    // Extract OTP from stored value (remove 'otp:' prefix)
    const actualStoredOtp = String(storedOtp).replace('otp:', '');
    
    if (actualStoredOtp !== String(otp)) {
      throw new BadRequestException('Invalid OTP');
    }

    const changePasswordToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const tokenKey = `password_change_token:${email.toLowerCase()}`;
    await this.redisService.set(tokenKey, changePasswordToken, 300); // 5 minutes TTL


    return {
      message: 'OTP verified successfully',
      changePasswordToken,
    };
  }

  /**
   * Change password with verified OTP
   */
  async changePasswordWithOtp(email: string, otp: string, newPassword: string) {
    // First verify the OTP again for security
    const redisKey = `password_change_otp:${email.toLowerCase()}`;
    const storedOtp = await this.redisService.get(redisKey);

    if (!storedOtp) {
      throw new BadRequestException('OTP has expired or is invalid');
    }

    // Extract OTP from stored value (remove 'otp:' prefix)
    const actualStoredOtp = String(storedOtp).replace('otp:', '');
    
    if (actualStoredOtp !== String(otp)) {
      throw new BadRequestException('Invalid OTP');
    }

    const user = await this.userModel.findOne({ email: email.toLowerCase() });
    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (!this.isValidPassword(newPassword)) {
      throw new BadRequestException('Password does not meet security requirements');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update password
    await this.userModel.updateOne(
      { email: email.toLowerCase() },
      { passwordHash: hashedPassword }
    );

    // Remove used OTP
    await this.redisService.del(redisKey);

    // Send confirmation email
    try {
      await this.emailService.sendPasswordChangeConfirmation(user.email, user.firstName);
    } catch (error) {
      console.error('Failed to send password change confirmation email:', error);
      // Don't throw error as password was successfully changed
    }

    return {
      message: 'Password changed successfully',
    };
  }

  /**
   * Mask email for privacy (show only first and last character of local part)
   */
  private maskEmail(email: string): string {
    const [localPart, domain] = email.split('@');
    if (localPart.length <= 2) {
      return `${localPart}@${domain}`;
    }
    const masked = localPart.charAt(0) + '*'.repeat(localPart.length - 2) + localPart.charAt(localPart.length - 1);
    return `${masked}@${domain}`;
  }
}