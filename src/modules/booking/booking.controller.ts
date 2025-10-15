import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { BookingService } from './booking.service';
import { CreateArtistBookingDto } from './dto/booking.dto';
import { GetUser } from 'src/common/decorators/getUser.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwtAuth.guard';

@Controller('booking')
export class BookingController {
    constructor(private readonly bookingService:BookingService){}
    @Post('/artist')
    @UseGuards(JwtAuthGuard)
    async createArtistBooking(@Body() dto:CreateArtistBookingDto, @GetUser() user:any){
        const userId = user.userId;
        dto.bookedBy = userId;
        return this.bookingService.createArtistBooking(dto)
    }
}
