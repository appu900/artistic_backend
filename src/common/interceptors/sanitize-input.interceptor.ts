import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { QuerySanitizer } from '../../utils/query-sanitizer';


@Injectable()
export class SanitizeInputInterceptor implements NestInterceptor {
  private readonly logger = new Logger(SanitizeInputInterceptor.name);
  private readonly enableLogging: boolean;

  constructor(enableLogging: boolean = false) {
    this.enableLogging = enableLogging;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();

    if (request.query && typeof request.query === 'object') {
      const original = { ...request.query };
      request.query = QuerySanitizer.sanitizeQueryFilters(request.query);
      
      if (this.enableLogging && this.hasOperators(original)) {
        this.logger.warn(
          `Removed MongoDB operators from query params: ${request.method} ${request.url}`,
        );
      }
    }

    if (request.body && typeof request.body === 'object' && !this.isMultipartRequest(request)) {
      const original = { ...request.body };
      request.body = QuerySanitizer.removeMongoOperators(request.body);
      
      if (this.enableLogging && this.hasOperators(original)) {
        this.logger.warn(
          `Removed MongoDB operators from body: ${request.method} ${request.url}`,
        );
      }
    }

    return next.handle();
  }

  
  private isMultipartRequest(request: any): boolean {
    const contentType = request.headers['content-type'] || '';
    return contentType.includes('multipart/form-data');
  }


  private hasOperators(obj: any): boolean {
    if (!obj || typeof obj !== 'object') {
      return false;
    }

    for (const key of Object.keys(obj)) {
      if (key.startsWith('$')) {
        return true;
      }
      if (typeof obj[key] === 'object') {
        if (this.hasOperators(obj[key])) {
          return true;
        }
      }
    }

    return false;
  }
}
