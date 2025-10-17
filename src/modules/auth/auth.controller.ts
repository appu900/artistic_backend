import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginUserDto } from './dto/Loigin-user.dto';
import { SignupUserDto } from './dto/signup-user.dto';
import { VerifyOtpDto, ResendOtpDto } from './dto/otp.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() body: LoginUserDto) {
    return this.authService.login(body);
  }

  @Post('signup')
  async signup(@Body() body: SignupUserDto) {
    return this.authService.signupUser(body);
  }

  @Post('verify-otp')
  async verifyOtp(@Body() body: VerifyOtpDto) {
    return this.authService.verifyOtp(body);
  }

  @Post('resend-otp')
  async resendOtp(@Body() body: ResendOtpDto) {
    return this.authService.resendOtp(body);
  }
}
  