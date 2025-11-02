import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { SeatBookDto } from './dto/seatBook.dto';
import { GetUser } from 'src/common/decorators/getUser.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwtAuth.guard';
import { seatBookingService } from './seat-book.service';
import { TableBookDto } from './dto/tableBooking.dto';
import { TableBookSearvice } from './table-book.service';

@Controller('seat-book')
export class SeatBookController {
  constructor(private readonly seatBookingService: seatBookingService,private readonly tableBookingService:TableBookSearvice) {}

  @Post('/ticket')
  @UseGuards(JwtAuthGuard)
  async bookATicket(@Body() dto: SeatBookDto, @GetUser() user: any) {
    const userId = user.userId;
    const userEmail = user.email;
    return this.seatBookingService.bookSeat(dto, userId, userEmail);
  }

  @Post('/table')
  @UseGuards(JwtAuthGuard)
  async bookTable(@Body() dto: TableBookDto, @GetUser() user: any) {
    const userId = user.userId;
    const userEmail = user.email;
    return this.tableBookingService.bookTable(dto, userId, userEmail);
  }
}
