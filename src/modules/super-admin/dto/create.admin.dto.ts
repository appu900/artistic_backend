import { IsEmail, IsNotEmpty, IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAdminDto {
  @ApiProperty({ description: 'Admin first name', example: 'John' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  firstName: string;

  @ApiProperty({ description: 'Admin last name', example: 'Doe' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  lastName: string;

  @ApiProperty({ description: 'Admin email address', example: 'admin@example.com' })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Admin phone number', example: '+1234567890' })
  @IsNotEmpty()
  @IsString()
  @MinLength(10)
  @MaxLength(15)
  phoneNumber: string;
}
