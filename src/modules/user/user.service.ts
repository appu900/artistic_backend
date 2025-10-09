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

@Injectable()
export class UserService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

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
}
