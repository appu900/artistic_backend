import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ArtistType, ArtistTypeDocument } from 'src/infrastructure/database/schemas/artist-type.schema';

@Injectable()
export class ArtistService {
    constructor(@InjectModel(ArtistType.name) private astistTypeModel:Model<ArtistTypeDocument>){}

    async listAllArtistType(){
        return this.astistTypeModel.find();
    }
}
