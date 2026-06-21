import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  NewsPost,
  NewsPostDocument,
  PostStatus,
  PostAuthorRole,
  PostType,
} from '../../infrastructure/database/schemas/news-post.schema';import { UserRole } from '../../common/enums/roles.enum';
import {
  CreateNewsPostDto,
  UpdateNewsPostDto,
  ReviewNewsPostDto,
} from './dto/news.dto';
import { S3Service } from '../../infrastructure/s3/s3.service';

@Injectable()
export class NewsService {
  constructor(
    @InjectModel(NewsPost.name)
    private readonly newsPostModel: Model<NewsPostDocument>,
    private readonly s3Service: S3Service,
  ) {}

  async create(
    userId: string,
    userRole: string,
    dto: CreateNewsPostDto,
    coverFile?: Express.Multer.File,
  ): Promise<NewsPostDocument> {
    let coverImage: string | undefined;

    if (coverFile) {
      coverImage = await this.s3Service.uploadFile(coverFile, 'news-covers');
    }

    const isAdmin =
      userRole === UserRole.ADMIN || userRole === UserRole.SUPER_ADMIN;

    const status = isAdmin ? PostStatus.PUBLISHED : PostStatus.PENDING_APPROVAL;
    const authorRole = isAdmin ? PostAuthorRole.ADMIN : PostAuthorRole.ARTIST;
    const publishedAt = isAdmin ? new Date() : null;

    const post = await this.newsPostModel.create({
      ...dto,
      coverImage,
      author: new Types.ObjectId(userId),
      authorRole,
      status,
      publishedAt,
    });

    return post;
  }

  async getPublishedFeed(
    page: number,
    limit: number,
    type?: PostType,
  ): Promise<{ posts: any[]; total: number; pages: number }> {
    const filter: Record<string, any> = { status: PostStatus.PUBLISHED };
    if (type) filter.type = type;

    const skip = (page - 1) * limit;
    const [posts, total] = await Promise.all([
      this.newsPostModel
        .find(filter)
        .sort({ publishedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('author', 'firstName lastName profilePicture')
        .lean(),
      this.newsPostModel.countDocuments(filter),
    ]);

    return { posts, total, pages: Math.ceil(total / limit) };
  }

  async getPublishedById(id: string): Promise<any> {
    this.validateId(id);
    const post = await this.newsPostModel
      .findOne({ _id: id, status: PostStatus.PUBLISHED })
      .populate('author', 'firstName lastName profilePicture')
      .lean();

    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  async getMyPosts(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ posts: any[]; total: number; pages: number }> {
    const filter = { author: new Types.ObjectId(userId) };
    const skip = (page - 1) * limit;
    const [posts, total] = await Promise.all([
      this.newsPostModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.newsPostModel.countDocuments(filter),
    ]);
    return { posts, total, pages: Math.ceil(total / limit) };
  }

  async getPendingPosts(
    page: number,
    limit: number,
  ): Promise<{ posts: any[]; total: number; pages: number }> {
    const filter = { status: PostStatus.PENDING_APPROVAL };
    const skip = (page - 1) * limit;
    const [posts, total] = await Promise.all([
      this.newsPostModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('author', 'firstName lastName email')
        .lean(),
      this.newsPostModel.countDocuments(filter),
    ]);
    return { posts, total, pages: Math.ceil(total / limit) };
  }

  async getAllPostsAdmin(
    page: number,
    limit: number,
    status?: PostStatus,
    type?: PostType,
  ): Promise<{ posts: any[]; total: number; pages: number }> {
    const filter: Record<string, any> = {};
    if (status) filter.status = status;
    if (type) filter.type = type;

    const skip = (page - 1) * limit;
    const [posts, total] = await Promise.all([
      this.newsPostModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('author', 'firstName lastName email')
        .populate('reviewedBy', 'firstName lastName')
        .lean(),
      this.newsPostModel.countDocuments(filter),
    ]);
    return { posts, total, pages: Math.ceil(total / limit) };
  }

  async update(
    id: string,
    userId: string,
    userRole: string,
    dto: UpdateNewsPostDto,
    coverFile?: Express.Multer.File,
  ): Promise<NewsPostDocument> {
    this.validateId(id);
    const post = await this.newsPostModel.findById(id);
    if (!post) throw new NotFoundException('Post not found');

    const isAdmin =
      userRole === UserRole.ADMIN || userRole === UserRole.SUPER_ADMIN;
    const isOwner = post.author.toString() === userId;

    if (!isAdmin && !isOwner) throw new ForbiddenException('Access denied');

    if (
      !isAdmin &&
      post.status !== PostStatus.DRAFT &&
      post.status !== PostStatus.REJECTED
    ) {
      throw new BadRequestException(
        'You can only edit draft or rejected posts',
      );
    }

    if (coverFile) {
      if (post.coverImage) {
        await this.s3Service.deleteFile(post.coverImage).catch(() => null);
      }
      post.coverImage = await this.s3Service.uploadFile(coverFile, 'news-covers');
    }

    if (!isAdmin && post.status === PostStatus.REJECTED) {
      (post as any).status = PostStatus.PENDING_APPROVAL;
      post.rejectionReason = null;
    }

    Object.assign(post, dto);
    return post.save();
  }

  async review(
    id: string,
    adminId: string,
    dto: ReviewNewsPostDto,
  ): Promise<NewsPostDocument> {
    this.validateId(id);
    const post = await this.newsPostModel.findById(id);
    if (!post) throw new NotFoundException('Post not found');

    if (post.status !== PostStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Post is not pending approval');
    }

    if (!dto.approve && !dto.rejectionReason) {
      throw new BadRequestException('Rejection reason is required');
    }

    post.status = dto.approve ? PostStatus.PUBLISHED : PostStatus.REJECTED;
    post.reviewedBy = new Types.ObjectId(adminId);
    post.rejectionReason = dto.approve ? null : (dto.rejectionReason ?? null);
    post.publishedAt = dto.approve ? new Date() : null;

    return post.save();
  }

  async publishDraft(id: string, userId: string, userRole: string): Promise<NewsPostDocument> {
    this.validateId(id);
    const post = await this.newsPostModel.findById(id);
    if (!post) throw new NotFoundException('Post not found');

    const isAdmin =
      userRole === UserRole.ADMIN || userRole === UserRole.SUPER_ADMIN;
    const isOwner = post.author.toString() === userId;

    if (!isAdmin && !isOwner) throw new ForbiddenException('Access denied');
    if (post.status !== PostStatus.DRAFT) {
      throw new BadRequestException('Only draft posts can be published directly');
    }

    if (isAdmin) {
      post.status = PostStatus.PUBLISHED;
      post.publishedAt = new Date();
    } else {
      post.status = PostStatus.PENDING_APPROVAL;
    }

    return post.save();
  }

  async remove(id: string, userId: string, userRole: string): Promise<void> {
    this.validateId(id);
    const post = await this.newsPostModel.findById(id);
    if (!post) throw new NotFoundException('Post not found');

    const isAdmin =
      userRole === UserRole.ADMIN || userRole === UserRole.SUPER_ADMIN;
    const isOwner = post.author.toString() === userId;

    if (!isAdmin && !isOwner) throw new ForbiddenException('Access denied');

    if (post.coverImage) {
      await this.s3Service.deleteFile(post.coverImage).catch(() => null);
    }

    await this.newsPostModel.findByIdAndDelete(id);
  }

  private validateId(id: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid post ID');
    }
  }
}
