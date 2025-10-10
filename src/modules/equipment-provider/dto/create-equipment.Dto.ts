import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';
import { EquipmentCategory } from 'src/infrastructure/database/schemas/equipment.schema';
import { Type, Transform } from 'class-transformer';
export class CreateEquipmentDto {
  @ApiProperty({ example: 'JBL Professional Speaker' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ enum: EquipmentCategory, example: EquipmentCategory.SOUND })
  @IsEnum(EquipmentCategory)
  category: EquipmentCategory;

  @ApiProperty({ example: 'High-quality JBL sound system for events' })
  @IsNotEmpty()
  @IsString()
  description: string;

  @ApiProperty({ example: 200 })
  @IsPositive()
  @Transform(({ value }) => Number(value)) // ✅ Converts "2000" → 2000
  @Type(() => Number)
  pricePerHour: number;

  @ApiProperty({ example: 1500 })
  @IsPositive()
  @Transform(({ value }) => Number(value)) // ✅ Converts "2000" → 2000
  @Type(() => Number)
  pricePerDay: number;

  @IsNotEmpty()
  @Transform(({ value }) => Number(value)) // ✅ Converts "2000" → 2000
  @Type(() => Number)
  quantity: number;
}
