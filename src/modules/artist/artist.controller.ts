import { Controller, Get } from '@nestjs/common';
import { ArtistService } from './artist.service';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

@ApiTags('artist')
@Controller('artist')
export class ArtistController {
  constructor(private readonly artistService: ArtistService) {}

  @Get('list-types')
  @ApiOperation({ summary: 'fetch all Artist Type' })
  listAllArtistType() {
    return this.artistService.listAllArtistType();
  }
}
