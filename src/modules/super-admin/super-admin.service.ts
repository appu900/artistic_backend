import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from 'src/infrastructure/database/schemas';
import { CreateAdminDto } from './dto/create.admin.dto';
import * as bcrypt from 'bcrypt';
import { PasswordGenerator } from 'src/utils/generatePassword';
import { UserRole } from 'src/common/enums/roles.enum';
import { EmailService } from 'src/infrastructure/email/email.service';
import { EmailTemplate } from 'src/common/enums/mail-templates.enum';

@Injectable()
export class SuperAdminService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly emailService: EmailService,
  ) {}
  async createAdmin(payload: CreateAdminDto) {
    const admin = await this.userModel.findOne({
      $or: [{ phoneNumber: payload.phoneNumber }, { email: payload.email }],
    });
    if (admin)
      throw new ConflictException(
        'Admin with this phone number or email already exists',
      );
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
    });

    // eneuqu to the euque mail to send to the admin credentials...
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
    };
  }


  async fetchAllAdmins(){
    return await this.userModel.find({role:"ADMIN"})
  }
}
