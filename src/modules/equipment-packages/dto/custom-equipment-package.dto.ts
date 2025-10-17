import { IsString, IsArray, IsNumber, IsOptional, IsBoolean, ValidateNested, Min, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

export class CustomPackageItemDto {
  @IsString()
  equipmentId: string;

  @IsNumber()
  @Min(1)
  quantity: number;
}

export class CreateCustomEquipmentPackageDto {
  @IsString()
  name: string;

  @IsString()
  description: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CustomPackageItemDto)
  items: CustomPackageItemDto[];

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateCustomEquipmentPackageDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomPackageItemDto)
  items?: CustomPackageItemDto[];

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}