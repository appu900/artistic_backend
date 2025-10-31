import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { EventsService } from './events.service';
import { OpenBookingDto } from './dto/open-booking.dto';
import { DatabasePrimaryValidation } from 'src/utils/validateMongoId';

@Controller('events')
export class EventsController {
  constructor(private readonly eventService: EventsService) {}

  @Post('/booking/open')
  async openBooking(@Body() dto: OpenBookingDto) {
    if (
      !DatabasePrimaryValidation.validateIds(dto.eventId) ||
      !DatabasePrimaryValidation.validateIds(dto.layoutId)
    ) {
      throw new BadRequestException('ids are not valid');
    }
    return this.eventService.openTicketBookingForEvent(
      dto.layoutId,
      dto.eventId,
    );
  }

  @Get('eventLayout/:id')
  async FetchLayoutDetails(@Param('id') seatLayoutId: string) {
    console.log('the event is hitting...');
    return this.eventService.eventLayoutDetails(seatLayoutId);
  }
}
