import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Equipment,
  EquipmentDocument,
} from 'src/infrastructure/database/schemas/equipment.schema';
import { UpdateEquipmentDto } from './dto/update-dto';
import { S3Service } from 'src/infrastructure/s3/s3.service';
import { UpdateArtistProfileDto } from '../artist/dto/profile-update-request.dto';

@Injectable()
export class EquipmentService {
  constructor(
    @InjectModel(Equipment.name)
    private equipmentModel: Model<EquipmentDocument>,
    private readonly s3Service: S3Service,
  ) {}

  async listAllEquipments() {
    return await this.equipmentModel.find();
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
