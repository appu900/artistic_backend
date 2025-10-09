import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { RegisterUserDto } from './dto/Register-user.dto';
import { UserRole } from 'src/common/enums/roles.enum';
import { JwtAuthGuard } from 'src/common/guards/jwtAuth.guard';
import { RolesGuard } from 'src/common/guards/roles.guards';
import { Roles } from 'src/common/decorators/roles.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

@ApiTags('Users')
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('signup')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User successfully registered' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async signup(@Body() body: RegisterUserDto) {
    const role = (body.role as UserRole) || UserRole.NORMAL;
    return this.userService.createUser(body, role);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('listall')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all registered users (Admin only)' })
  @ApiResponse({ status: 200, description: 'Returns all users' })
  @ApiResponse({ status: 403, description: 'Forbidden. Admins only.' })
  async listAllUsers() {
    return this.userService.listAll();
  }
}
