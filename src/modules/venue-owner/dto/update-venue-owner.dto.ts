import { IsOptional, IsString } from 'class-validator';

export class UpdateVenueOwnerProfileDto {
  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  category?: string;
}
