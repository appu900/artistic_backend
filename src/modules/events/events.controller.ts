import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { EventsService } from './events.service';
import { OpenBookingDto } from './dto/open-booking.dto';
import { DatabasePrimaryValidation } from 'src/utils/validateMongoId';

@Controller('events')
export class EventsController {
  constructor(private readonly eventService: EventsService) {}

  @Post('/booking/open')
  async openBooking(@Body() dto: OpenBookingDto) {
    if(!DatabasePrimaryValidation.validateIds(dto.eventId) || !DatabasePrimaryValidation.validateIds(dto.layoutId)){
        throw new BadRequestException("ids are not valid")
    }
    return this.eventService.openTicketBookingForEvent(dto.layoutId,dto.eventId)
  }
}

