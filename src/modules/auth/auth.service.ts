import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UserService } from '../user/user.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt'
import { UserRole } from 'src/common/enums/roles.enum';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(email:string,password:string){
    const user = await this.userService.findByEmail(email)
    if(!user) throw new UnauthorizedException("Invalid credentials")
    const isPasswordCorrect = await bcrypt.compare(password,user.passwordHash)
    if(!isPasswordCorrect) throw new UnauthorizedException('Invalid credentials')  
    const access_token = await this.generateTokens(user.id,user.email,user.role)
    return {
        message:"Login sucessfull",
        role:user.role,
        access_token:access_token,
    }
  }

  private async generateTokens(userId:string,email:string, role:UserRole){
    const payload = {sub:userId,email,role}
    const accessToken = await this.jwtService.signAsync(payload)
    return accessToken
  }
}
