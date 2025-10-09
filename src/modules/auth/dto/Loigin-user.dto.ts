import { IsEmail, IsNotEmpty, isString, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginUserDto {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({ example: 'password', description: 'user password' })
  password: string;

  @IsNotEmpty()
  @IsEmail()
  @ApiProperty({ example: 'user@gmail.com', description: 'email' })
  email: string;
}
