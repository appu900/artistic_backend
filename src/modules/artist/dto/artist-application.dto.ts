import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  Max,
} from 'class-validator'
import { ApplicationType } from 'src/infrastructure/database/schemas/artist-application.schema';


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
}
