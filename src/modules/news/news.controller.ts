import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiConsumes,
} from '@nestjs/swagger';
import { NewsService } from './news.service';
import { CreateNewsPostDto, UpdateNewsPostDto, ReviewNewsPostDto } from './dto/news.dto';
import { JwtAuthGuard } from '../../common/guards/jwtAuth.guard';
import { RolesGuard } from '../../common/guards/roles.guards';
import { Roles } from '../../common/decorators/roles.decorator';
import { GetUser } from '../../common/decorators/getUser.decorator';
import { UserRole } from '../../common/enums/roles.enum';
import { PostType, PostStatus } from '../../infrastructure/database/schemas/news-post.schema';

@ApiTags('News & Announcements')
@Controller('news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  // ─── Public feed ─────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Get published news/announcements feed (public)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'type', required: false, enum: PostType })
  async getFeed(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('type') type?: PostType,
  ) {
    const result = await this.newsService.getPublishedFeed(page, limit, type);
    return { message: 'Feed fetched successfully', ...result };
  }

  @Get('public/:id')
  @ApiOperation({ summary: 'Get a single published post by ID (public)' })
  @ApiResponse({ status: 404, description: 'Post not found' })
  async getById(@Param('id') id: string) {
    const post = await this.newsService.getPublishedById(id);
    return { message: 'Post fetched successfully', post };
  }

  // ─── Authenticated author routes ─────────────────────────────────────────────

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.ARTIST)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Create a news post (Admin = auto-published; Artist = pending approval)',
  })
  @UseInterceptors(FileInterceptor('coverFile'))
  async create(
    @GetUser() user: { userId: string; role: string },
    @Body() dto: CreateNewsPostDto,
    @UploadedFile() coverFile?: Express.Multer.File,
  ) {
    const post = await this.newsService.create(user.userId, user.role, dto, coverFile);
    return { message: 'Post created successfully', post };
  }

  @Get('my-posts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.ARTIST)
  @ApiBearerAuth()
  @ApiOperation({ summary: "List the authenticated user's own posts" })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getMyPosts(
    @GetUser() user: { userId: string },
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    const result = await this.newsService.getMyPosts(user.userId, page, limit);
    return { message: 'Posts fetched successfully', ...result };
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.ARTIST)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Update a post (author or admin; artist can only edit draft/rejected)' })
  @UseInterceptors(FileInterceptor('coverFile'))
  async update(
    @Param('id') id: string,
    @GetUser() user: { userId: string; role: string },
    @Body() dto: UpdateNewsPostDto,
    @UploadedFile() coverFile?: Express.Multer.File,
  ) {
    const post = await this.newsService.update(id, user.userId, user.role, dto, coverFile);
    return { message: 'Post updated successfully', post };
  }

  @Post(':id/submit')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.ARTIST)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit a draft for publication (artist → pending; admin → live)' })
  async submit(
    @Param('id') id: string,
    @GetUser() user: { userId: string; role: string },
  ) {
    const post = await this.newsService.publishDraft(id, user.userId, user.role);
    return { message: 'Post submitted successfully', post };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.ARTIST)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a post (author or admin)' })
  async remove(
    @Param('id') id: string,
    @GetUser() user: { userId: string; role: string },
  ) {
    await this.newsService.remove(id, user.userId, user.role);
    return { message: 'Post deleted successfully' };
  }

  // ─── Admin-only routes ────────────────────────────────────────────────────────

  @Get('admin/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: list all posts with optional status/type filter' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: PostStatus })
  @ApiQuery({ name: 'type', required: false, enum: PostType })
  async adminListAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('status') status?: PostStatus,
    @Query('type') type?: PostType,
  ) {
    const result = await this.newsService.getAllPostsAdmin(page, limit, status, type);
    return { message: 'Posts fetched successfully', ...result };
  }

  @Get('admin/pending')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: list posts pending approval' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getPending(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    const result = await this.newsService.getPendingPosts(page, limit);
    return { message: 'Pending posts fetched successfully', ...result };
  }

  @Post('admin/:id/review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Admin: approve or reject an artist post',
    description: 'Set approve=true to publish, false to reject (rejectionReason required on reject)',
  })
  @ApiResponse({ status: 400, description: 'Post is not pending or missing rejection reason' })
  async review(
    @Param('id') id: string,
    @GetUser() admin: { userId: string },
    @Body() dto: ReviewNewsPostDto,
  ) {
    const post = await this.newsService.review(id, admin.userId, dto);
    const action = dto.approve ? 'approved and published' : 'rejected';
    return { message: `Post ${action} successfully`, post };
  }
}
