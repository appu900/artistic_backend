import { IsEmail, IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

export class SignupUserDto {
  @IsNotEmpty()
  @IsString()
  firstName: string;

  @IsNotEmpty()
  @IsString()
  lastName: string;

  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^\+[1-9]\d{6,14}$/, {
    message: 'Phone number must be a valid international number with country code (e.g., +96599213471, +1234567890)'
  })
  phoneNumber: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message: 'Password must contain at least one lowercase letter, uppercase letter, number, and special character'
  })
  password: string;
}
