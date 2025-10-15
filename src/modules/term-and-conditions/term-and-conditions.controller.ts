import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { TermAndConditionsService } from './term-and-conditions.service';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateTermsDto, UpdateTermsDto } from './dto/Create-Terms.dto';
import { JwtAuthGuard } from 'src/common/guards/jwtAuth.guard';
import { RolesGuard } from 'src/common/guards/roles.guards';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from 'src/common/enums/roles.enum';

@ApiTags('Terms')
@Controller('term-and-conditions')
export class TermAndConditionsController {
  constructor(private readonly termsService: TermAndConditionsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new Terms document' })
  @ApiResponse({ status: 201, description: 'Terms created successfully' })
  async create(@Body() dto: CreateTermsDto) {
    console.log(dto)
    return this.termsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all Terms' })
  @ApiResponse({ status: 200, description: 'Fetched all terms successfully' })
  async findAll() {
    return this.termsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get Terms by ID' })
  @ApiResponse({
    status: 200,
    description: 'Fetched specific term successfully',
  })
  async findById(@Param('id') id: string) {
    return this.termsService.findById(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update Terms by ID (auto-increments version)' })
  @ApiResponse({ status: 200, description: 'Terms updated successfully' })
  async update(@Param('id') id: string, @Body() dto: UpdateTermsDto) {
    return this.termsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete Terms by ID' })
  @ApiResponse({ status: 204, description: 'Terms deleted successfully' })
  async remove(@Param('id') id: string) {
    return this.termsService.delete(id);
  }
}
