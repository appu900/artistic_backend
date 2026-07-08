import { Allow, IsBoolean, IsDefined, IsNotEmpty, IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateAttendancePortalDto {
  @IsOptional()
  @IsString()
  label?: string;

  /** 4–8 digit PIN shared with door staff. If omitted, a random PIN is generated. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4,8}$/, { message: 'PIN must be 4–8 digits' })
  pin?: string;

  @IsOptional()
  @IsBoolean()
  regenerate?: boolean;
}

export class UpdateAttendancePortalDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4,8}$/, { message: 'PIN must be 4–8 digits' })
  pin?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  label?: string;
}

export class VerifyAttendancePinDto {
  @IsString()
  @IsNotEmpty()
  @Length(4, 8)
  @Matches(/^\d{4,8}$/, { message: 'PIN must be 4–8 digits' })
  pin: string;

  @IsOptional()
  @IsString()
  operatorName?: string;
}

export class ScanAttendanceQrDto {
  /** Raw QR text (JSON string) or parsed payload object */
  @IsDefined()
  @Allow()
  qrPayload: string | Record<string, any>;
}
