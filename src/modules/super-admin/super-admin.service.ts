import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from 'src/infrastructure/database/schemas';
import { CreateAdminDto } from './dto/create.admin.dto';
import { UpdateAdminDto } from './dto/update.admin.dto';
import * as bcrypt from 'bcrypt';
import { PasswordGenerator } from 'src/utils/generatePassword';
import { UserRole } from 'src/common/enums/roles.enum';
import { EmailService } from 'src/infrastructure/email/email.service';
import { EmailTemplate } from 'src/common/enums/mail-templates.enum';

interface FetchAdminsOptions {
  page?: number;
  limit?: number;
  search?: string;
  status?: boolean;
}

@Injectable()
export class SuperAdminService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly emailService: EmailService,
  ) {}

  async createAdmin(payload: CreateAdminDto, superAdminId?: string) {
    const existingAdmin = await this.userModel.findOne({
      $or: [{ phoneNumber: payload.phoneNumber }, { email: payload.email }],
    });
    
    if (existingAdmin) {
      throw new ConflictException(
        'Admin with this phone number or email already exists',
      );
    }

    const salt = await bcrypt.genSalt(10);
    const plainPassword = PasswordGenerator.generateRandomPassword();
    const hashedPassword = await bcrypt.hash(plainPassword, salt);
    
    const newAdmin = await this.userModel.create({
      firstName: payload.firstName,
      lastName: payload.lastName,
      passwordHash: hashedPassword,
      isActive: true,
      isEmailVerified: true,
      phoneNumber: payload.phoneNumber,
      email: payload.email,
      role: UserRole.ADMIN,
      createdBy: superAdminId,
    });

    // Send welcome email with credentials
    await this.emailService.queueMail(
      EmailTemplate.ADMIN_ONBOARD,
      newAdmin.email,
      'You have been added as an Admin - Artistic',
      {
        firstName: newAdmin.firstName,
        email: newAdmin.email,
        password: plainPassword,
      },
    );

    return {
      message: 'Admin created successfully',
      admin: {
        id: newAdmin._id,
        firstName: newAdmin.firstName,
        lastName: newAdmin.lastName,
        email: newAdmin.email,
        phoneNumber: newAdmin.phoneNumber,
        isActive: newAdmin.isActive,
        createdAt: (newAdmin as any).createdAt,
      },
    };
  }

  async fetchAllAdmins(options: FetchAdminsOptions = {}) {
    const { page = 1, limit = 10, search, status } = options;
    const skip = (page - 1) * limit;

    // Build query
    const query: any = { role: UserRole.ADMIN };
    
    if (status !== undefined) {
      query.isActive = status;
    }

    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const [admins, total] = await Promise.all([
      this.userModel
        .find(query)
        .select('-passwordHash -__v')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.userModel.countDocuments(query),
    ]);

    return {
      data: admins,
      pagination: {
        current: page,
        total: Math.ceil(total / limit),
        count: admins.length,
        totalItems: total,
      },
    };
  }

  async getAdminById(id: string) {
    const admin = await this.userModel
      .findOne({ _id: id, role: UserRole.ADMIN })
      .select('-passwordHash -__v')
      .lean();

    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    return {
      data: admin,
    };
  }

  async updateAdmin(id: string, payload: UpdateAdminDto, superAdminId: string) {
    const admin = await this.userModel.findOne({ _id: id, role: UserRole.ADMIN });

    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    // Check for conflicts if email or phone is being updated
    if (payload.email || payload.phoneNumber) {
      const conflictQuery: any = {
        _id: { $ne: id },
        $or: [],
      };

      if (payload.email) {
        conflictQuery.$or.push({ email: payload.email });
      }
      if (payload.phoneNumber) {
        conflictQuery.$or.push({ phoneNumber: payload.phoneNumber });
      }

      const existingUser = await this.userModel.findOne(conflictQuery);
      if (existingUser) {
        throw new ConflictException(
          'Another user with this email or phone number already exists',
        );
      }
    }

    const updatedAdmin = await this.userModel
      .findByIdAndUpdate(
        id,
        {
          ...payload,
          updatedBy: superAdminId,
          updatedAt: new Date(),
        },
        { new: true }
      )
      .select('-passwordHash -__v');

    return {
      message: 'Admin updated successfully',
      data: updatedAdmin,
    };
  }

  async toggleAdminStatus(id: string, superAdminId: string) {
    const admin = await this.userModel.findOne({ _id: id, role: UserRole.ADMIN });

    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    const newStatus = !admin.isActive;
    const updatedAdmin = await this.userModel
      .findByIdAndUpdate(
        id,
        {
          isActive: newStatus,
          updatedBy: superAdminId,
          updatedAt: new Date(),
        },
        { new: true }
      )
      .select('-passwordHash -__v');

    if (!updatedAdmin) {
      throw new NotFoundException('Failed to update admin status');
    }

    return {
      message: `Admin ${newStatus ? 'activated' : 'deactivated'} successfully`,
      data: updatedAdmin,
    };
  }

  async deleteAdmin(id: string, superAdminId: string) {
    const admin = await this.userModel.findOne({ _id: id, role: UserRole.ADMIN });

    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    await this.userModel.findByIdAndDelete(id);

    return {
      message: 'Admin deleted successfully',
    };
  }

  async resetAdminPassword(id: string, superAdminId: string) {
    const admin = await this.userModel.findOne({ _id: id, role: UserRole.ADMIN });

    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    const salt = await bcrypt.genSalt(10);
    const newPlainPassword = PasswordGenerator.generateRandomPassword();
    const hashedPassword = await bcrypt.hash(newPlainPassword, salt);

    await this.userModel.findByIdAndUpdate(id, {
      passwordHash: hashedPassword,
      updatedBy: superAdminId,
      updatedAt: new Date(),
    });

    // Send email with new password
    await this.emailService.queueMail(
      EmailTemplate.ADMIN_ONBOARD, // Reuse the same template
      admin.email,
      'Your Password Has Been Reset - Artistic',
      {
        firstName: admin.firstName,
        email: admin.email,
        password: newPlainPassword,
      },
    );

    return {
      message: 'Password reset successfully. New credentials sent to admin email.',
    };
  }
}
