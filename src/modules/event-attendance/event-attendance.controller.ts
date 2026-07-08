import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/guards/jwtAuth.guard';
import { RolesGuard } from 'src/common/guards/roles.guards';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from 'src/common/enums/roles.enum';
import { DatabasePrimaryValidation } from 'src/utils/validateMongoId';
import { EventAttendanceService } from './event-attendance.service';
import {
  CreateAttendancePortalDto,
  UpdateAttendancePortalDto,
  VerifyAttendancePinDto,
} from './dto/event-attendance.dto';

@Controller('events')
export class EventAttendanceController {
  constructor(private readonly attendanceService: EventAttendanceService) {}

  private authUser(req: any) {
    const userId = String(req?.user?.userId || req?.user?.id || req?.user?._id || '');
    const role = String(req?.user?.role || 'user');
    return { userId, role };
  }

  private clientIp(req: any): string {
    const forwarded = req?.headers?.['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
      return forwarded.split(',')[0].trim();
    }
    return String(req?.ip || req?.socket?.remoteAddress || 'unknown');
  }

  // ─── Public portal (PIN + session) — static paths BEFORE :eventId ───

  @Post('attendance/portal/:token/verify-pin')
  async verifyPin(
    @Param('token') token: string,
    @Body() dto: VerifyAttendancePinDto,
    @Req() req: any,
  ) {
    return this.attendanceService.verifyPin(token, dto, this.clientIp(req));
  }

  @Post('attendance/portal/:token/scan')
  async scanQr(
    @Param('token') token: string,
    @Headers('x-attendance-session') sessionToken: string,
    @Req() req: any,
  ) {
    const qrPayload = req?.body?.qrPayload;
    if (
      qrPayload === undefined ||
      qrPayload === null ||
      (typeof qrPayload === 'string' && !qrPayload.trim())
    ) {
      throw new BadRequestException('qrPayload is required');
    }
    return this.attendanceService.scanTicket(
      token,
      sessionToken,
      qrPayload as string | Record<string, any>,
    );
  }

  @Get('attendance/portal/:token/stats')
  async portalStats(
    @Param('token') token: string,
    @Headers('x-attendance-session') sessionToken: string,
  ) {
    return this.attendanceService.getPortalStats(token, sessionToken);
  }

  // ─── Authenticated: venue owner / admin ─────────────────────────────

  @Get(':eventId/attendance')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.VENUE_OWNER)
  async getAttendanceDashboard(@Param('eventId') eventId: string, @Req() req: any) {
    if (!DatabasePrimaryValidation.validateIds(eventId)) {
      throw new BadRequestException('Invalid event ID');
    }
    const { userId, role } = this.authUser(req);
    return this.attendanceService.getEventAttendanceDashboard(eventId, userId, role);
  }

  @Post(':eventId/attendance-portal')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.VENUE_OWNER)
  async createPortal(
    @Param('eventId') eventId: string,
    @Body() dto: CreateAttendancePortalDto,
    @Req() req: any,
  ) {
    if (!DatabasePrimaryValidation.validateIds(eventId)) {
      throw new BadRequestException('Invalid event ID');
    }
    const { userId, role } = this.authUser(req);
    return this.attendanceService.createOrRegeneratePortal(eventId, userId, role, dto);
  }

  @Patch(':eventId/attendance-portal')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.VENUE_OWNER)
  async updatePortal(
    @Param('eventId') eventId: string,
    @Body() dto: UpdateAttendancePortalDto,
    @Req() req: any,
  ) {
    if (!DatabasePrimaryValidation.validateIds(eventId)) {
      throw new BadRequestException('Invalid event ID');
    }
    const { userId, role } = this.authUser(req);
    return this.attendanceService.updatePortal(eventId, userId, role, dto);
  }
}
