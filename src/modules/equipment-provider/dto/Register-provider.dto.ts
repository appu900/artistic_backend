import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RegisterEquipmentProviderDto {
  @IsNotEmpty()
  @IsString()
  fullName: string;

  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsString()
  phoneNumber: string;
}