import { IsOptional, IsString, IsEmail, IsPhoneNumber } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateAdminDto {
  @ApiPropertyOptional({ description: 'Admin first name' })
  @IsString()
  @IsOptional()
  firstName?: string;

  @ApiPropertyOptional({ description: 'Admin last name' })
  @IsString()
  @IsOptional()
  lastName?: string;

  @ApiPropertyOptional({ description: 'Admin email address' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ description: 'Admin phone number' })
  @IsString()
  @IsOptional()
  phoneNumber?: string;
}