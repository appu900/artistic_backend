import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class EquipmentProviderLoginDto {
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @MinLength(6)
  password: string;
}
