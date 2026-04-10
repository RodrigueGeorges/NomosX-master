import { z } from 'zod';
import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, rateLimitConfigs } from './security';
import { getSession } from './auth';

// Re-export rateLimitConfigs for backward compatibility
export { rateLimitConfigs };

// Generic validation middleware
export function withValidation<T>(
  schema: z.ZodSchema<T>,
  handler: (data: T, req: NextRequest) => Promise<NextResponse>
) {
  return async (req: NextRequest) => {
    try {
      const body = await req.json();
      const validated = schema.parse(body);
      return await handler(validated, req);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { 
            error: 'Validation failed', 
            details: error.errors.map(err => ({
              field: err.path.join('.'),
              message: err.message
            }))
          }, 
          { status: 400 }
        );
      }
      
      return NextResponse.json(
        { error: 'Invalid request format' },
        { status: 400 }
      );
    }
  };
}

// Rate limiting middleware
export function withRateLimit(
  config: { windowMs?: number; maxRequests?: number } = {},
  handler: (req: NextRequest) => Promise<NextResponse>
) {
  return async (req: NextRequest) => {
    const limiter = rateLimit(config);
    const result = limiter(req);
    
    if (!result.success) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Limit': config.maxRequests?.toString() || '100',
            'X-RateLimit-Remaining': result.remaining.toString(),
            'X-RateLimit-Reset': result.resetTime.toString(),
          }
        }
      );
    }
    
    const response = await handler(req);
    
    // Add rate limit headers to response
    response.headers.set('X-RateLimit-Limit', config.maxRequests?.toString() || '100');
    response.headers.set('X-RateLimit-Remaining', result.remaining.toString());
    response.headers.set('X-RateLimit-Reset', result.resetTime.toString());
    
    return response;
  };
}

// Authentication middleware — validates cookie-based JWT session
export function withAuth(
  handler: (req: NextRequest, userId: string) => Promise<NextResponse>
) {
  return async (req: NextRequest) => {
    try {
      const session = await getSession();
      if (!session?.id) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }
      return await handler(req, session.id);
    } catch (error) {
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 401 }
      );
    }
  };
}

// Combined middleware: auth + validation (accepts 2 or 3 arg handlers)
export function withValidationAndAuth<T>(
  schema: z.ZodSchema<T>,
  handler: (data: T, req: NextRequest, userId: string) => Promise<NextResponse>
): (req: NextRequest) => Promise<NextResponse>;
export function withValidationAndAuth<T>(
  schema: z.ZodSchema<T>,
  _rateLimitConfig: { windowMs?: number; maxRequests?: number },
  handler: (data: T, req: NextRequest, userId: string) => Promise<NextResponse>
): (req: NextRequest) => Promise<NextResponse>;
export function withValidationAndAuth<T>(
  schema: z.ZodSchema<T>,
  handlerOrConfig: any,
  handlerArg?: any
): (req: NextRequest) => Promise<NextResponse> {
  const handler: (data: T, req: NextRequest, userId: string) => Promise<NextResponse> =
    typeof handlerOrConfig === 'function' ? handlerOrConfig : handlerArg;
  return withAuth(async (req, userId) => {
    return withValidation(schema, async (data, req) => {
      return await handler(data, req, userId);
    })(req);
  });
}

export function withRateLimitAndValidation<T>(
  schema: z.ZodSchema<T>,
  rateLimitConfig: { windowMs?: number; maxRequests?: number } = {},
  handler: (data: T, req: NextRequest) => Promise<NextResponse>
) {
  return withRateLimit(rateLimitConfig, withValidation(schema, handler));
}

export function withAll<T>(
  schema: z.ZodSchema<T>,
  rateLimitConfig: { windowMs?: number; maxRequests?: number } = {},
  handler: (data: T, req: NextRequest, userId: string) => Promise<NextResponse>
) {
  return async (req: NextRequest) => {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    return withRateLimitAndValidation(schema, rateLimitConfig, (data, req) =>
      handler(data, req, session.id)
    )(req);
  };
}

// Common validation schemas
export const commonSchemas = {
  pagination: z.object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
    sort: z.string().optional(),
    order: z.enum(['asc', 'desc']).default('desc'),
  }),
  
  search: z.object({
    q: z.string().min(1).max(100),
    type: z.string().optional(),
    category: z.string().optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
  }),
  
  id: z.object({
    id: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/, 'Invalid ID format'),
  }),
  
  slug: z.object({
    slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Invalid slug format'),
  }),
};

// Error handling utilities
export class ValidationError extends Error {
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends Error {
  constructor(message = 'Authentication failed') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error {
  constructor(message = 'Insufficient permissions') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class RateLimitError extends Error {
  constructor(message = 'Rate limit exceeded') {
    super(message);
    this.name = 'RateLimitError';
  }
}

// Response utilities
export const createSuccessResponse = <T>(data: T, message?: string) => {
  return NextResponse.json({
    success: true,
    data,
    message,
  });
};

export const createErrorResponse = (error: string, status = 500, details?: any) => {
  return NextResponse.json({
    success: false,
    error,
    details,
  }, { status });
};

export const createValidationErrorResponse = (errors: z.ZodIssue[]) => {
  return NextResponse.json({
    success: false,
    error: 'Validation failed',
    details: errors.map(err => ({
      field: err.path.join('.'),
      message: err.message
    }))
  }, { status: 400 });
};

// Common schemas
export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export const ContactSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  subject: z.string().min(5),
  message: z.string().min(10)
});

export const CreateBriefSchema = z.object({
  question: z.string().min(10),
  type: z.enum(['brief', 'strategic']).default('brief')
});

export const SubscriptionSchema = z.object({
  targetPlan: z.enum(['RESEARCHER', 'STUDIO', 'EXECUTIVE', 'STRATEGY']),
});

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2).optional(),
});
