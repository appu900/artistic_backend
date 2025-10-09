import { ApiProperty } from '@nestjs/swagger';
import {
  IsMongoId,
  IsString,
  IsNumber,
  IsArray,
  IsOptional,
  Min,
  IsNotEmpty,
  ValidateIf,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { PerformancePreference } from 'src/common/enums/roles.enum';

export class CreateArtistDto {
  @ApiProperty({ example: 'Omrani' })
  @IsNotEmpty()
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Khan' })
  @IsNotEmpty()
  @IsString()
  lastName: string;

  @ApiProperty({ example: '7735041901' })
  @IsNotEmpty()
  @IsString()
  phoneNumber: string;

  @ApiProperty({ example: 'john@music.com' })
  @IsNotEmpty()
  @IsString()
  email: string;

  @ApiProperty({ example: 'DJ John' })
  @IsNotEmpty()
  @IsString()
  stageName: string;

  @ApiProperty({
    example: 'Professional DJ with 8 years of experience performing globally',
  })
  @IsOptional()
  @IsString()
  about?: string;

  // ✅ Automatically converts "4" (string) → 4 (number)
  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  yearsOfExperience: number;

  // ✅ Transforms '["guitar","drum"]' → ["guitar","drum"]
  @ApiProperty({ example: ['DJ', 'Mixing', 'Remix'], type: [String] })
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.startsWith('[')
        ? JSON.parse(value)
        : value.split(',').map((v) => v.trim())
      : value,
  )
  @IsArray()
  skills: string[];

  @ApiProperty({ example: ['English', 'Hindi'], type: [String] })
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.startsWith('[')
        ? JSON.parse(value)
        : value.split(',').map((v) => v.trim())
      : value,
  )
  @IsArray()
  musicLanguages: string[];

  @ApiProperty({ example: ['Best DJ 2023'], type: [String] })
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.startsWith('[')
        ? JSON.parse(value)
        : value.split(',').map((v) => v.trim())
      : value,
  )
  @IsArray()
  awards: string[];

  @ApiProperty({ example: 150 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  pricePerHour: number;

  @ApiProperty({
    example: '653fa1209a0b22ab547fe12c',
    description: 'Artist Type ObjectId reference',
  })
  @IsString()
  artistType: string;

  @ApiProperty({ example: 'music' })
  @IsString()
  category: string;

  @ApiProperty({ example: 'India' })
  @IsString()
  country: string;

  @ApiProperty({
    example: [PerformancePreference.PRIVATE, PerformancePreference.PUBLIC],
    enum: PerformancePreference,
    isArray: true,
  })
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.startsWith('[')
        ? JSON.parse(value)
        : value.split(',').map((v) => v.trim())
      : value,
  )
  @IsArray()
  performPreference: PerformancePreference[];
}
