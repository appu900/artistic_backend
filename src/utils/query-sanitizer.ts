import { BadRequestException } from '@nestjs/common';


export class QuerySanitizer {
 
  static sanitizeRegex(input: string, maxLength: number = 100): string {
    if (!input || typeof input !== 'string') {
      return '';
    }

    if (input.length > maxLength) {
      throw new BadRequestException(`Search term too long (max ${maxLength} characters)`);
    }

    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  static createSafeRegex(input: string, options: string = 'i', maxLength: number = 100): RegExp {
    const sanitized = this.sanitizeRegex(input, maxLength);
    return new RegExp(sanitized, options);
  }


  static removeMongoOperators(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.removeMongoOperators(item));
    }

    if (typeof obj === 'object') {
      const cleaned: any = {};
      for (const [key, value] of Object.entries(obj)) {
        // Skip keys that start with $ (MongoDB operators)
        if (key.startsWith('$')) {
          continue;
        }
        cleaned[key] = this.removeMongoOperators(value);
      }
      return cleaned;
    }

    return obj;
  }

  
  static sanitizeQueryFilters(filters: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(filters)) {
      // Skip if undefined or null
      if (value === undefined || value === null) {
        continue;
      }

      // Remove operator-based keys
      if (key.startsWith('$')) {
        continue;
      }

      // Sanitize the value
      if (typeof value === 'object' && !Array.isArray(value)) {
        sanitized[key] = this.removeMongoOperators(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  static sanitizeSearchString(search: string | undefined, maxLength: number = 100): string | undefined {
    if (!search) {
      return undefined;
    }

    if (typeof search !== 'string') {
      throw new BadRequestException('Search must be a string');
    }

    const trimmed = search.trim();
    
    if (trimmed.length === 0) {
      return undefined;
    }

    if (trimmed.length > maxLength) {
      throw new BadRequestException(`Search term too long (max ${maxLength} characters)`);
    }

    return trimmed;
  }

  static createSafeSearchQuery(search: string, fields: string[]): any {
    const sanitized = this.sanitizeSearchString(search);
    
    if (!sanitized) {
      return {};
    }

    const regex = this.createSafeRegex(sanitized);
    
    return {
      $or: fields.map(field => ({ [field]: regex }))
    };
  }

 
  static sanitizePagination(page?: number | string, limit?: number | string): { page: number; limit: number; skip: number } {
    const parsedPage = typeof page === 'string' ? parseInt(page, 10) : page;
    const parsedLimit = typeof limit === 'string' ? parseInt(limit, 10) : limit;

    const validPage = Math.max(1, parsedPage || 1);
    const validLimit = Math.max(1, Math.min(parsedLimit || 10, 100)); // Max 100 items per page

    return {
      page: validPage,
      limit: validLimit,
      skip: (validPage - 1) * validLimit
    };
  }

  static validateStringLength(value: string, fieldName: string, min: number = 0, max: number = 1000): void {
    if (value.length < min) {
      throw new BadRequestException(`${fieldName} must be at least ${min} characters`);
    }
    if (value.length > max) {
      throw new BadRequestException(`${fieldName} must not exceed ${max} characters`);
    }
  }
}


export function sanitizeRegexInput(input: string | undefined, maxLength: number = 100): RegExp | undefined {
  if (!input) return undefined;
  return QuerySanitizer.createSafeRegex(input, 'i', maxLength);
}


export function createSafeSearchFilter(search: string | undefined, fields: string[]): any {
  if (!search) return {};
  return QuerySanitizer.createSafeSearchQuery(search, fields);
}


export function removeOperators(obj: any): any {
  return QuerySanitizer.removeMongoOperators(obj);
}
