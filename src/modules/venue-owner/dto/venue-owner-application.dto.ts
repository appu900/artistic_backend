import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateVenueOwnerApplicationDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @IsString()
  @IsNotEmpty()
  venue: string;

  @IsString()
  @IsOptional()
  ownerDescription?: string;

  @IsString()
  @IsNotEmpty()
  companyName: string;
}

export class ReviewVenueOwnerApplicationDto {
  @IsString()
  @IsNotEmpty()
  status: 'APPROVED' | 'REJECTED';
}
