import { IsEmail, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CustomerDetailsDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  phone: string;
}

export class OptionalCustomerDetailsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => CustomerDetailsDto)
  customerDetails?: CustomerDetailsDto;
}
