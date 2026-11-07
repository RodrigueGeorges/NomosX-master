import { NextRequest } from 'next/server';
import { middleware } from '../middleware';

// Mock NextResponse — must be a real (callable) class-like function because
// middleware.ts uses `intlResponse instanceof NextResponse`.
jest.mock('next/server', () => {
  function NextResponse(this: { headers: Map<string, string> }) {
    this.headers = new Map();
  }
  NextResponse.json = jest.fn().mockReturnValue({ status: 200 });
  NextResponse.next = jest.fn(() => new (NextResponse as any)());
  NextResponse.redirect = jest.fn(() => new (NextResponse as any)());
  return { NextRequest: jest.fn(), NextResponse };
});

describe('Security Middleware', () => {
  let mockRequest: Partial<NextRequest>;

  beforeEach(() => {
    mockRequest = {
      method: 'GET',
      nextUrl: { pathname: '/api/test' },
      headers: new Map(),
    };
    jest.clearAllMocks();
  });

  describe('CSRF Protection', () => {
    it('should allow GET requests without CSRF validation', () => {
      mockRequest.method = 'GET';
      mockRequest.nextUrl = { pathname: '/api/test' };
      
      const response = middleware(mockRequest as NextRequest);
      expect(response).toBeDefined();
    });

    it('should allow server-to-server calls with admin key', () => {
      mockRequest.method = 'POST';
      mockRequest.nextUrl = { pathname: '/api/test' };
      mockRequest.headers = new Map([['x-admin-key', 'test-key']]);
      
      const response = middleware(mockRequest as NextRequest);
      expect(response).toBeDefined();
    });

    it('should reject a forged x-admin-key on internal routes', () => {
      process.env.ADMIN_KEY = 'real-admin-key-0123456789';
      mockRequest.method = 'POST';
      mockRequest.nextUrl = { pathname: '/api/cron/generate-briefs' };
      mockRequest.headers = new Map([['x-admin-key', 'forged-key']]);

      const { NextResponse } = require('next/server');
      middleware(mockRequest as NextRequest);

      expect(NextResponse.json).toHaveBeenCalledWith(
        { error: 'CSRF validation failed' },
        { status: 403 }
      );
      delete process.env.ADMIN_KEY;
    });

    it('should allow internal routes with the real ADMIN_KEY', () => {
      process.env.ADMIN_KEY = 'real-admin-key-0123456789';
      mockRequest.method = 'POST';
      mockRequest.nextUrl = { pathname: '/api/cron/generate-briefs' };
      mockRequest.headers = new Map([['x-admin-key', 'real-admin-key-0123456789']]);

      const response = middleware(mockRequest as NextRequest);
      expect(response).toBeDefined();
      delete process.env.ADMIN_KEY;
    });

    it('should allow server-to-server calls with authorization', () => {
      mockRequest.method = 'POST';
      mockRequest.nextUrl = { pathname: '/api/test' };
      mockRequest.headers = new Map([['authorization', 'Bearer token']]);
      
      const response = middleware(mockRequest as NextRequest);
      expect(response).toBeDefined();
    });

    it('should reject API mutations without valid origin', () => {
      mockRequest.method = 'POST';
      mockRequest.nextUrl = { pathname: '/api/test' };
      mockRequest.headers = new Map();
      
      const { NextResponse } = require('next/server');
      const response = middleware(mockRequest as NextRequest);
      
      expect(NextResponse.json).toHaveBeenCalledWith(
        { error: 'CSRF validation failed' },
        { status: 403 }
      );
    });

    it('should allow requests with valid origin', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
      
      mockRequest.method = 'POST';
      mockRequest.nextUrl = { pathname: '/api/test' };
      mockRequest.headers = new Map([['origin', 'http://localhost:3000']]);
      
      const response = middleware(mockRequest as NextRequest);
      expect(response).toBeDefined();
    });
  });

  describe('Security Headers', () => {
    it('should set security headers for all requests', async () => {
      mockRequest.method = 'GET';
      mockRequest.nextUrl = { pathname: '/test' };

      const { NextResponse } = require('next/server');
      const mockNextResponse = new NextResponse();
      NextResponse.next.mockReturnValue(mockNextResponse);

      await middleware(mockRequest as NextRequest);
      
      expect(mockNextResponse.headers.get('X-Frame-Options')).toBe('DENY');
      expect(mockNextResponse.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(mockNextResponse.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
      // X-XSS-Protection is deprecated and intentionally NOT set; modern headers used instead.
      expect(mockNextResponse.headers.get('Strict-Transport-Security')).toContain('max-age=');
      expect(mockNextResponse.headers.get('Permissions-Policy')).toContain('camera=()');
    });

    it('should set CSP header for pages only', async () => {
      mockRequest.method = 'GET';
      mockRequest.nextUrl = { pathname: '/test' };

      const { NextResponse } = require('next/server');
      const mockNextResponse = new NextResponse();
      NextResponse.next.mockReturnValue(mockNextResponse);

      await middleware(mockRequest as NextRequest);
      
      const csp = mockNextResponse.headers.get('Content-Security-Policy');
      expect(csp).toContain("default-src 'self'");
      // CSP intentionally omits 'unsafe-eval' (tighter policy); only 'unsafe-inline' is allowed.
      expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    });

    it('should not set CSP header for API routes', async () => {
      mockRequest.method = 'GET';
      mockRequest.nextUrl = { pathname: '/api/test' };

      const { NextResponse } = require('next/server');
      const mockNextResponse = new NextResponse();
      NextResponse.next.mockReturnValue(mockNextResponse);

      await middleware(mockRequest as NextRequest);
      
      // Header was never set, so Map.get returns undefined (not null).
      expect(mockNextResponse.headers.get('Content-Security-Policy')).toBeUndefined();
    });
  });

  describe('Environment Configuration', () => {
    it('should use environment variables for allowed origins', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://nomosx.com';
      process.env.URL = 'https://app.nomosx.com';
      
      mockRequest.method = 'POST';
      mockRequest.nextUrl = { pathname: '/api/test' };
      mockRequest.headers = new Map([['origin', 'https://nomosx.com']]);
      
      const response = middleware(mockRequest as NextRequest);
      expect(response).toBeDefined();
    });
  });
});
