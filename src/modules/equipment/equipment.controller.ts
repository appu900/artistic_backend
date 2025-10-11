import {
    Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { EquipmentService } from './equipment.service';
import { Types } from 'mongoose';
import { JwtAuthGuard } from 'src/common/guards/jwtAuth.guard';
import { RolesGuard } from 'src/common/guards/roles.guards';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from 'src/common/enums/roles.enum';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
  ApiConsumes,
} from '@nestjs/swagger';
import { UpdateEquipmentDto } from './dto/update-dto';
import { FileInterceptor } from '@nestjs/platform-express';

@ApiTags('Equipment')
@Controller('equipment')
export class EquipmentController {
  constructor(private readonly equipmentService: EquipmentService) {}

  @Get('list')
  @ApiOperation({ summary: 'Get all available equipment' })
  @ApiResponse({
    status: 200,
    description: 'List of all equipment fetched successfully.',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error.',
  })
  async listAllEquipment() {
    return this.equipmentService.listAllEquipments();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.EQUIPMENT_PROVIDER)
  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete an equipment by ID (Equipment Provider only)',
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'MongoDB ObjectId of the equipment',
    example: '652b8a60e4d9af00c12e1234',
  })
  @ApiResponse({ status: 200, description: 'Equipment deleted successfully.' })
  @ApiResponse({
    status: 404,
    description: 'Equipment not found or invalid ID.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized access.' })
  async deleteEquipment(@Param('id') id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Invalid equipment Id');
    }
    return this.equipmentService.deleteEquipmentById(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific equipment by ID' })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'MongoDB ObjectId of the equipment',
    example: '652b8a60e4d9af00c12e1234',
  })
  @ApiResponse({
    status: 200,
    description: 'Equipment details fetched successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Invalid or non-existing equipment ID.',
  })
  async getEquipment(@Param('id') id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Invalid equipment Id');
    }
    return this.equipmentService.getEquipmentById(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.EQUIPMENT_PROVIDER)
  @Patch(':id')
  @UseInterceptors(FileInterceptor('image'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update equipment by ID (with optional image upload)' })
  @ApiParam({
    name: 'id',
    description: 'MongoDB ObjectId of the equipment',
    example: '652b8a60e4d9af00c12e1234',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Fields to update (any combination). Image is optional.',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', example: 'Yamaha Mixer Console' },
        category: { type: 'string', enum: ['SOUND', 'DISPLAY', 'LIGHT', 'OTHER'] },
        description: { type: 'string', example: 'Updated 16-channel professional mixer' },
        pricePerHour: { type: 'number', example: 600 },
        pricePerDay: { type: 'number', example: 5000 },
        quantity: { type: 'number', example: 8 },
        image: { type: 'string', format: 'binary', description: 'Optional new image file' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Equipment updated successfully.' })
  @ApiResponse({ status: 404, description: 'Equipment not found.' })
  @ApiResponse({ status: 401, description: 'Unauthorized access.' })
  async updateEquipment(
    @Param('id') id: string,
    @Body() updateEquipmentDto: UpdateEquipmentDto,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    return this.equipmentService.updateEquipmentById(id, updateEquipmentDto, image);
  }
}
