import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from 'src/infrastructure/database/schemas';
import { ArtistType, ArtistTypeDocument } from 'src/infrastructure/database/schemas/artist-type.schema';
import { CreateArtistTypeDto } from './dto/Artist-type.dto';

@Injectable()
export class AdminService {
    constructor(@InjectModel(ArtistType.name) private artistTypeModel:Model<ArtistTypeDocument>){}

    async createArtistType(payload:CreateArtistTypeDto){
       return await this.artistTypeModel.create({
        name:payload.name,
        description:payload.description
       })
    }
}
