import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  EquipmentProvider,
  EquipmentProviderDocument,
} from 'src/infrastructure/database/schemas/equipment-Provider.schema';
import { RegisterEquipmentProviderDto } from './dto/Register-provider.dto';
import * as bcrypt from 'bcrypt';
import { EquipmentProviderLoginDto } from './dto/Login-Provider.Dto';
import { AuthService } from '../auth/auth.service';
import { UserRole } from 'src/common/enums/roles.enum';
import {
  Equipment,
  EquipmentDocument,
} from 'src/infrastructure/database/schemas/equipment.schema';
import { Mode } from 'fs';
import { CreateEquipmentDto } from './dto/create-equipment.Dto';
import { S3Service } from 'src/infrastructure/s3/s3.service';

@Injectable()
export class EquipmentProviderService {
  constructor(
    private readonly authService: AuthService,
    @InjectModel(EquipmentProvider.name)
    private equimentProviderModel: Model<EquipmentProviderDocument>,
    @InjectModel(Equipment.name)
    private equipmentModel: Model<EquipmentDocument>,
    private readonly s3Service: S3Service,
  ) {}

  async create(RegisterPayload: RegisterEquipmentProviderDto) {
    const existing = await this.equimentProviderModel.findOne({
      $or: [
        { email: RegisterPayload.email },
        { phoneNumber: RegisterPayload.phoneNumber },
      ],
    });
    if (existing)
      throw new ConflictException('email and phoneNumber already taken');
    const plainPassword = Math.random().toString(36).slice(-8);
    console.log(
      'This is the plainPassword of the equimentProvider',
      plainPassword,
    );
    const hashedPassword = await bcrypt.hash(plainPassword, 10);
    const eqp = await this.equimentProviderModel.create({
      fullName: RegisterPayload.fullName,
      email: RegisterPayload.email,
      passwordHash: hashedPassword,
      phoneNumber: RegisterPayload.phoneNumber,
    });
    return {
      message: 'EquimentProvider added successfully',
    };
  }

  async login(payload: EquipmentProviderLoginDto) {
    const eqp = await this.equimentProviderModel.findOne({
      email: payload.email,
    });
    if (!eqp) throw new NotFoundException('Not found invalid email');
    const isPasswordCorrect = await bcrypt.compare(
      payload.password,
      eqp.passwordHash,
    );
    if (!isPasswordCorrect)
      throw new BadRequestException('Invalid credentials');
    const accesToken = await this.authService.generateTokens(
      String(eqp._id),
      eqp.email,
      UserRole.EQUIPMENT_PROVIDER,
    );
    return {
      message: 'Login Sucessfull',
      access_token: accesToken,
      name: eqp.fullName,
      email: eqp.fullName,
      role: eqp.role,
    };
  }

  async chnagePassword(providerId:string,newPassword:string){
    const provider = await this.equimentProviderModel.findById(providerId)
    if(!provider) throw new NotFoundException("User doesnot exists")
    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(newPassword,salt)
    provider.passwordHash= hashedPassword
    await provider.save()
    return {
        message:"Password updation completed"
    }

  }

  async listAll() {
    return this.equimentProviderModel.find({}, { passwordHash: 0, role: 0 });
  }

  async createEquipment(
    providerId: string,
    dto: CreateEquipmentDto,
    file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Image is required');
    const imageUrl = await this.s3Service.uploadFile(file, 'equipment');
    return await this.equipmentModel.create({
      name: dto.name,
      imageUrl: imageUrl,
      pricePerDay: dto.pricePerDay,
      pricePerHour: dto.pricePerHour,
      description: dto.description,
      quantity: Number(dto.quantity),
      provider: providerId,
    });
  }

  async listAllEquipments(){
     return await this.equipmentModel.find()
  }

  async listEquipmentBYProvider(providerId:string){
    return await this.equipmentModel.find({provider:providerId})
  }

  async getEquipment(id:string){
    return await this.equipmentModel.findById(id)
  }

  async deleteEquipment(id:string){
    await this.equipmentModel.deleteOne({id})
    return "Equipment deleted sucessfully"
  }
}
