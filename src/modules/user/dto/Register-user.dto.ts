import { IsEmail, IsNotEmpty, isString, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
export class RegisterUserDto {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({ example: 'pabitra', description: 'user first name' })
  firstName: string;

  @IsNotEmpty()
  @IsString()
  @ApiProperty({ example: 'pabitra', description: 'lastname' })
  lastName: string;

  @IsNotEmpty()
  @IsString()
  @ApiProperty({ example: '773507723', description: 'phoneNumber' })
  phoneNumber: string;

  @IsNotEmpty()
  @IsString()
  @ApiProperty({ example: 'thisismypassword', description: 'password' })
  password: string;

  @ApiProperty({ example: 'user@gmail.com', description: 'email' })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'USER | ADMIN |VENUE_OWNER ', description: 'role' })
  @IsString()
  @IsNotEmpty()
  role: string;
}
