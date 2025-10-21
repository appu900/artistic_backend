import { PartialType } from '@nestjs/mapped-types';
import { CreateVenueLayoutDto } from './create-venue-layout.dto';

export class UpdateVenueLayoutDto extends PartialType(CreateVenueLayoutDto) {}
