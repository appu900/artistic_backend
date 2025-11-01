import { Body, Controller, Post, UseGuards } from '@nestjs/common';
;

import { SeatBookDto } from './dto/seatBook.dto';
import { GetUser } from 'src/common/decorators/getUser.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwtAuth.guard';
import { seatBookingService } from './seat-book.service';

@Controller('seat-book')
export class SeatBookController {
  constructor(private readonly seatBookingService:seatBookingService) {}

  @Post('/ticket')
  @UseGuards(JwtAuthGuard)
  async bookATicket(@Body() dto: SeatBookDto, @GetUser() user: any) {
    const userId = user.userId;
    const userEmail = user.email
    return this.seatBookingService.bookSeat(dto, userId,userEmail);
  }
}
