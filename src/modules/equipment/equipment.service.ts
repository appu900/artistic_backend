import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Equipment,
  EquipmentDocument,
} from 'src/infrastructure/database/schemas/equipment.schema';
import {
  EquipmentProviderProfile,
  EquipmentProviderProfileDocument,
} from 'src/infrastructure/database/schemas/equipment-provider-profile.schema';
import { UpdateEquipmentDto } from './dto/update-dto';
import { CreateEquipmentDto } from './dto/create-equipment.dto';
import { S3Service } from 'src/infrastructure/s3/s3.service';
import { UpdateArtistProfileDto } from '../artist/dto/profile-update-request.dto';

@Injectable()
export class EquipmentService {
  constructor(
    @InjectModel(Equipment.name)
    private equipmentModel: Model<EquipmentDocument>,
    @InjectModel(EquipmentProviderProfile.name)
    private equipmentProviderProfileModel: Model<EquipmentProviderProfileDocument>,
    private readonly s3Service: S3Service,
  ) {}

  async listAllEquipments() {
    return await this.equipmentModel.find();
  }

  async createEquipment(
    createData: CreateEquipmentDto,
    userId: string,
    image?: Express.Multer.File,
  ) {
    console.log('=== EQUIPMENT CREATION DEBUG ===');
    console.log('Creating equipment for userId:', userId, 'Type:', typeof userId);
    
    // First, find the EquipmentProviderProfile for this user
    console.log('Searching for profile with user ObjectId:', new Types.ObjectId(userId));
    
    const providerProfile = await this.equipmentProviderProfileModel.findOne({ 
      user: new Types.ObjectId(userId) 
    });

    console.log('Found provider profile:', providerProfile);

    if (!providerProfile) {
      // Let's check if there are any provider profiles at all
      const allProfiles = await this.equipmentProviderProfileModel.find();
      console.log('Total provider profiles in database:', allProfiles.length);
      
      if (allProfiles.length > 0) {
        console.log('Sample profile user IDs:');
        allProfiles.slice(0, 3).forEach(profile => {
          console.log('- Profile user field:', profile.user, 'Type:', typeof profile.user);
        });
      }
      
      // Let's also check if the user exists and what their role is
      try {
        const user = await this.equipmentProviderProfileModel.db.collection('users').findOne({ 
          _id: new Types.ObjectId(userId) 
        });
        console.log('User found:', user ? `Yes - Role: ${user.role}` : 'No');
      } catch (err) {
        console.log('Error finding user:', err);
      }
      
      throw new BadRequestException('Equipment provider profile not found. Please contact admin.');
    }

    console.log('=== PROCEEDING WITH EQUIPMENT CREATION ===');

    // Convert and validate numeric fields
    const pricePerHour = parseFloat(createData.pricePerHour);
    const pricePerDay = parseFloat(createData.pricePerDay);
    const quantity = parseInt(createData.quantity, 10);

    // Validation
    if (isNaN(pricePerHour) || pricePerHour <= 0) {
      throw new BadRequestException('Price per hour must be a valid number greater than 0');
    }

    if (isNaN(pricePerDay) || pricePerDay <= 0) {
      throw new BadRequestException('Price per day must be a valid number greater than 0');
    }

    if (isNaN(quantity) || quantity <= 0) {
      throw new BadRequestException('Quantity must be a valid number greater than 0');
    }

    let imageUrl = '';
    
    if (image) {
      imageUrl = await this.s3Service.uploadFile(image, 'equipment');
    }

    const equipment = new this.equipmentModel({
      name: createData.name,
      category: createData.category,
      description: createData.description,
      pricePerHour,
      pricePerDay,
      quantity,
      provider: providerProfile._id, // Use the EquipmentProviderProfile ID
      imageUrl: imageUrl || createData.imageUrl || '',
    });

    return await equipment.save();
  }

  async getMyEquipment(userId: string) {
    // First, find the EquipmentProviderProfile for this user
    const providerProfile = await this.equipmentProviderProfileModel.findOne({ 
      user: new Types.ObjectId(userId) 
    });

    if (!providerProfile) {
      return []; // Return empty array if no provider profile found
    }

    return await this.equipmentModel.find({ provider: providerProfile._id });
  }

  async getEquipmentById(id: string) {
    return await this.equipmentModel.findById(id);
  }

  async deleteEquipmentById(id: string) {
    const eq = await this.getEquipmentById(id);
    if (!eq) throw new NotFoundException('Equipment not found');
    return await this.equipmentModel.deleteOne({ _id: id });
  }

  async updateEquipmentById(
    id: string,
    updateData: UpdateEquipmentDto,
    image?: Express.Multer.File,
  ) {
    console.log(id)
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Invalid Equipment ID');
    }

    if (image) {
      updateData.imageUrl = await this.s3Service.uploadFile(image, 'equipment');
    }

    const eqp = await this.equipmentModel.findById({ _id: id });
    if (!eqp) {
      throw new NotFoundException('Equipment not found');
    }

    if (updateData.category) {
      eqp.category = updateData.category;
    }
    if (updateData.name) {
      eqp.name = updateData.name;
    }

    if (updateData.description) {
      eqp.description = updateData.description;
    }

    if (updateData.pricePerDay) {
      eqp.pricePerDay = updateData.pricePerDay;
    }
    if (updateData.pricePerHour) {
      eqp.pricePerHour = updateData.pricePerHour;
    }
    if (updateData.quantity) {
      eqp.quantity = updateData.quantity;
    }
    if (image) {
      eqp.imageUrl = await this.s3Service.uploadFile(image, 'equipment');
    }

    const res = await eqp.save();
    return res;
  }
}
