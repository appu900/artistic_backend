import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { QuerySanitizer } from '../../utils/query-sanitizer';


export const SanitizedQuery = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const query = request.query;

    if (!query) {
      return {};
    }

    if (data) {
      const value = query[data];
      return typeof value === 'object' 
        ? QuerySanitizer.removeMongoOperators(value)
        : value;
    }

    return QuerySanitizer.sanitizeQueryFilters(query);
  },
);


export const SanitizedBody = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const body = request.body;

    if (!body) {
      return {};
    }

    if (data) {
      const value = body[data];
      return typeof value === 'object'
        ? QuerySanitizer.removeMongoOperators(value)
        : value;
    }

    return QuerySanitizer.removeMongoOperators(body);
  },
);


export const SearchParam = createParamDecorator(
  (maxLength: number = 100, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const search = request.query.search || request.query.q || request.query.term;
    
    return QuerySanitizer.sanitizeSearchString(search, maxLength);
  },
);
