import { ApiProperty, PartialType } from '@nestjs/swagger';;
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';
import { EquipmentCategory } from 'src/infrastructure/database/schemas/equipment.schema';

export class UpdateEquipmentDto {
  @ApiProperty({
    description: 'Name of the equipment',
    example: 'Yamaha Mixer Console',
    required: false,
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({
    description: 'Equipment category',
    enum: EquipmentCategory,
    example: EquipmentCategory.SOUND,
    required: false,
  })
  @IsOptional()
  @IsEnum(EquipmentCategory)
  category?: EquipmentCategory;

  @ApiProperty({
    description: 'Image URL of the equipment',
    example: 'https://example.com/images/mixer.png',
    required: false,
  })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiProperty({
    description: 'Description of the equipment',
    example: 'Professional 12-channel audio mixer with Bluetooth connectivity',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Rental price per hour in INR',
    example: 500,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  pricePerHour?: number;

  @ApiProperty({
    description: 'Rental price per day in INR',
    example: 4000,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  pricePerDay?: number;

  @ApiProperty({
    description: 'Quantity of equipment available',
    example: 5,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity?: number;
}
