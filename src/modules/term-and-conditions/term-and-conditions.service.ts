import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Terms,
  TermsDocument,
} from 'src/infrastructure/database/schemas/terms-and-conditions.schema';
import { CreateTermsDto, UpdateTermsDto } from './dto/Create-Terms.dto';

@Injectable()
export class TermAndConditionsService {
  constructor(
    @InjectModel(Terms.name) private termsModel: Model<TermsDocument>,
  ) {}

  async create(createDto: CreateTermsDto): Promise<Terms> {
    const lastTerm = await this.termsModel
      .findOne({ category: createDto.category })
      .sort({ version: -1 });

    const version = lastTerm ? lastTerm.version + 1 : 1;

    // ✅ Correct save and return
    const newTerm = new this.termsModel({
      ...createDto,
      version,
    });

    const saved = await newTerm.save();
    return saved;
  }
  async findAll(): Promise<Terms[]> {
    return this.termsModel.find().sort({ createdAt: -1 });
  }

  async findById(id: string): Promise<Terms> {
    const term = await this.termsModel.findById(id);
    if (!term) throw new NotFoundException('Terms not found');
    return term;
  }

  async update(id: string, updateDto: UpdateTermsDto): Promise<Terms> {
    const existing = await this.termsModel.findById(id);
    if (!existing) throw new NotFoundException('Terms not found');

    // Auto-increment version when updating
    const updated = await this.termsModel.findByIdAndUpdate(
      id,
      { ...updateDto, version: existing.version + 1 },
      { new: true },
    );

    if (!updated) throw new NotFoundException('Terms not found');
    return updated;
  }

  async delete(id: string) {
    const term = await this.termsModel.findById(id);
    if (!term) {
      throw new NotFoundException('Terms not found');
    }
    return await this.termsModel.deleteOne({ id });
  }
}
