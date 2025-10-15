import { ApiProperty } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  Max,
  IsArray,
} from 'class-validator'
import { ApplicationType } from 'src/infrastructure/database/schemas/artist-application.schema';
import { PerformancePreference } from 'src/common/enums/roles.enum';


export class CreateArtistApplicationDto {
  @ApiProperty({ example: 'Tanmay Khan' })
  @IsNotEmpty()
  @IsString()
  fullName: string;

  @ApiProperty({ example: 'tanmay.khan@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'male' })
  @IsString()
  gender: string;

  @ApiProperty({ example: 25 })
  @Type(() => Number)
  @IsNumber()
  @Min(10)
  @Max(100)
  age: number;

  @ApiProperty({
    enum: ApplicationType,
    example: ApplicationType.SOLO,
  })
  @IsEnum(ApplicationType)
  applicationType: ApplicationType;

  @ApiProperty({
    example: 'https://youtube.com/demo-video',
    required: false,
  })
  @IsOptional()
  @IsString()
  videoLink?: string;

  @ApiProperty({
    example: [PerformancePreference.PRIVATE, PerformancePreference.PUBLIC],
    enum: PerformancePreference,
    isArray: true,
    required: false,
  })
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.startsWith('[')
        ? JSON.parse(value)
        : value.split(',').map((v) => v.trim())
      : value,
  )
  @IsOptional()
  @IsArray()
  performPreference?: PerformancePreference[];
}
