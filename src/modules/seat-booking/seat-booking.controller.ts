import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Delete, 
  Body, 
  Param, 
  Query, 
  UseGuards, 
  Request,
  HttpStatus,
  HttpException
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwtAuth.guard';
import { SeatBookingService, HoldSeatsRequest, HoldTableRequest, ConfirmBookingRequest } from './seat-booking.service';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { HoldSeatsDto, HoldTableDto, ConfirmBookingDto, BookingResponseDto, LayoutResponseDto } from './dto/seat-booking.dto';

@ApiTags('Seat Booking')
@Controller('seat-booking')
export class SeatBookingController {
  constructor(private readonly seatBookingService: SeatBookingService) {}

  /**
   * Hold multiple seats atomically
   * POST /seat-booking/hold-seats
   */
  @Post('hold-seats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Hold multiple seats for booking' })
  @ApiResponse({ status: 201, description: 'Seats successfully held', type: BookingResponseDto })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 409, description: 'Seats already held by another user' })
  async holdSeats(
    @Body() holdRequest: HoldSeatsDto,
    @Request() req: any
  ) {
    try {
      const result = await this.seatBookingService.holdSeats({
        ...holdRequest,
        userId: req.user.id
      });

      return {
        success: result.success,
        message: result.message,
        data: {
          heldSeats: result.heldSeats,
          conflictingSeats: result.conflictingSeats,
          totalAmount: result.totalAmount
        }
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to hold seats',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Hold an entire table and associated seats
   * POST /seat-booking/hold-table
   */
  @Post('hold-table')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Hold entire table with all seats' })
  @ApiResponse({ status: 201, description: 'Table successfully held', type: BookingResponseDto })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 409, description: 'Table or seats already held' })
  async holdTable(
    @Body() holdRequest: HoldTableDto,
    @Request() req: any
  ) {
    try {
      const result = await this.seatBookingService.holdTable({
        ...holdRequest,
        userId: req.user.id
      });

      return {
        success: result.success,
        message: result.message,
        data: {
          heldSeats: result.heldSeats,
          conflictingSeats: result.conflictingSeats,
          totalAmount: result.totalAmount
        }
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to hold table',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Release held seats
   * DELETE /seat-booking/release-seats/:eventId
   */
  @Delete('release-seats/:eventId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Release held seats' })
  @ApiResponse({ status: 200, description: 'Seats released successfully' })
  async releaseSeats(
    @Param('eventId') eventId: string,
    @Query('seatIds') seatIds: string,
    @Request() req: any
  ) {
    try {
      const seatIdsArray = seatIds ? seatIds.split(',') : undefined;
      const result = await this.seatBookingService.releaseSeats(
        eventId, 
        req.user.id, 
        seatIdsArray
      );

      return {
        success: result.success,
        message: result.message
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to release seats',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Confirm booking from held seats
   * POST /seat-booking/confirm
   */
  @Post('confirm')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Confirm booking from held seats' })
  @ApiResponse({ status: 201, description: 'Booking confirmed successfully', type: BookingResponseDto })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 409, description: 'Seats no longer held or invalid' })
  async confirmBooking(
    @Body() confirmRequest: ConfirmBookingDto,
    @Request() req: any
  ) {
    try {
      const result = await this.seatBookingService.confirmBooking({
        ...confirmRequest,
        userId: req.user.id
      });

      return {
        success: result.success,
        message: result.message,
        data: {
          bookingId: result.bookingId,
          totalAmount: result.totalAmount
        }
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to confirm booking',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Get layout with current seat states
   * GET /seat-booking/layout/:eventId
   */
  @Get('layout/:eventId')
  @ApiOperation({ summary: 'Get event layout with real-time seat availability' })
  @ApiResponse({ status: 200, description: 'Layout with seat states retrieved', type: LayoutResponseDto })
  async getLayoutWithStates(
    @Param('eventId') eventId: string,
    @Query('viewport') viewport?: string
  ) {
    try {
      let viewportObj;
      if (viewport) {
        try {
          viewportObj = JSON.parse(viewport);
        } catch (e) {
          throw new HttpException('Invalid viewport format', HttpStatus.BAD_REQUEST);
        }
      }

      const result = await this.seatBookingService.getLayoutWithStates(eventId, viewportObj);

      return {
        success: true,
        data: result
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to get layout',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Get user's booking history
   * GET /seat-booking/my-bookings
   */
  @Get('my-bookings')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user booking history' })
  @ApiResponse({ status: 200, description: 'Booking history retrieved' })
  async getMyBookings(
    @Request() req: any,
    @Query('limit') limit = '20',
    @Query('skip') skip = '0'
  ) {
    try {
      // This would be implemented in the service
      return {
        success: true,
        message: 'Booking history feature - to be implemented',
        data: []
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to get bookings',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Check seat availability
   * GET /seat-booking/availability/:eventId
   */
  @Get('availability/:eventId')
  @ApiOperation({ summary: 'Check seat availability for event' })
  @ApiResponse({ status: 200, description: 'Availability information retrieved' })
  async checkAvailability(
    @Param('eventId') eventId: string,
    @Query('seatIds') seatIds?: string
  ) {
    try {
      const seatIdsArray = seatIds ? seatIds.split(',') : [];
      
      // This would call a service method to check availability
      return {
        success: true,
        message: 'Availability check feature - to be implemented',
        data: {
          eventId,
          requestedSeats: seatIdsArray,
          availability: {}
        }
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to check availability',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Get booking statistics for event (admin only)
   * GET /seat-booking/stats/:eventId
   */
  @Get('stats/:eventId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get booking statistics for event' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved' })
  async getEventStats(@Param('eventId') eventId: string) {
    try {
      // This would call service method and check admin permissions
      return {
        success: true,
        message: 'Event statistics feature - to be implemented',
        data: {
          eventId,
          totalSeats: 0,
          bookedSeats: 0,
          heldSeats: 0,
          availableSeats: 0,
          revenue: 0
        }
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to get statistics',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}