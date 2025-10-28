import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
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
    const providerProfile = await this.equipmentProviderProfileModel.findOne({
      user: new Types.ObjectId(userId),
    });

    if (!providerProfile) {
      const allProfiles = await this.equipmentProviderProfileModel.find();

      if (allProfiles.length > 0) {
        allProfiles.slice(0, 3).forEach((profile) => {});
      }

      try {
        const user = await this.equipmentProviderProfileModel.db
          .collection('users')
          .findOne({
            _id: new Types.ObjectId(userId),
          });
      } catch (err) {
        console.log('Error finding user:', err);
      }

      throw new BadRequestException(
        'Equipment provider profile not found. Please contact admin.',
      );
    }

    const pricePerHour = parseFloat(createData.pricePerHour);
    const pricePerDay = parseFloat(createData.pricePerDay);
    const quantity = parseInt(createData.quantity, 10);

    if (isNaN(pricePerHour) || pricePerHour <= 0) {
      throw new BadRequestException(
        'Price per hour must be a valid number greater than 0',
      );
    }

    if (isNaN(pricePerDay) || pricePerDay <= 0) {
      throw new BadRequestException(
        'Price per day must be a valid number greater than 0',
      );
    }

    if (isNaN(quantity) || quantity <= 0) {
      throw new BadRequestException(
        'Quantity must be a valid number greater than 0',
      );
    }

    let imageUrl = '';

    if (image) {
      imageUrl = await this.s3Service.uploadFile(image, 'equipment');
    }

    // Store the provider as the provider PROFILE id (legacy behavior)
    const equipment = new this.equipmentModel({
      name: createData.name,
      category: createData.category,
      description: createData.description,
      pricePerHour,
      pricePerDay,
      quantity,
      provider: providerProfile._id,
      imageUrl: imageUrl || createData.imageUrl || '',
    });

    return await equipment.save();
  }

  async getMyEquipment(userId: string) {
    const providerProfile = await this.equipmentProviderProfileModel.findOne({
      user: new Types.ObjectId(userId),
    });

    if (!providerProfile) {
      return [];
    }

    // Backward-compatible lookup: support legacy records that saved provider as profile._id
    return await this.equipmentModel.find({
      provider: { $in: [new Types.ObjectId(userId), providerProfile._id] },
    });
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

  //   check equipment avalibity

  // async listAllEquipmentAvailability(date: Date) {
  //   const equipments = await this.equipmentModel.find();

  //   // ✅ Must be an array of EquipmentAvailability
  //   const results: EquipmentAvailability[] = [];

  //   for (const equipment of equipments) {
  //     const totalStock = equipment.quantity;

  //     // Step 1: get booked qty for the date
  //     const bookingAgg = await this.bookingModel.aggregate([
  //       {
  //         $match: {
  //           equipment: equipment.id,
  //           date,
  //           status: 'confirmed',
  //         },
  //       },
  //       {
  //         $group: {
  //           _id: '$equipment',
  //           totalBooked: { $sum: '$quantity' },
  //         },
  //       },
  //     ]);

  //     const bookedQty = bookingAgg.length > 0 ? bookingAgg[0].totalBooked : 0;

  //     // Step 2: get unavailable qty
  //     const unavailable = await this.unavailableModel.findOne({
  //       equipment: equipment._id,
  //       date,
  //     });

  //     const unavailableQty = unavailable ? unavailable.unavailableQuantity : 0;

  //     // Step 3: calculate available
  //     const availableQty = Math.max(
  //       totalStock - (bookedQty + unavailableQty),
  //       0,
  //     );

  //     // ✅ Push result into array
  //     results.push({
  //       equipmentId: equipment.id,
  //       name: equipment.name,
  //       category: equipment.category,
  //       totalStock,
  //       bookedQty,
  //       unavailableQty,
  //       availableQty,
  //     });
  //   }

  //   return results;
  // }
}
