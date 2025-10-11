import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ArtistType,
  ArtistTypeSchema,
} from 'src/infrastructure/database/schemas/artist-type.schema';
import { EquipmentProviderModule } from '../equipment-provider/equipment-provider.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ArtistType.name, schema: ArtistTypeSchema },
    ]),
    EquipmentProviderModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
