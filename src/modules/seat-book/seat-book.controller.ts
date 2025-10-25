import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { SeatBookingDocument } from 'src/infrastructure/database/schemas/seatlayout-seat-bookings/SeatBooking.schema';
import { SeatBookService } from './seat-book.service';
import { SeatBookDto } from './dto/seatBook.dto';
import { GetUser } from 'src/common/decorators/getUser.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwtAuth.guard';

@Controller('seat-book')
export class SeatBookController {
  constructor(private readonly seatBookingService: SeatBookService) {}

  @Post('/ticket')
  @UseGuards(JwtAuthGuard)
  async bookATicket(@Body() dto: SeatBookDto, @GetUser() user: any) {
    const userId = user.userId;
    return this.seatBookingService.bookSeats(dto, userId);
  }
}
