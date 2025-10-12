import { Body, Controller, Get, Param, Patch, Post, UseGuards, UseInterceptors, UploadedFile, Put, Delete } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserService } from './user.service';
import { RegisterUserDto } from './dto/Register-user.dto';
import { UserRole } from 'src/common/enums/roles.enum';
import { JwtAuthGuard } from 'src/common/guards/jwtAuth.guard';
import { RolesGuard } from 'src/common/guards/roles.guards';
import { Roles } from 'src/common/decorators/roles.decorator';
import { GetUser } from 'src/common/decorators/getUser.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
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

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Patch(':id/toggle-status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle user active status (Admin only)' })
  @ApiResponse({ status: 200, description: 'User status updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden. Admins only.' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async toggleUserStatus(@Param('id') id: string) {
    return this.userService.toggleUserStatus(id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile/me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'Returns current user profile' })
  async getCurrentUserProfile(@GetUser() user: any) {
    return this.userService.getUserById(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Put('profile/picture')
  @UseInterceptors(FileInterceptor('profilePicture'))
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Update user profile picture' })
  @ApiBody({
    description: 'Profile picture file',
    type: 'multipart/form-data',
    schema: {
      type: 'object',
      properties: {
        profilePicture: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Profile picture updated successfully' })
  async updateProfilePicture(
    @GetUser() user: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.userService.updateProfilePicture(user.userId, file);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('profile/picture')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove user profile picture' })
  @ApiResponse({ status: 200, description: 'Profile picture removed successfully' })
  async removeProfilePicture(@GetUser() user: any) {
    return this.userService.removeProfilePicture(user.userId);
  }
}
