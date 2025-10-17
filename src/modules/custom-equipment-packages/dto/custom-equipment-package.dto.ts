import { 
  IsString, 
  IsNotEmpty, 
  IsArray, 
  ValidateNested, 
  IsNumber, 
  Min, 
  IsOptional, 
  IsBoolean,
  IsMongoId 
} from 'class-validator';
import { Type } from 'class-transformer';

export class CustomEquipmentItemDto {
  @IsMongoId()
  @IsNotEmpty()
  equipmentId: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  pricePerDay?: number; // Will be set automatically from equipment
}

export class CreateCustomEquipmentPackageDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomEquipmentItemDto)
  items: CustomEquipmentItemDto[];

  @IsBoolean()
  @IsOptional()
  isPublic?: boolean = false;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateCustomEquipmentPackageDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomEquipmentItemDto)
  @IsOptional()
  items?: CustomEquipmentItemDto[];

  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsNumber()
  @IsOptional()
  totalPricePerDay?: number;
}